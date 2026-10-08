import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rankingMetrics, summarize, validateFixture, validateHeldout, snapshotRuntime, verifyRuntimeSnapshot, statusHeadingBaseline } from '../../../qa/scripts/recall-evaluation.mjs';

test('ranking metrics handle first, fifth, missing and out-of-cutoff answers', () => {
  assert.deepEqual(rankingMetrics(['answer'], 'answer'), { hit1: 1, hit5: 1, mrr10: 1, ndcg5: 1 });
  assert.equal(rankingMetrics(['a', 'b', 'c', 'd', 'answer'], 'answer').ndcg5, 1 / Math.log2(6));
  assert.deepEqual(rankingMetrics([], 'answer'), { hit1: 0, hit5: 0, mrr10: 0, ndcg5: 0 });
  assert.equal(rankingMetrics(Array.from({ length: 11 }, (_, i) => String(i)), '10').mrr10, 0);
});

test('summary separates candidate misses from conditional ranking and includes fallback latency', () => {
  const rows = [{ target: 'x', localPaths: ['x'], rankedPaths: ['x'], localMs: 10, rerankMs: 20 },
    { target: 'x', localPaths: ['y'], rankedPaths: ['y'], localMs: 30, rerankMs: 40 }];
  const result = summarize(rows, 'rankedPaths');
  assert.equal(result.hitAt5, 0.5);
  assert.equal(result.candidateRecallAt10, 0.5);
  assert.equal(result.candidateMisses, 1);
  assert.equal(result.conditionalHitAt5, 1);
  assert.equal(result.p95Ms, 70);
  const expanded = [{ ...rows[1], candidatePaths: ['y', 'x'], rankedPaths: ['x'] }];
  assert.equal(summarize(expanded, 'rankedPaths', 20).candidateRecallAt20, 1);
  assert.equal(summarize(expanded, 'localPaths', 20).hitAt5, 0);
});

test('synthetic fixture has 50 labeled questions, unique safe ids and no identical current/obsolete decisions', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../../qa/fixtures/recall-evaluation.json', import.meta.url), 'utf8'));
  assert.equal(validateFixture(fixture).topics.length * 2, 50);
  const bad = structuredClone(fixture); bad.topics[0].id = '../escape';
  assert.throws(() => validateFixture(bad));
  const duplicate = structuredClone(fixture); duplicate.topics[1].id = duplicate.topics[0].id;
  assert.throws(() => validateFixture(duplicate));
  const repeated = structuredClone(fixture); repeated.topics[0].queries[1] = repeated.topics[0].queries[0] + ' ';
  assert.throws(() => validateFixture(repeated));
  const stringQueries = structuredClone(fixture); stringQueries.topics[24].queries = 'AB';
  assert.throws(() => validateFixture(stringQueries));
  const blankAnswer = structuredClone(fixture); blankAnswer.topics[0].current = ' \n ';
  assert.throws(() => validateFixture(blankAnswer));
  const stringTopics = structuredClone(fixture); stringTopics.topics = 'x'.repeat(25);
  assert.throws(() => validateFixture(stringTopics));
});

test('live evaluation rejects missing approval and unknown flags before invoking any provider', () => {
  const script = fileURLToPath(new URL('../../../qa/scripts/recall-evaluation.mjs', import.meta.url));
  for (const args of [['--jev'], ['--allow-billed-test'], ['--unknown']]) {
    const child = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(child.status, 1);
    assert(!child.stderr.includes('Evaluation:'));
  }
});

test('held-out queries cover every topic without repeating a training query', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../../qa/fixtures/recall-evaluation.json', import.meta.url), 'utf8'));
  const queries = JSON.parse(await readFile(new URL('../../../qa/fixtures/recall-evaluation-heldout.json', import.meta.url), 'utf8'));
  assert.equal(Object.values(validateHeldout(queries, fixture)).flat().length, 50);
  const leaked = structuredClone(queries); leaked['retry-queue'][0] = fixture.topics[0].queries[0];
  assert.throws(() => validateHeldout(leaked, fixture));
  for (const variation of [fixture.topics[0].queries[0] + ' ', fixture.topics[0].queries[1].toUpperCase(), fixture.topics[0].queries[0].replaceAll(' ', '\u3000')]) {
    const normalizedLeak = structuredClone(queries); normalizedLeak['retry-queue'][0] = variation;
    assert.throws(() => validateHeldout(normalizedLeak, fixture));
  }
  const repeated = structuredClone(queries); repeated['retry-queue'][1] = repeated['retry-queue'][0] + '\n';
  assert.throws(() => validateHeldout(repeated, fixture));
  const stringQueries = structuredClone(queries); stringQueries['request-timeout'] = 'AB';
  assert.throws(() => validateHeldout(stringQueries, fixture));
});

test('runtime snapshot covers shared helpers and refuses changed source or copied code', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omob-snapshot-test-'));
  try {
    const source = join(root, 'source');
    const names = ['vault-ops.mjs', 'vault-core.mjs', 'auto-session-recovery.mjs', 'auto-session-safety.mjs', 'jev.mjs', 'jev-credential.ps1'];
    for (const name of names) {
      const path = join(source, 'plugins/oh-my-obsidian/scripts', name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, 'original fixture');
    }
    const snapshot = await snapshotRuntime(source, join(root, 'snapshot'));
    assert.equal(Object.keys(snapshot.hashes).length, 6);
    await assert.rejects(verifyRuntimeSnapshot(source, { ...snapshot, hashes: {} }));
    for (const name of ['vault-core.mjs', 'auto-session-safety.mjs']) {
      const path = join(source, 'plugins/oh-my-obsidian/scripts', name);
      await writeFile(path, 'changed fixture');
      await assert.rejects(verifyRuntimeSnapshot(source, snapshot));
      assert.equal(await readFile(join(snapshot.directory, name), 'utf8'), 'original fixture');
      await writeFile(path, 'original fixture');
    }
    await verifyRuntimeSnapshot(source, snapshot);
    await writeFile(join(snapshot.directory, 'vault-core.mjs'), 'tampered snapshot');
    await assert.rejects(verifyRuntimeSnapshot(source, snapshot));
  } finally {
    assert(root.startsWith(join(tmpdir(), 'omob-snapshot-test-')));
    await rm(root, { recursive: true, force: true });
  }
});

test('snapshot checks reject same-byte module symlinks rather than following redirected imports', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'omob-snapshot-link-test-'));
  try {
    const source = fileURLToPath(new URL('../../../', import.meta.url));
    const snapshot = await snapshotRuntime(source, join(root, 'snapshot'));
    const target = join(snapshot.directory, 'jev.mjs');
    const outside = join(root, 'outside.mjs');
    await writeFile(outside, await readFile(target));
    await unlink(target);
    try { await symlink(outside, target); }
    catch (error) {
      if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('File symlinks unavailable for this OS account'); return; }
      throw error;
    }
    await assert.rejects(verifyRuntimeSnapshot(source, snapshot));
  } finally {
    assert(root.startsWith(join(tmpdir(), 'omob-snapshot-link-test-')));
    await rm(root, { recursive: true, force: true });
  }
});

test('status-heading baseline uses visible evidence, not gold filenames or query labels', () => {
  const rows = [{ path: 'misleading-current.md', excerpt: '# Superseded decision\nold' },
    { path: 'unrelated-name.md', excerpt: '# Active decision\nnew' },
    { path: 'example.md', excerpt: '# Superseded decision\n```md\n# Active decision\n```' },
    { path: 'code.md', excerpt: '    # Active decision\ncode example' },
    { path: 'split.md', excerpt: '#\nActive decision' }];
  assert.deepEqual(statusHeadingBaseline(rows), ['unrelated-name.md']);
  assert.deepEqual(statusHeadingBaseline([{ path: 'indent.md', excerpt: '\n   # Active decision\nnew' }]), ['indent.md']);
});

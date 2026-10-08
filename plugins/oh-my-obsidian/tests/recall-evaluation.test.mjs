import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rankingMetrics, summarize, validateFixture, validateHeldout } from '../../../qa/scripts/recall-evaluation.mjs';

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
});

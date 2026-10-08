import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const repo = resolve(import.meta.dirname, '../..');
const fixtureFile = join(repo, 'qa/fixtures/recall-evaluation.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const runnerHash = hash(await readFile(fileURLToPath(import.meta.url)));
const runtimeFiles = ['vault-ops.mjs', 'vault-core.mjs', 'auto-session-recovery.mjs', 'auto-session-safety.mjs', 'jev.mjs', 'jev-credential.ps1'];
const canonicalQuery = query => query.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

export async function snapshotRuntime(sourceRoot, directory) {
  await mkdir(directory, { mode: 0o700 });
  const hashes = {};
  for (const name of runtimeFiles) {
    const path = `plugins/oh-my-obsidian/scripts/${name}`;
    assert((await lstat(join(sourceRoot, path))).isFile(), 'Runtime input must be a regular file');
    const bytes = await readFile(join(sourceRoot, path));
    hashes[path] = hash(bytes);
    await writeFile(join(directory, name), bytes, { flag: 'wx', mode: 0o600 });
  }
  const snapshot = { directory, hashes };
  await verifyRuntimeSnapshot(sourceRoot, snapshot);
  return snapshot;
}

export async function verifyRuntimeSnapshot(sourceRoot, snapshot) {
  assert.deepEqual(Object.keys(snapshot.hashes).sort(), runtimeFiles.map(name => `plugins/oh-my-obsidian/scripts/${name}`).sort(), 'Incomplete runtime fingerprint set');
  for (const [path, expected] of Object.entries(snapshot.hashes)) {
    for (const target of [join(sourceRoot, path), join(snapshot.directory, path.split('/').at(-1))]) {
      assert((await lstat(target)).isFile(), 'Runtime dependency must remain a regular file');
      assert.equal(hash(await readFile(target)), expected, 'Runtime source or snapshot changed; discard this run');
    }
  }
}

export function validateFixture(data) {
  assert(data && typeof data === 'object' && !Array.isArray(data));
  assert.equal(data.schema, 'oh-my-obsidian/recall-evaluation/v1');
  assert(Array.isArray(data.topics), 'Topics must be an array');
  assert.equal(data.topics.length, 25, 'Keep the approved evaluation bounded to 50 queries');
  const ids = new Set();
  const questions = new Set();
  for (const topic of data.topics) {
    assert(topic && typeof topic === 'object' && !Array.isArray(topic));
    assert.match(topic.id, /^[a-z][a-z0-9-]{0,63}$/);
    assert(!ids.has(topic.id)); ids.add(topic.id);
    for (const text of [topic.current, topic.obsolete]) assert(typeof text === 'string' && text.trim().length > 0 && text.length <= 4000);
    assert.notEqual(topic.current, topic.obsolete);
    assert(Array.isArray(topic.queries), 'Questions must be an array');
    assert.equal(topic.queries.length, 2);
    for (const query of topic.queries) {
      assert(typeof query === 'string' && query.trim() && query.length <= 200);
      const normalized = canonicalQuery(query);
      assert(!questions.has(normalized), 'Duplicate normalized question');
      questions.add(normalized);
    }
  }
  return data;
}

export function validateHeldout(data, fixture) {
  assert(data && typeof data === 'object' && !Array.isArray(data));
  assert.deepEqual(Object.keys(data).sort(), fixture.topics.map(topic => topic.id).sort());
  const training = new Set(fixture.topics.flatMap(topic => topic.queries).map(canonicalQuery));
  const questions = new Set();
  for (const queries of Object.values(data)) {
    assert(Array.isArray(queries), 'Test questions must be an array');
    assert.equal(queries.length, 2);
    for (const query of queries) {
      assert(typeof query === 'string' && query.trim() && query.length <= 200);
      const normalized = canonicalQuery(query);
      assert(!training.has(normalized) && !questions.has(normalized), 'Question overlaps training or another test question');
      questions.add(normalized);
    }
  }
  return data;
}

export function rankingMetrics(paths, target) {
  const rank = paths.indexOf(target) + 1;
  return { hit1: rank === 1 ? 1 : 0, hit5: rank > 0 && rank <= 5 ? 1 : 0,
    mrr10: rank > 0 && rank <= 10 ? 1 / rank : 0, ndcg5: rank > 0 && rank <= 5 ? 1 / Math.log2(rank + 1) : 0 };
}

export function statusHeadingBaseline(results) {
  return results.filter(row => {
    const first = row.excerpt.split(/\r?\n/).find(line => line.trim()) || '';
    return /^ {0,3}#{1,6}[ \t]+Active decision\b/i.test(first);
  }).slice(0, 10).map(row => row.path);
}

export function summarize(rows, field, candidateLimit = 10) {
  assert(rows.length > 0);
  const values = rows.map(row => rankingMetrics(row[field], row.target));
  const mean = key => values.reduce((total, value) => total + value[key], 0) / rows.length;
  const latencies = rows.map(row => row.localMs + (field === 'rankedPaths' ? row.rerankMs : field === 'statusPaths' ? row.statusMs : 0)).sort((a, b) => a - b);
  const reachable = rows.filter(row => (row.candidatePaths || row.localPaths).includes(row.target));
  return { queries: rows.length, hitAt1: mean('hit1'), hitAt5: mean('hit5'), mrrAt10: mean('mrr10'), ndcgAt5: mean('ndcg5'),
    [`candidateRecallAt${candidateLimit}`]: reachable.length / rows.length, candidateMisses: rows.length - reachable.length,
    conditionalHitAt5: reachable.length ? reachable.reduce((n, row) => n + rankingMetrics(row[field], row.target).hit5, 0) / reachable.length : null,
    p95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1] };
}

export async function evaluate({ live = false, heldout = false } = {}) {
  const fixtureBytes = await readFile(fixtureFile);
  const data = validateFixture(JSON.parse(fixtureBytes));
  const heldoutBytes = heldout ? await readFile(join(repo, 'qa/fixtures/recall-evaluation-heldout.json')) : null;
  const querySet = heldout ? validateHeldout(JSON.parse(heldoutBytes), data) : null;
  const root = await mkdtemp(join(tmpdir(), 'omob-recall-evaluation-'));
  const project = join(root, 'project');
  const vault = join(root, 'vault');
  const localHome = join(root, 'local-home');
  const liveHome = join(root, 'live-home');
  const rows = [];
  let requests = 0;
  try {
    const snapshot = await snapshotRuntime(repo, join(root, 'runtime'));
    const sourceHashes = { ...snapshot.hashes, 'qa/scripts/recall-evaluation.mjs': runnerHash };
    const { consentLocation, setConsent, rerankRecall } = await import(pathToFileURL(join(snapshot.directory, 'jev.mjs')).href);
    for (const dir of [project, localHome, liveHome, join(vault, 'notes'), join(vault, '.oh-my-obsidian')]) await mkdir(dir, { recursive: true });
    await writeFile(join(vault, '.oh-my-obsidian/setup-state.json'), JSON.stringify({ schema: 'oh-my-obsidian/setup-state/v1',
      status: 'complete', vaultRealPath: vault, projectName: 'Synthetic retrieval evaluation', managedArtifacts: [] }));
    for (const topic of data.topics) {
      for (const kind of ['current', 'obsolete', 'keywords']) {
        const text = kind === 'keywords' ? `${topic.queries.join('\n')}\nThis is only a keyword list, not an approved decision or answer.` : topic[kind];
        const date = kind === 'current' ? '2026-10-01' : kind === 'obsolete' ? '2026-08-01' : '2026-10-02';
        const path = join(vault, 'notes', `${topic.id}-${kind}.md`);
        await writeFile(path, `---\ntype: decision\n---\n# ${kind === 'obsolete' ? 'Superseded, do not use as current state' : kind === 'current' ? 'Active decision' : 'Unapproved keyword index'} (${date})\n\n${text}\n`);
        await utimes(path, new Date(date), new Date(date));
      }
    }
    const location = await consentLocation(vault, { cwd: project, home: liveHome });
    // Live consent applies only to this disposable synthetic corpus, never the user's vault.
    if (live) await setConsent(location, true);
    for (const topic of data.topics) {
      for (const [index, query] of (querySet?.[topic.id] || topic.queries).entries()) {
        const started = performance.now();
        const child = spawnSync(process.execPath, [join(snapshot.directory, 'vault-ops.mjs'), 'recall', '--local-only', '--limit', '20', '--query', query],
          { cwd: project, env: { ...process.env, HOME: localHome, USERPROFILE: localHome, PWD: project, OBSIDIAN_VAULT: vault, TYPESAFE_API_KEY: '' }, encoding: 'utf8', timeout: 30000 });
        assert.equal(child.status, 0, 'Isolated local recall failed');
        const localMs = performance.now() - started;
        const local = JSON.parse(child.stdout);
        assert.equal(local.reranking.provider, 'local');
        const statusStarted = performance.now();
        const statusPaths = statusHeadingBaseline(local.results);
        const statusMs = performance.now() - statusStarted;
        await verifyRuntimeSnapshot(repo, snapshot);
        assert.equal(hash(await readFile(fileURLToPath(import.meta.url))), runnerHash, 'Evaluation runner changed; discard this run');
        const startRerank = performance.now();
        const ranked = live ? await rerankRecall(query, local.results, vault, { cwd: project, home: liveHome, fetcher: (...args) => {
          requests++; return fetch(...args);
        } }) : null;
        const candidatePaths = local.results.map(result => result.path);
        const row = { id: `${topic.id}-${index}`, language: index === 0 ? 'ko' : 'mixed', query,
          target: `notes/${topic.id}-current.md`, candidatePaths, localPaths: candidatePaths.slice(0, 10), localMs, statusPaths, statusMs,
          rankedPaths: ranked?.results.map(result => result.path) || [], rerankMs: live ? performance.now() - startRerank : 0,
          provider: ranked?.reranking.provider || 'not-run', reason: ranked?.reranking.reason || null,
          inputTokens: ranked?.reranking.usage?.inputTokens ?? null, outputTokens: ranked?.reranking.usage?.outputTokens ?? null };
        rows.push(row);
        if (rows.length % 10 === 0) console.error(`Evaluation: ${rows.length}/50, provider requests: ${requests}`);
      }
    }
    const successful = rows.filter(row => row.provider === 'jev');
    const known = successful.filter(row => row.inputTokens !== null);
    const inputTokens = known.reduce((total, row) => total + row.inputTokens, 0);
    await verifyRuntimeSnapshot(repo, snapshot);
    assert.equal(hash(await readFile(fileURLToPath(import.meta.url))), runnerHash, 'Evaluation runner changed; discard this run');
    return { schema: 'oh-my-obsidian/recall-evaluation-result/v3', createdAt: new Date().toISOString(),
      corpusHash: hash(fixtureBytes), queryHash: hash(heldoutBytes || fixtureBytes), querySet: heldout ? 'heldout' : 'stress',
      sourceHashes, execution: 'verified runtime snapshot', runtime: { node: process.version, platform: process.platform, arch: process.arch },
      documents: 75, queries: rows.length, candidatePoolSize: 20, live,
      scope: 'Synthetic stress test with keyword-only and obsolete distractors. Production-sized top-20 candidate cap, normal top-10 output; not real-vault accuracy.',
      local: summarize(rows, 'localPaths', 20), jev: live ? summarize(rows, 'rankedPaths', 20) : null,
      statusHeading: summarize(rows, 'statusPaths', 20),
      byLanguage: Object.fromEntries(['ko', 'mixed'].map(language => {
        const subset = rows.filter(row => row.language === language);
        return [language, { local: summarize(subset, 'localPaths', 20), statusHeading: summarize(subset, 'statusPaths', 20), jev: live ? summarize(subset, 'rankedPaths', 20) : null }];
      })),
      usage: { attemptedRequests: requests, successfulReranks: successful.length, fallbackQueries: live ? rows.length - successful.length : 0,
        meteredResponses: known.length, inputTokens, outputTokens: known.reduce((n, row) => n + (row.outputTokens || 0), 0),
        estimatedKnownCostUsd: inputTokens * 0.042 / 1000000, inputUsdPerMillionTokens: 0.042,
        priceSource: 'https://docs.typesafe.ai/models', priceCheckedAt: '2026-10-08',
        caveat: 'Estimate from known successful response usage, not an invoice. Missing usage or failed requests may leave cost unaccounted for; excludes taxes.' }, rows };
  } finally {
    assert(root.startsWith(join(tmpdir(), 'omob-recall-evaluation-')));
    await rm(root, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  assert(args.every(arg => ['--jev', '--allow-billed-test', '--heldout'].includes(arg)), 'Usage: recall-evaluation.mjs [--heldout] [--jev --allow-billed-test]');
  const live = args.includes('--jev');
  assert.equal(live, args.includes('--allow-billed-test'), 'Live evaluation requires both --jev and --allow-billed-test');
  const heldout = args.includes('--heldout');
  const result = await evaluate({ live, heldout });
  const output = join(repo, 'dist', `recall-evaluation-20-${heldout ? 'heldout-' : ''}${live ? 'jev' : 'local'}.json`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output, local: result.local, statusHeading: result.statusHeading, jev: result.jev, usage: result.usage }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Evaluation failed; no credentials or provider response bodies are printed. Check explicit flags, fixtures and local helper availability.'); process.exitCode = 1; });
}

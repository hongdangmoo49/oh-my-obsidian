import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { consentLocation, setConsent, rerankRecall } from '../../plugins/oh-my-obsidian/scripts/jev.mjs';

const repo = resolve(import.meta.dirname, '../..');
const fixtureFile = join(repo, 'qa/fixtures/recall-evaluation.json');
const hash = value => createHash('sha256').update(value).digest('hex');

export function validateFixture(data) {
  assert.equal(data.schema, 'oh-my-obsidian/recall-evaluation/v1');
  assert.equal(data.topics.length, 25, 'Keep the approved evaluation bounded to 50 queries');
  const ids = new Set();
  for (const topic of data.topics) {
    assert.match(topic.id, /^[a-z][a-z0-9-]{0,63}$/);
    assert(!ids.has(topic.id)); ids.add(topic.id);
    for (const text of [topic.current, topic.obsolete]) assert(typeof text === 'string' && text.length > 0 && text.length <= 4000);
    assert.notEqual(topic.current, topic.obsolete);
    assert.equal(topic.queries.length, 2);
    for (const query of topic.queries) assert(typeof query === 'string' && query.trim() && query.length <= 200);
  }
  return data;
}

export function rankingMetrics(paths, target) {
  const rank = paths.indexOf(target) + 1;
  return { hit1: rank === 1 ? 1 : 0, hit5: rank > 0 && rank <= 5 ? 1 : 0,
    mrr10: rank > 0 && rank <= 10 ? 1 / rank : 0, ndcg5: rank > 0 && rank <= 5 ? 1 / Math.log2(rank + 1) : 0 };
}

export function summarize(rows, field, candidateLimit = 10) {
  assert(rows.length > 0);
  const values = rows.map(row => rankingMetrics(row[field], row.target));
  const mean = key => values.reduce((total, value) => total + value[key], 0) / rows.length;
  const latencies = rows.map(row => field === 'localPaths' ? row.localMs : row.localMs + row.rerankMs).sort((a, b) => a - b);
  const reachable = rows.filter(row => (row.candidatePaths || row.localPaths).includes(row.target));
  return { queries: rows.length, hitAt1: mean('hit1'), hitAt5: mean('hit5'), mrrAt10: mean('mrr10'), ndcgAt5: mean('ndcg5'),
    [`candidateRecallAt${candidateLimit}`]: reachable.length / rows.length, candidateMisses: rows.length - reachable.length,
    conditionalHitAt5: reachable.length ? reachable.reduce((n, row) => n + rankingMetrics(row[field], row.target).hit5, 0) / reachable.length : null,
    p95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1] };
}

export async function evaluate({ live = false } = {}) {
  const fixtureBytes = await readFile(fixtureFile);
  const data = validateFixture(JSON.parse(fixtureBytes));
  const root = await mkdtemp(join(tmpdir(), 'omob-recall-evaluation-'));
  const project = join(root, 'project');
  const vault = join(root, 'vault');
  const localHome = join(root, 'local-home');
  const liveHome = join(root, 'live-home');
  const rows = [];
  let requests = 0;
  try {
    const sourceHashes = {};
    for (const path of ['plugins/oh-my-obsidian/scripts/vault-ops.mjs', 'plugins/oh-my-obsidian/scripts/jev.mjs', 'qa/scripts/recall-evaluation.mjs']) sourceHashes[path] = hash(await readFile(join(repo, path)));
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
      for (const [index, query] of topic.queries.entries()) {
        const started = performance.now();
        const child = spawnSync(process.execPath, [join(repo, 'plugins/oh-my-obsidian/scripts/vault-ops.mjs'), 'recall', '--local-only', '--limit', '20', '--query', query],
          { cwd: project, env: { ...process.env, HOME: localHome, USERPROFILE: localHome, PWD: project, OBSIDIAN_VAULT: vault, TYPESAFE_API_KEY: '' }, encoding: 'utf8', timeout: 30000 });
        assert.equal(child.status, 0, 'Isolated local recall failed');
        const localMs = performance.now() - started;
        const local = JSON.parse(child.stdout);
        assert.equal(local.reranking.provider, 'local');
        const startRerank = performance.now();
        const ranked = live ? await rerankRecall(query, local.results, vault, { cwd: project, home: liveHome, fetcher: (...args) => {
          requests++; return fetch(...args);
        } }) : null;
        const candidatePaths = local.results.map(result => result.path);
        const row = { id: `${topic.id}-${index}`, language: index === 0 ? 'ko' : 'mixed', query,
          target: `notes/${topic.id}-current.md`, candidatePaths, localPaths: candidatePaths.slice(0, 10), localMs,
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
    for (const [path, expected] of Object.entries(sourceHashes)) assert.equal(hash(await readFile(join(repo, path))), expected, 'Source changed during evaluation; discard the mixed-version run');
    return { schema: 'oh-my-obsidian/recall-evaluation-result/v2', createdAt: new Date().toISOString(),
      corpusHash: hash(fixtureBytes), sourceHashes, documents: 75, queries: rows.length, candidatePoolSize: 20, live,
      scope: 'Synthetic stress test with keyword-only and obsolete distractors. Production-sized top-20 candidate cap, normal top-10 output; not real-vault accuracy.',
      local: summarize(rows, 'localPaths', 20), jev: live ? summarize(rows, 'rankedPaths', 20) : null,
      byLanguage: Object.fromEntries(['ko', 'mixed'].map(language => {
        const subset = rows.filter(row => row.language === language);
        return [language, { local: summarize(subset, 'localPaths', 20), jev: live ? summarize(subset, 'rankedPaths', 20) : null }];
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
  assert(args.every(arg => ['--jev', '--allow-billed-test'].includes(arg)), 'Usage: recall-evaluation.mjs [--jev --allow-billed-test]');
  const live = args.includes('--jev');
  assert.equal(live, args.includes('--allow-billed-test'), 'Live evaluation requires both --jev and --allow-billed-test');
  const result = await evaluate({ live });
  const output = join(repo, 'dist', `recall-evaluation-20-${live ? 'jev' : 'local'}.json`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output, local: result.local, jev: result.jev, usage: result.usage }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Evaluation failed; no credentials or provider response bodies are printed. Check explicit flags, fixtures and local helper availability.'); process.exitCode = 1; });
}

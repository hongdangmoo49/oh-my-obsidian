import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { consentLocation, loadConsent, setConsent, rerankRecall } from '../scripts/jev.mjs';

const key = 'synthetic-jev-test-value';
const entries = [{ path: 'local/private-folder/first.md', excerpt: 'Use a queue for retries.', type: 'decision', score: 9 },
  { path: 'local/private-folder/second.md', excerpt: 'The selected queue supports delayed retries.', type: 'decision', score: 3 }];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omob-jev-test-'));
  const vault = join(root, 'vault');
  await mkdir(vault);
  const options = { cwd: root, home: root, keyProvider: () => key };
  const location = await consentLocation(vault, options);
  return { root, vault, options, location, cleanup: () => rm(root, { recursive: true, force: true }) };
}
const response = answers => new Response(JSON.stringify({ model: 'jev-1.13.0', answers }));
const answers = { c0: { type: 'noul', noul: 0.2 }, c1: { type: 'noul', noul: 0.9 } };

test('no consent means no credential access or network; consent is project/vault bound and removable', async () => {
  const f = await fixture();
  try {
    let touched = false;
    const result = await rerankRecall('queue', entries, f.vault, { ...f.options,
      keyProvider: () => { touched = true; throw Error(); }, fetcher: () => { touched = true; throw Error(); } });
    assert.deepEqual(result.results, entries);
    assert.equal(touched, false);
    await setConsent(f.location, true);
    assert.equal(await loadConsent(f.location), true);
    const other = join(f.root, 'other'); await mkdir(other);
    assert.equal(await loadConsent(await consentLocation(other, f.options)), false);
    assert.equal(await loadConsent(await consentLocation(f.vault, { ...f.options, cwd: other })), false);
    assert(!String(await readFile(f.location.path)).includes(key));
    await setConsent(f.location, false);
    assert.equal(await loadConsent(f.location), false);
  } finally { await f.cleanup(); }
});

test('reranking only reorders local records; sends bounded excerpts without filesystem paths', async () => {
  const f = await fixture();
  try {
    await setConsent(f.location, true);
    let calls = 0;
    const result = await rerankRecall('retry queue', entries, f.vault, { ...f.options, fetcher: async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, `Bearer ${key}`);
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'jev-1.13.0');
      assert(!init.body.includes('private-folder'));
      assert(!init.body.includes(key));
      assert.equal(body.state.candidates.length, 2);
      assert.equal(body.questions.c0.type, 'noul');
      return response(answers);
    } });
    assert.equal(calls, 1);
    assert.equal(result.reranking.provider, 'jev');
    assert.equal(result.results[0].path, entries[1].path);
    assert.equal(result.results[0].excerpt, entries[1].excerpt);
    assert.equal(result.results[0].score, 3);
  } finally { await f.cleanup(); }
});

test('provider failures, invalid responses and unsafe text preserve original results without leaking errors', async () => {
  const f = await fixture();
  try {
    await setConsent(f.location, true);
    for (const fetcher of [async () => { throw Error(key); }, async () => new Response(key, { status: 401 }),
      async () => response({ c0: { type: 'noul', noul: 9 }, c1: answers.c1 }),
      async () => response({ c0: answers.c0 }), async () => new Response('not json'),
      async () => new Response('x'.repeat(65537))]) {
      const result = await rerankRecall('queue', entries, f.vault, { ...f.options, fetcher });
      assert.deepEqual(result.results, entries);
      assert.equal(result.reranking.provider, 'local');
      assert(!JSON.stringify(result.reranking).includes(key));
    }
    for (const query of ['contact person@example.com', key, 'User: private request\nAssistant: private answer', 'Cookie: session=synthetic-private-cookie']) {
      let sent = false;
      const result = await rerankRecall(query, entries, f.vault, { ...f.options, fetcher: () => { sent = true; throw Error(); } });
      assert.equal(sent, false);
      assert.equal(result.reranking.provider, 'local');
    }
    for (const excerpt of ['User: private request\nAssistant: private answer', 'Cookie: session=synthetic-private-cookie']) {
      let sent = false;
      const result = await rerankRecall('queue', [{ ...entries[0], excerpt }, entries[1]], f.vault,
        { ...f.options, fetcher: () => { sent = true; throw Error(); } });
      assert.equal(sent, false);
      assert.equal(result.reranking.provider, 'local');
    }
  } finally { await f.cleanup(); }
});

test('catalog-only raw prompts and paths stay local during reranking', async () => {
  const f = await fixture();
  try {
    await setConsent(f.location, true);
    const catalog = { source: 'catalog-only', excerpt: 'firstUserMessage: raw private request\nfiles: private-path', path: 'catalog.json' };
    const result = await rerankRecall('queue', [catalog, ...entries], f.vault, { ...f.options, fetcher: async (_url, init) => {
      assert(!init.body.includes('private'));
      assert(!init.body.includes('firstUserMessage'));
      return response(answers);
    } });
    assert.equal(result.reranking.provider, 'jev');
    assert.equal(result.results[0].path, entries[1].path);
    assert.equal(result.results[2], catalog);
  } finally { await f.cleanup(); }
});

test('corrupt and symlinked consent is refused instead of overwritten or followed', async () => {
  const f = await fixture();
  try {
    await mkdir(dirname(f.location.path), { recursive: true });
    await writeFile(f.location.path, '{broken');
    await assert.rejects(setConsent(f.location, true));
    assert.equal(await readFile(f.location.path, 'utf8'), '{broken');
    const result = await rerankRecall('queue', entries, f.vault, f.options);
    assert.equal(result.reranking.provider, 'local');
    await rm(f.location.path);
    const outside = join(f.root, 'outside.json');
    await writeFile(outside, '{}');
    try { await symlink(outside, f.location.path); }
    catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return; throw error; }
    await assert.rejects(loadConsent(f.location));
    await assert.rejects(setConsent(f.location, false));
    assert.equal(await readFile(outside, 'utf8'), '{}');
  } finally { await f.cleanup(); }
});

test('CLI rejects key arguments, noninteractive connect and unapproved billed tests without echoing input', () => {
  for (const args of [['connect', '--api-key', key], ['connect'], ['test']]) {
    const result = spawnSync(process.execPath, ['plugins/oh-my-obsidian/scripts/jev.mjs', ...args], { encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' } });
    assert.equal(result.status, 1);
    assert(!`${result.stdout}${result.stderr}`.includes(key));
  }
});

test('CLI enable requires explicit approval, status hides keys, disable restores local recall', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.vault, '.oh-my-obsidian'));
    await writeFile(join(f.vault, '.oh-my-obsidian/setup-state.json'), JSON.stringify({
      schema: 'oh-my-obsidian/setup-state/v1', status: 'complete', vaultRealPath: f.vault,
    }));
    await writeFile(join(f.vault, 'queue.md'), 'The retry queue is durable.');
    await writeFile(join(f.vault, 'queue-other.md'), 'The retry queue supports delays.');
    const env = { ...process.env, HOME: f.root, USERPROFILE: f.root, OBSIDIAN_VAULT: f.vault, TYPESAFE_API_KEY: key };
    const cli = (...args) => spawnSync(process.execPath, [resolve('plugins/oh-my-obsidian/scripts/jev.mjs'), ...args], { cwd: f.root, env, encoding: 'utf8' });
    assert.equal(cli('enable').status, 1);
    assert.equal(await loadConsent(f.location), false);
    assert.equal(cli('enable', '--allow-external-text').status, 0);
    const status = cli('status');
    assert.equal(status.status, 0);
    assert.equal(JSON.parse(status.stdout).enabled, true);
    assert(!status.stdout.includes(key));
    const preload = join(f.root, 'fake-provider.mjs');
    await writeFile(preload, `globalThis.fetch = async (_url, init) => new Response(JSON.stringify({model:'jev-1.13.0', answers:Object.fromEntries(Object.keys(JSON.parse(init.body).questions).map(id => [id,{type:'noul',noul:0.8}]))}));`);
    const remoteRecall = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, resolve('plugins/oh-my-obsidian/scripts/vault-ops.mjs'), 'recall', '--query', 'queue'], { cwd: f.root, env, encoding: 'utf8' });
    assert.equal(remoteRecall.status, 0, remoteRecall.stderr);
    assert.equal(JSON.parse(remoteRecall.stdout).reranking.provider, 'jev');
    assert.equal(cli('disable').status, 0);
    assert.equal(await loadConsent(f.location), false);
    const recall = spawnSync(process.execPath, [resolve('plugins/oh-my-obsidian/scripts/vault-ops.mjs'), 'recall', '--query', 'queue'], { cwd: f.root, env, encoding: 'utf8' });
    assert.equal(recall.status, 0);
    assert.equal(JSON.parse(recall.stdout).reranking.provider, 'local');
  } finally { await f.cleanup(); }
});

test('Windows credential backend round-trips a synthetic isolated credential and deletes it', { skip: process.platform !== 'win32' }, (t) => {
  const target = `oh-my-obsidian/jev/test-${randomUUID()}`;
  const script = resolve('plugins/oh-my-obsidian/scripts/jev-credential.ps1');
  const shell = join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const env = { ...process.env, OMOB_TEST_TARGET: target, OMOB_TEST_SCRIPT: script };
  const run = command => spawnSync(shell, ['-NoProfile', '-Command', command], { env, encoding: 'utf8' });
  let unavailable = false;
  try {
    const set = run(`function Read-Host { ConvertTo-SecureString '${key}' -AsPlainText -Force }; & $env:OMOB_TEST_SCRIPT -Action Set -TargetName $env:OMOB_TEST_TARGET`);
    if (set.status !== 0 && /osError=1312\b/.test(set.stderr)) {
      unavailable = true;
      t.skip('This Windows logon session has no credential set; interactive desktop storage must be validated separately.');
      return;
    }
    assert.equal(set.status, 0, 'Synthetic OS credential write failed: ' + set.stderr);
    const status = run('& $env:OMOB_TEST_SCRIPT -Action Status -TargetName $env:OMOB_TEST_TARGET');
    assert.equal(status.stdout, 'present');
    const get = run('& $env:OMOB_TEST_SCRIPT -Action Get -TargetName $env:OMOB_TEST_TARGET');
    assert.equal(get.status, 0);
    assert(get.stdout === key, 'Synthetic OS credential mismatch');
  } finally {
    if (!unavailable) assert.equal(run('& $env:OMOB_TEST_SCRIPT -Action Delete -TargetName $env:OMOB_TEST_TARGET').status, 0);
  }
  assert.equal(run('& $env:OMOB_TEST_SCRIPT -Action Status -TargetName $env:OMOB_TEST_TARGET').stdout, 'absent');
});

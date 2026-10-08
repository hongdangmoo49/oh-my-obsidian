import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const run = (exe, args, env = {}, cwd = root) => {
  const result = spawnSync(exe, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout;
};
const zipNames = zip => JSON.parse(run('powershell.exe', ['-NoProfile', '-Command',
  'Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead($env:OMOB_ZIP); try { ConvertTo-Json -InputObject @($z.Entries | ForEach-Object { $_.FullName }) } finally { $z.Dispose() }'], { OMOB_ZIP: zip }));
const temp = mkdtempSync(join(tmpdir(), 'omob-package-test-'));
const bundle = join(temp, 'bundle');
try {
  const build = JSON.parse(run(process.execPath, [join(root, 'distribution/agensi/build.mjs'), '--output-dir', join(temp, 'output')]));
  const entryNames = zipNames(build.zip);
  assert(entryNames.every(name => !name.includes('\\') && !name.startsWith('/') && !name.split('/').includes('..')));
  run('powershell.exe', ['-NoProfile', '-Command',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:OMOB_ZIP, $env:OMOB_DEST)'],
  { OMOB_ZIP: build.zip, OMOB_DEST: bundle });
  const manifest = JSON.parse(readFileSync(join(bundle, 'PACKAGE.json')));
  assert.equal(manifest.price, 0);
  assert.deepEqual([...entryNames].sort(), [...manifest.files.map(file => file.path), 'PACKAGE.json'].sort());
  for (const file of manifest.files) {
    assert(!file.path.split('/').some(part => ['..', '.git', 'node_modules', 'tests'].includes(part) || part.startsWith('.env')));
    assert.equal(createHash('sha256').update(readFileSync(join(bundle, file.path))).digest('hex'), file.sha256);
  }
  assert(existsSync(join(bundle, 'SKILL.md')));
  const hostileSource = join(temp, 'hostile-source');
  cpSync(bundle, hostileSource, { recursive: true });
  mkdirSync(join(hostileSource, 'distribution/agensi'), { recursive: true });
  for (const name of ['build.mjs', 'README.md', 'SKILL.md']) cpSync(join(root, 'distribution/agensi', name), join(hostileSource, 'distribution/agensi', name));
  for (const name of ['.env.local', 'notes.private.md']) writeFileSync(join(hostileSource, 'plugins/oh-my-obsidian/scripts', name), 'SYNTHETIC_PRIVATE_FIXTURE');
  writeFileSync(join(hostileSource, '.claude-plugin/settings.local.json'), '{"synthetic":true}');
  const hostileBuild = JSON.parse(run(process.execPath, [join(hostileSource, 'distribution/agensi/build.mjs'), '--output-dir', join(temp, 'hostile-output')]));
  assert.deepEqual(zipNames(hostileBuild.zip).sort(), [...entryNames].sort(), 'Unlisted local files must never enter the ZIP');
  assert.equal(JSON.parse(readFileSync(join(bundle, '.agents/plugins/marketplace.json'))).name, 'omob-agensi-codex');
  const claude = join(process.env.USERPROFILE, '.local/bin/claude.exe');
  console.log(run(claude, ['plugin', 'validate', bundle]));
  console.log(run(claude, ['plugin', 'validate', join(bundle, '.claude-plugin/plugin.json')]));
  const claudeEnv = { CLAUDE_CONFIG_DIR: join(temp, 'claude-home') };
  mkdirSync(claudeEnv.CLAUDE_CONFIG_DIR);
  console.log(run(claude, ['plugin', 'marketplace', 'add', bundle], claudeEnv));
  console.log(run(claude, ['plugin', 'install', 'oh-my-obsidian@omob-agensi'], claudeEnv));
  assert(run(claude, ['plugin', 'list', '--json'], claudeEnv).includes('oh-my-obsidian'));
  for (const helper of ['vault-ops.mjs', 'codex-hooks.mjs', 'setup-vault.mjs']) {
    run(process.execPath, ['--check', join(bundle, 'plugins/oh-my-obsidian/scripts', helper)]);
  }
  const codex = join(process.env.APPDATA, 'npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe');
  const env = { CODEX_HOME: join(temp, 'codex-home') };
  mkdirSync(env.CODEX_HOME);
  console.log(run(codex, ['plugin', 'marketplace', 'add', bundle, '--json'], env));
  console.log(run(codex, ['plugin', 'add', 'oh-my-obsidian@omob-agensi-codex', '--json'], env));
  const installed = run(codex, ['plugin', 'list', '--json'], env);
  assert(installed.includes('oh-my-obsidian'));
  const tests = join(bundle, 'plugins/oh-my-obsidian/tests');
  cpSync(join(root, 'plugins/oh-my-obsidian/tests'), tests, { recursive: true });
  console.log(run(process.execPath, ['--test', ...['claude-hooks', 'codex-hooks', 'vault-ops', 'jev'].map(name => join(tests, `${name}.test.mjs`))], {}, bundle));
  const saver = join(bundle, 'plugins/oh-my-obsidian/scripts/vault-ops.mjs');
  const original = readFileSync(saver);
  try {
    writeFileSync(saver, 'throw new Error("BROKEN_PACKAGE_FIXTURE");');
    const broken = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=recall returns relevant', join(tests, 'vault-ops.test.mjs')],
      { cwd: bundle, encoding: 'utf8', timeout: 30000 });
    assert.equal(broken.status, 1, 'Package tests must fail when the extracted helper is broken');
    assert.match(broken.stdout, /# fail 1/);
  } finally { writeFileSync(saver, original); }
  console.log(`PASS: extracted package, ${manifest.files.length} hashes, both native installs, extracted runtime regression tests`);
} finally {
  if (!temp.startsWith(join(tmpdir(), 'omob-package-test-'))) throw new Error('Unsafe cleanup path');
  rmSync(temp, { recursive: true, force: true });
}

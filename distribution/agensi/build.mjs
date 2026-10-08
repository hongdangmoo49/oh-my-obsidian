import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const version = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'))).version;
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output-dir')) throw new Error('Usage: build.mjs [--output-dir <directory>]');
const output = args.length ? resolve(args[1]) : join(root, 'dist');
mkdirSync(output, { recursive: true });
const temp = mkdtempSync(join(tmpdir(), 'omob-package-'));
const stage = join(temp, 'bundle');
mkdirSync(stage);
const copy = (from, to = from) => {
  let current = root;
  for (const part of from.split('/')) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Package input is a link: ${from}`);
  }
  if (!lstatSync(current).isFile()) throw new Error(`Package input must be a file: ${from}`);
  mkdirSync(dirname(join(stage, to)), { recursive: true });
  copyFileSync(join(root, from), join(stage, to));
};
try {
  for (const path of ['LICENSE', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json',
    'hooks/hooks.json', 'scripts/claude-auto-save.mjs',
    'plugins/oh-my-obsidian/.codex-plugin/plugin.json', 'plugins/oh-my-obsidian/hooks/codex-hook-runner.mjs',
    'plugins/oh-my-obsidian/docs/jev.md',
    ...['auto-session-recovery.mjs', 'auto-session-safety.mjs', 'codex-hooks.mjs', 'codex-history.mjs',
      'hook-preview.mjs', 'jev.mjs', 'jev-credential.ps1', 'obsidian-app-preflight.mjs',
      'obsidian-app-preflight.ps1', 'obsidian-app-preflight.sh', 'obsidian-git-setup.mjs',
      'parse-codex-rollout.mjs', 'setup-vault.mjs', 'transcript-preextract.mjs', 'vault-core.mjs',
      'vault-ops.mjs'].map(name => `plugins/oh-my-obsidian/scripts/${name}`),
    ...['decision.md', 'meeting-notes.md', 'session-log.md', 'troubleshooting.md',
      'bases/decisions.base', 'bases/meeting-notes.base', 'bases/session-logs.base',
      'bases/troubleshooting.base'].map(name => `plugins/oh-my-obsidian/templates/${name}`)]) copy(path);
  copy('distribution/agensi/SKILL.md', 'SKILL.md');
  copy('distribution/agensi/README.md', 'README.md');
  for (const [path, name] of [['.claude-plugin/marketplace.json', 'omob-agensi'],
    ['.agents/plugins/marketplace.json', 'omob-agensi-codex']]) {
    const manifest = JSON.parse(readFileSync(join(stage, path)));
    manifest.name = name;
    if (path.startsWith('.claude-plugin')) manifest.metadata = { description: 'Free local Obsidian project memory for Claude Code and Codex CLI.' };
    writeFileSync(join(stage, path), JSON.stringify(manifest, null, 2) + '\n');
  }
  const guide = readFileSync(join(stage, 'SKILL.md'), 'utf8');
  for (const [name, description] of [['setup', 'Configure approved Obsidian memory and native hooks.'],
    ['recall', 'Recall prior decisions from the approved Obsidian vault.'],
    ['session-save', 'Save new work summaries, decisions and next steps without Git operations.']]) {
    const command = join(stage, 'commands', `${name}.md`);
    mkdirSync(dirname(command), { recursive: true });
    writeFileSync(command, `---\ndescription: ${description}\n---\nRead and follow \"$CLAUDE_PLUGIN_ROOT/SKILL.md\". Perform ${name} only.\n`);
    const claudeSkill = join(stage, 'skills', name, 'SKILL.md');
    mkdirSync(dirname(claudeSkill), { recursive: true });
    writeFileSync(claudeSkill, `---\nname: ${name}\ndescription: ${description}\n---\nRead and follow \"$CLAUDE_PLUGIN_ROOT/SKILL.md\". Perform ${name} only.\n`);
    const skill = join(stage, 'plugins/oh-my-obsidian/skills', `oh-my-obsidian-${name}`, 'SKILL.md');
    mkdirSync(dirname(skill), { recursive: true });
    // Native Codex caches only this subtree; every guide must remain self-contained.
    const nativeGuide = guide.replace(/name: oh-my-obsidian-free/, `name: oh-my-obsidian-${name}`)
      .replace(/^description: .*$/m, `description: ${description}`)
      .replace('directory containing this SKILL.md', 'plugin root two directories above this SKILL.md')
      .replaceAll('BUNDLE/plugins/oh-my-obsidian/scripts', 'BUNDLE/scripts')
      .replace('Read README.md before setup.', 'Native registration is already complete; skip the registration section.')
      .replace('BUNDLE/scripts/claude-auto-save.mjs', 'the Claude distribution root scripts/claude-auto-save.mjs (not bundled in this Codex cache)');
    writeFileSync(skill, nativeGuide);
  }
  const files = [];
  function inventory(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = prefix + entry.name;
      if (entry.isDirectory()) inventory(join(dir, entry.name), path + '/');
      else files.push({ path, sha256: createHash('sha256').update(readFileSync(join(dir, entry.name))).digest('hex') });
    }
  }
  inventory(stage);
  writeFileSync(join(stage, 'PACKAGE.json'), JSON.stringify({ name: 'oh-my-obsidian-free', version,
    status: 'candidate', price: 0, agents: ['Codex CLI', 'Claude Code'], files }, null, 2) + '\n');
  const payloadId = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 12);
  const zip = join(output, `oh-my-obsidian-free-${version}-candidate-${payloadId}.zip`);
  if (process.platform !== 'win32') throw new Error('This packaging command currently requires Windows PowerShell.');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command',
    `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem;
    $archive=[IO.Compression.ZipFile]::Open($env:OMOB_ZIP,[IO.Compression.ZipArchiveMode]::Create);
    try {
      Get-ChildItem -LiteralPath $env:OMOB_STAGE -Recurse -File -Force | ForEach-Object {
        $name=$_.FullName.Substring($env:OMOB_STAGE.Length+1).Replace('\\','/');
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$_.FullName,$name) | Out-Null;
      }
    } finally { $archive.Dispose() }`],
    { env: { ...process.env, OMOB_STAGE: stage, OMOB_ZIP: zip }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const sha256 = createHash('sha256').update(readFileSync(zip)).digest('hex');
  writeFileSync(zip + '.sha256', `${sha256}  ${zip.split(/[\\/]/).at(-1)}\n`);
  console.log(JSON.stringify({ zip, sha256, files: files.length, status: 'candidate' }, null, 2));
} finally {
  if (!temp.startsWith(join(tmpdir(), 'omob-package-'))) throw new Error('Unsafe cleanup path');
  rmSync(temp, { recursive: true, force: true });
}

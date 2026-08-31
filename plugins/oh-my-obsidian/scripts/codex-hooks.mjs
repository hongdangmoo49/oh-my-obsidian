#!/usr/bin/env node
import { lstat, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CODEX_HOOKS_POINTER_CREATED_BY,
  CODEX_HOOKS_POINTER_SCHEMA,
  SETUP_STATE_SCHEMA,
  expandHome,
  normalizeVaultRelativePath,
  nowIso,
  pathExists,
  readJsonObjectIfExists,
  setupStatePath,
  writeJsonAtomic,
} from "./vault-core.mjs";

const args = parseArgs(process.argv.slice(2));
const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const sourceRunnerPath = join(pluginRoot, "hooks", "codex-hook-runner.mjs");

main().catch((error) => {
  printJson({
    status: "failed",
    action: args.action || "unknown",
    issues: [error.message],
  });
  process.exit(1);
});

async function main() {
  if (!["plan", "apply", "validate"].includes(args.action)) {
    throw new Error(`unknown action: ${args.action || ""}`);
  }

  const plan = await buildPlan();
  if (args.action === "plan" || args.action === "validate") {
    printJson(plan);
    process.exit(plan.status === "failed" ? 1 : 0);
    return;
  }

  if (plan.status === "failed") {
    printJson(plan);
    process.exit(1);
    return;
  }

  await applyPlan(plan);
  const applied = await buildPlan({ afterApply: true });
  printJson({
    ...applied,
    status: applied.status === "failed" ? "failed" : "applied",
  });
  process.exit(applied.status === "failed" ? 1 : 0);
}

function parseArgs(argv) {
  const parsed = {
    action: argv[0] || "plan",
    mode: "repo-local",
    repoRoot: process.cwd(),
    vaultPath: "",
    home: process.env.HOME || homedir(),
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mode") parsed.mode = argv[++index] || parsed.mode;
    else if (arg === "--scope") parsed.mode = legacyScopeToMode(argv[++index] || "");
    else if (arg === "--repo-root") parsed.repoRoot = argv[++index] || parsed.repoRoot;
    else if (arg === "--vault") parsed.vaultPath = argv[++index] || "";
    else if (arg === "--home") parsed.home = argv[++index] || parsed.home;
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!["repo-local", "user-global"].includes(parsed.mode)) {
    throw new Error(`unknown Codex hooks mode: ${parsed.mode}`);
  }
  return parsed;
}

function legacyScopeToMode(scope) {
  if (scope === "repo") return "repo-local";
  if (scope === "home") return "user-global";
  return scope || "repo-local";
}

async function buildPlan(options = {}) {
  const target = await buildTarget();
  const issues = [...target.issues];
  const vault = await resolveVaultForInstall(issues);

  const hookReadIssues = [];
  const currentHooksConfig =
    (await readJsonObjectNoSymlinkIfExists(target.hooksConfigPath, "hooks.json", hookReadIssues, false)) || { hooks: {} };
  const configReadIssues = [];
  const currentConfigToml = await readOptionalTextNoSymlink(target.configTomlPath, configReadIssues);
  const gitignoreReadIssues = [];
  const currentGitignore = target.gitignorePath
    ? await readOptionalTextNoSymlink(target.gitignorePath, gitignoreReadIssues)
    : "";
  const currentPointer = await readJsonObjectNoSymlinkIfExists(target.pointerPath, "oh-my-obsidian Codex pointer", issues, false);

  const hooksMerge = hookReadIssues.length === 0 ? mergeHooksConfig(currentHooksConfig, target.commands) : null;
  const tomlMerge = configReadIssues.length === 0 ? mergeFeatureFlag(currentConfigToml) : null;
  const gitignoreMerge = target.gitignorePath && gitignoreReadIssues.length === 0
    ? mergeGitignore(currentGitignore)
    : null;
  const pointerValue =
    hookReadIssues.length === 0 && issues.length === 0 && vault.ok
      ? buildPointerValue(target, vault, currentPointer)
      : null;

  if (hookReadIssues.length) issues.push(...hookReadIssues);
  if (configReadIssues.length) issues.push(...configReadIssues);
  if (gitignoreReadIssues.length) issues.push(...gitignoreReadIssues);
  if (hooksMerge?.issues?.length) issues.push(...hooksMerge.issues);
  if (tomlMerge?.issues?.length) issues.push(...tomlMerge.issues);
  if (gitignoreMerge?.issues?.length) issues.push(...gitignoreMerge.issues);
  if (!vault.ok) issues.push(...vault.issues);

  const status = issues.length > 0 ? "failed" : options.afterApply ? "installed" : "planned";
  return {
    status,
    action: args.action,
    mode: args.mode,
    scope: target.scope,
    repoRoot: target.repoRoot,
    vaultPath: vault.vaultPath || args.vaultPath,
    vaultRealPath: vault.vaultRealPath || "",
    configTomlPath: target.configTomlPath,
    hooksConfigPath: target.hooksConfigPath,
    runnerPath: target.runnerPath,
    pointerPath: target.pointerPath,
    gitignorePath: target.gitignorePath,
    commands: target.commands,
    nextConfigToml: tomlMerge?.nextText ?? currentConfigToml,
    nextHooksConfig: hooksMerge?.nextConfig || currentHooksConfig,
    nextGitignore: gitignoreMerge?.nextText ?? currentGitignore,
    nextPointer: pointerValue || currentPointer || null,
    completesSetupState: Boolean(vault.completesSetupState),
    diff: describeDiff({
      target,
      hooksMerge,
      tomlMerge,
      gitignoreMerge,
      currentPointer,
      pointerValue,
    }),
    rollback: [
      `Remove ${target.runnerPath}`,
      `Remove the oh-my-obsidian SessionStart and Stop hook commands from ${target.hooksConfigPath}`,
      `Remove ${target.pointerPath}`,
      `Remove codex_hooks from ${target.configTomlPath} only if oh-my-obsidian was the only feature using it`,
    ],
    skip: [
      "Skip Codex hooks installation for now.",
      "Continue using oh-my-obsidian skills manually.",
    ],
    issues,
  };
}

async function buildTarget() {
  const requestedRepoRoot = resolve(expandHome(args.repoRoot, args.home));
  const gitRoot = resolveRepoLocalGitRoot(requestedRepoRoot);
  const repoRoot = args.mode === "repo-local" && gitRoot.repoRoot ? gitRoot.repoRoot : requestedRepoRoot;
  const homeRoot = resolve(expandHome(args.home, args.home));
  const base = args.mode === "repo-local" ? join(repoRoot, ".codex") : join(homeRoot, ".codex");
  const runnerPath = join(base, "hooks", "oh-my-obsidian", "codex-hook-runner.mjs");
  const commands = {
    sessionStart: buildHookCommand(runnerPath, "session-start"),
    stop: buildHookCommand(runnerPath, "stop"),
  };
  return {
    scope: args.mode === "repo-local" ? "repo" : "home",
    repoRoot,
    requestedRepoRoot,
    configTomlPath: join(base, "config.toml"),
    hooksConfigPath: join(base, "hooks.json"),
    runnerPath,
    pointerPath: join(base, "oh-my-obsidian.local.json"),
    gitignorePath: args.mode === "repo-local" ? join(base, ".gitignore") : "",
    commands,
    issues: gitRoot.issue ? [gitRoot.issue] : [],
  };
}

async function resolveVaultForInstall(issues) {
  if (!args.vaultPath) {
    return { ok: false, issues: ["--vault is required for Codex hooks installation"] };
  }
  const vaultPath = resolve(expandHome(args.vaultPath, args.home));
  let vaultRealPath = "";
  try {
    vaultRealPath = await realpath(vaultPath);
  } catch (error) {
    return { ok: false, vaultPath, issues: [`vault path cannot be resolved: ${error.message}`] };
  }

  const statePath = setupStatePath(vaultRealPath);
  const state = await readJsonObjectIfExists(statePath, "setup-state.json", issues, true);
  if (!state) return { ok: false, vaultPath, vaultRealPath, issues: [] };
  if (state.schema !== SETUP_STATE_SCHEMA) {
    return { ok: false, vaultPath, vaultRealPath, issues: ["setup-state schema mismatch"] };
  }
  const completesSetupState = await setupCanBeCompletedByCodexHooks(state, vaultRealPath);
  if (state.status !== "complete" && !completesSetupState) {
    return { ok: false, vaultPath, vaultRealPath, issues: [`setup-state must be complete before installing Codex hooks, got ${state.status || "unknown"}`] };
  }
  if (state.vaultRealPath !== vaultRealPath) {
    return { ok: false, vaultPath, vaultRealPath, issues: ["setup-state vaultRealPath does not match vault path"] };
  }

  return { ok: true, vaultPath, vaultRealPath, setupStatePath: statePath, setupState: state, completesSetupState, issues: [] };
}

function resolveRepoLocalGitRoot(repoRoot) {
  if (args.mode !== "repo-local") return { repoRoot, issue: "" };
  const result = spawnSync("git", ["-C", repoRoot, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (result.status !== 0) {
    return {
      repoRoot,
      issue: `repo-local Codex hooks require --repo-root to be inside a Git worktree: ${result.stderr || result.stdout}`.trim(),
    };
  }
  return { repoRoot: resolve(result.stdout.trim()), issue: "" };
}

async function setupCanBeCompletedByCodexHooks(state, vaultRealPath) {
  if (state.status !== "action_required_env") return false;
  const artifacts = Array.isArray(state.managedArtifacts) ? state.managedArtifacts : [];
  if (artifacts.length === 0 || !artifacts.every((entry) => entry.applied === true)) return false;
  for (const entry of artifacts) {
    const relativePath = normalizeVaultRelativePath(entry.relativePath || "");
    const targetPath = join(vaultRealPath, ...relativePath.split("/"));
    if (!(await pathExists(targetPath))) return false;
  }
  return true;
}

function buildPointerValue(target, vault, currentPointer) {
  const approvedAt =
    currentPointer?.schema === CODEX_HOOKS_POINTER_SCHEMA &&
    currentPointer?.createdBy === CODEX_HOOKS_POINTER_CREATED_BY &&
    currentPointer?.scope === args.mode &&
    currentPointer?.vaultRealPath === vault.vaultRealPath &&
    currentPointer?.approvedAt
      ? currentPointer.approvedAt
      : nowIso();
  return {
    schema: CODEX_HOOKS_POINTER_SCHEMA,
    createdBy: CODEX_HOOKS_POINTER_CREATED_BY,
    scope: args.mode,
    vaultPath: vault.vaultPath,
    vaultRealPath: vault.vaultRealPath,
    setupStatePath: vault.setupStatePath,
    approvedAt,
    hooksConfigPath: target.hooksConfigPath,
    configTomlPath: target.configTomlPath,
    runnerPath: target.runnerPath,
  };
}

async function applyPlan(plan) {
  for (const targetPath of [plan.runnerPath, plan.configTomlPath, plan.hooksConfigPath, plan.pointerPath, plan.gitignorePath].filter(Boolean)) {
    await assertSafeCodexWriteTarget(targetPath, plan);
  }
  await writeFileAtomicNoSymlink(plan.runnerPath, await readFile(sourceRunnerPath, "utf8"));
  await writeFileAtomicNoSymlink(plan.configTomlPath, plan.nextConfigToml);
  await writeJsonAtomic(plan.hooksConfigPath, plan.nextHooksConfig);
  if (plan.gitignorePath) {
    await writeFileAtomicNoSymlink(plan.gitignorePath, plan.nextGitignore);
  }
  await writeJsonAtomic(plan.pointerPath, plan.nextPointer);
  await updateSetupState(plan);
}

async function updateSetupState(plan) {
  if (!plan.nextPointer?.setupStatePath || !(await pathExists(plan.nextPointer.setupStatePath))) return;
  const issues = [];
  const state = await readJsonObjectIfExists(plan.nextPointer.setupStatePath, "setup-state.json", issues, true);
  if (!state) return;
  await writeJsonAtomic(plan.nextPointer.setupStatePath, {
    ...state,
    status: plan.completesSetupState && state.status === "action_required_env" ? "complete" : state.status,
    updatedAt: nowIso(),
    codexHooks: {
      enabled: true,
      status: "installed",
      mode: plan.mode,
      events: ["SessionStart", "Stop"],
      installedAt: nowIso(),
      configTomlPath: plan.configTomlPath,
      hooksConfigPath: plan.hooksConfigPath,
      runnerPath: plan.runnerPath,
      pointerPath: plan.pointerPath,
      featureFlag: true,
    },
    hookPreview: {
      ...(state.hookPreview || {}),
      enabled: true,
      status: "superseded-by-official-codex-hooks",
    },
  });
}

function mergeHooksConfig(currentConfig, commands) {
  const issues = [];
  if (!currentConfig || Array.isArray(currentConfig) || typeof currentConfig !== "object") {
    return { issues: ["hooks.json must be a JSON object"] };
  }
  if (currentConfig.hooks && (Array.isArray(currentConfig.hooks) || typeof currentConfig.hooks !== "object")) {
    return { issues: ["hooks.json must contain an object-valued hooks property"] };
  }
  const nextConfig = JSON.parse(JSON.stringify(currentConfig || {}));
  if (!nextConfig.hooks) nextConfig.hooks = {};

  for (const eventName of ["SessionStart", "Stop"]) {
    if (nextConfig.hooks[eventName] !== undefined && !Array.isArray(nextConfig.hooks[eventName])) {
      issues.push(`hooks.${eventName} must be an array when present`);
    }
  }
  if (issues.length > 0) return { issues };

  const additions = [];
  addEventHook(nextConfig, "SessionStart", commands.sessionStart, {
    matcher: "*",
    statusMessage: "Loading oh-my-obsidian project memory",
  }, additions);
  addEventHook(nextConfig, "Stop", commands.stop, {}, additions);

  return {
    issues: [],
    nextConfig,
    additions,
  };
}

function addEventHook(config, eventName, command, options, additions) {
  if (!Array.isArray(config.hooks[eventName])) config.hooks[eventName] = [];
  const existingCommands = config.hooks[eventName].flatMap((entry) =>
    Array.isArray(entry?.hooks) ? entry.hooks.map((hook) => hook.command) : []
  );
  if (existingCommands.includes(command)) return;

  const entry = {};
  if (options.matcher) entry.matcher = options.matcher;
  entry.hooks = [
    {
      type: "command",
      command,
      timeout: 5,
    },
  ];
  if (options.statusMessage) entry.hooks[0].statusMessage = options.statusMessage;
  config.hooks[eventName].push(entry);
  additions.push(eventName);
}

function mergeGitignore(currentText) {
  const text = currentText || "";
  const lines = text ? text.split(/\r?\n/) : [];
  const activeLines = lines.map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  if (activeLines.includes("oh-my-obsidian.local.json")) {
    return { issues: [], nextText: ensureTrailingNewline(lines.join("\n")), changed: false };
  }
  const nextLines = [...lines];
  while (nextLines.length > 0 && nextLines.at(-1) === "") nextLines.pop();
  if (nextLines.length > 0) nextLines.push("");
  nextLines.push("# Personal vault pointer. Do not commit machine-specific paths.", "oh-my-obsidian.local.json");
  return { issues: [], nextText: ensureTrailingNewline(nextLines.join("\n")), changed: true };
}

function mergeFeatureFlag(currentText) {
  const text = currentText || "";
  const lines = text ? text.split(/\r?\n/) : [];
  const issues = [];
  let featuresStart = -1;
  let featuresEnd = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const section = line.match(/^\s*\[([A-Za-z0-9_.-]+)\]\s*(?:#.*)?$/);
    if (/^\s*\[/.test(line) && !section) {
      issues.push(`config.toml has an unsupported or invalid section header on line ${index + 1}`);
      continue;
    }
    if (section?.[1] === "features") {
      if (featuresStart !== -1) issues.push("config.toml contains duplicate [features] sections");
      featuresStart = index;
      featuresEnd = lines.length;
      continue;
    }
    if (section && featuresStart !== -1 && index > featuresStart && featuresEnd === lines.length) {
      featuresEnd = index;
    }
  }

  if (issues.length > 0) return { issues };

  if (featuresStart !== -1) {
    let codexHooksLine = -1;
    let codexHooksValue = "";
    let codexHooksSuffix = "";
    let codexHooksIndent = "";
    for (let index = featuresStart + 1; index < featuresEnd; index += 1) {
      const match = lines[index].match(/^(\s*)codex_hooks\s*=\s*([^#\s]+)(.*)$/);
      if (!match) continue;
      if (codexHooksLine !== -1) return { issues: ["config.toml contains duplicate features.codex_hooks entries"] };
      codexHooksLine = index;
      codexHooksIndent = match[1];
      codexHooksValue = match[2];
      codexHooksSuffix = match[3] || "";
    }
    if (codexHooksLine !== -1) {
      if (codexHooksValue === "true") {
        return { issues: [], nextText: ensureTrailingNewline(lines.join("\n")), changed: false };
      }
      if (codexHooksValue === "false") {
        lines[codexHooksLine] = `${codexHooksIndent}codex_hooks = true${codexHooksSuffix}`;
        return { issues: [], nextText: ensureTrailingNewline(lines.join("\n")), changed: true };
      }
      return { issues: [`features.codex_hooks must be a boolean, got ${codexHooksValue}`] };
    }
    lines.splice(featuresEnd, 0, "codex_hooks = true");
    return { issues: [], nextText: ensureTrailingNewline(lines.join("\n")), changed: true };
  }

  const nextLines = [...lines];
  if (nextLines.length > 0 && nextLines.at(-1) !== "") nextLines.push("");
  nextLines.push("[features]", "codex_hooks = true");
  return { issues: [], nextText: ensureTrailingNewline(nextLines.join("\n")), changed: true };
}

function describeDiff({ target, hooksMerge, tomlMerge, gitignoreMerge, currentPointer, pointerValue }) {
  if (!hooksMerge || !tomlMerge || hooksMerge.issues?.length || tomlMerge.issues?.length || gitignoreMerge?.issues?.length || !pointerValue) {
    return ["No files will be changed until reported issues are fixed."];
  }
  const diff = [];
  if (tomlMerge?.changed) diff.push(`+ enable [features].codex_hooks in ${target.configTomlPath}`);
  if (hooksMerge?.additions?.includes("SessionStart")) {
    diff.push(`+ add SessionStart hook command ${target.commands.sessionStart}`);
  }
  if (hooksMerge?.additions?.includes("Stop")) {
    diff.push(`+ add Stop hook command ${target.commands.stop}`);
  }
  if (pointerValue && currentPointer && JSON.stringify(currentPointer) === JSON.stringify(pointerValue)) {
    diff.push(`= Codex vault pointer already current ${target.pointerPath}`);
  } else {
    diff.push(`${currentPointer ? "~ update" : "+ create"} Codex vault pointer ${target.pointerPath}`);
  }
  if (gitignoreMerge?.changed) {
    diff.push(`+ protect personal Codex vault pointer in ${target.gitignorePath}`);
  }
  diff.push(`+ install hook runner ${target.runnerPath}`);
  return diff;
}

async function readOptionalText(path) {
  if (!(await pathExists(path))) return "";
  return await readFile(path, "utf8");
}

function buildHookCommand(runnerPath, eventName) {
  if (args.mode === "repo-local") {
    return `node -e "const{execFileSync}=require('node:child_process'),{join}=require('node:path'),{pathToFileURL}=require('node:url');const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();import(pathToFileURL(join(root,'.codex','hooks','oh-my-obsidian','codex-hook-runner.mjs')).href)" _ ${eventName}`;
  }
  return `node ${quoteCommandArg(runnerPath)} ${eventName}`;
}

function quoteCommandArg(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function readOptionalTextNoSymlink(path, issues) {
  if (await isSymlink(path)) {
    issues.push(`${path} must not be a symlink`);
    return "";
  }
  if (!(await pathExists(path))) return "";
  return await readFile(path, "utf8");
}

async function readJsonObjectNoSymlinkIfExists(path, label, issues, required) {
  if (await isSymlink(path)) {
    issues.push(`${label} must not be a symlink`);
    return null;
  }
  if (!(await pathExists(path))) {
    if (required) issues.push(`${label} is missing`);
    return null;
  }
  return await readJsonObjectIfExists(path, label, issues, required);
}

async function assertSafeCodexWriteTarget(targetPath, plan) {
  const base = plan.mode === "repo-local"
    ? join(resolve(plan.repoRoot), ".codex")
    : join(resolve(expandHome(args.home, args.home)), ".codex");
  if (!isInsidePath(base, targetPath)) {
    throw new Error(`refusing to write outside Codex config directory: ${targetPath}`);
  }

  const rel = relative(base, targetPath);
  const segments = rel.split(/[\\/]+/).filter(Boolean);
  if (await isSymlink(base)) {
    throw new Error(`${base} must not be a symlink`);
  }
  await mkdir(base, { recursive: true });
  let current = base;
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    if (await isSymlink(current)) {
      throw new Error(`${current} must not be a symlink`);
    }
    await mkdir(current, { recursive: true });
  }
  if (await isSymlink(targetPath)) {
    throw new Error(`${targetPath} must not be a symlink`);
  }
}

async function writeFileAtomicNoSymlink(path, content) {
  if (await pathExists(path) && await isSymlink(path)) {
    throw new Error(`${path} must not be a symlink`);
  }
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, path);
}

async function isSymlink(path) {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

function isInsidePath(rootPath, candidatePath) {
  const rel = relative(resolve(rootPath), resolve(candidatePath));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel) && !win32.isAbsolute(rel));
}

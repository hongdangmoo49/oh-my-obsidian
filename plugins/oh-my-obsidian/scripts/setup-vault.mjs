#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import {
  CODEX_CONFIG_CREATED_BY,
  CODEX_CONFIG_SCHEMA,
  PLUGIN_VERSION,
  SETUP_STATE_SCHEMA,
  codexConfigPath,
  contentHash,
  expandHome,
  fileContentHash,
  isInsidePath,
  normalizeVaultRelativePath,
  nowIso,
  pathExists,
  readJsonObjectIfExists,
  resolveVault,
  sanitizePathSegment,
  setupStatePath,
  uniqueValues,
  validatePlannedVaultTarget,
  writeJsonAtomic,
} from "./vault-core.mjs";

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  printJson({
    schema: SETUP_STATE_SCHEMA,
    action: args.action || "unknown",
    status: "failed",
    issues: [error.message],
  });
  process.exit(1);
});

async function main() {
  if (!["dry-run", "apply", "attach", "validate", "resume", "reconcile"].includes(args.action)) {
    throw new Error(`unknown action: ${args.action || ""}`);
  }

  if (args.action === "dry-run") {
    printJson(await dryRun());
    return;
  }
  if (args.action === "apply") {
    const result = await applySetup();
    printJson(result);
    process.exit(result.status === "failed" ? 1 : 0);
  }
  if (args.action === "attach") {
    const result = await attachSetup();
    printJson(result);
    process.exit(result.status === "failed" ? 1 : 0);
  }
  if (args.action === "validate") {
    const result = await validateSetup(args.vaultPath || process.env.OBSIDIAN_VAULT || "");
    printJson(result);
    process.exit(result.status === "failed" ? 1 : 0);
  }
  if (args.action === "resume") {
    const result = await resumeOrReconcile({ applyMissing: true, resumeOnly: true });
    printJson(result);
    process.exit(result.status === "failed" ? 1 : 0);
  }
  if (args.action === "reconcile") {
    const result = await resumeOrReconcile({ applyMissing: args.applyMissing, resumeOnly: false });
    printJson(result);
    process.exit(result.status === "failed" ? 1 : 0);
  }
}

function parseArgs(argv) {
  const parsed = {
    action: argv[0] || "dry-run",
    vaultPath: "",
    projectName: "",
    domains: [],
    description: "",
    techStack: [],
    team: "",
    createConfigPointer: false,
    git: "skip",
    obsidianGit: "skip",
    applyMissing: false,
    preflightJson: "",
    home: process.env.HOME || homedir(),
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--vault") parsed.vaultPath = argv[++index] || "";
    else if (arg === "--project-name") parsed.projectName = argv[++index] || "";
    else if (arg === "--domain") parsed.domains.push(argv[++index] || "");
    else if (arg === "--domains") parsed.domains.push(...String(argv[++index] || "").split(","));
    else if (arg === "--description") parsed.description = argv[++index] || "";
    else if (arg === "--tech") parsed.techStack.push(argv[++index] || "");
    else if (arg === "--tech-stack") parsed.techStack.push(...String(argv[++index] || "").split(","));
    else if (arg === "--team") parsed.team = argv[++index] || "";
    else if (arg === "--create-config-pointer") parsed.createConfigPointer = true;
    else if (arg === "--git") parsed.git = argv[++index] || "skip";
    else if (arg === "--obsidian-git") parsed.obsidianGit = argv[++index] || "skip";
    else if (arg === "--apply-missing") parsed.applyMissing = true;
    else if (arg === "--preflight-json") parsed.preflightJson = argv[++index] || "";
    else if (arg === "--home") parsed.home = argv[++index] || parsed.home;
    else throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

async function dryRun() {
  const plan = buildPlan(await normalizeSetupInput());
  return {
    schema: SETUP_STATE_SCHEMA,
    action: "dry-run",
    status: "planned",
    vaultPath: plan.vaultPath,
    projectName: plan.projectName,
    serviceRoot: plan.serviceRoot,
    knowledgeDomains: plan.knowledgeDomains,
    managedArtifacts: plan.managedArtifacts,
    approvalsRequired: [
      "create vault artifacts",
      "package manager install, if Obsidian is missing",
      "shell profile mutation, if requested",
      "Codex config pointer creation, if requested",
      "Obsidian Git download and community plugin enablement, if requested",
      "team-sync git remote or push operations, if requested",
    ],
  };
}

async function applySetup() {
  const input = await normalizeSetupInput({ requirePreflight: true });
  const plan = buildPlan(input);
  const vaultRoot = plan.vaultPath;
  const precheck = await inspectVaultBeforeBootstrap(plan, "apply");
  if (precheck.issues.length > 0) {
    return {
      schema: SETUP_STATE_SCHEMA,
      action: "apply",
      status: "failed",
      issues: precheck.issues,
    };
  }

  let state = null;
  try {
    state = await bootstrapManagedSetup(plan);
    for (const artifact of plan.managedArtifacts) {
      if (artifact.relativePath === ".oh-my-obsidian" || artifact.relativePath === ".oh-my-obsidian/setup-state.json") {
        continue;
      }
      state = await applyArtifact(vaultRoot, state, artifact, plan);
      await writeState(vaultRoot, state);
    }

    const gitState = await maybeInitializeGit(vaultRoot, state);
    state.git = gitState;
    state = await maybeWriteConfigPointer(state, vaultRoot, state.vaultRealPath);
    state.envVar = await buildEnvState(state.vaultRealPath, state.vaultPath);
    state.status = await completionStatus(state.vaultRealPath, state);
    state.updatedAt = nowIso();
    await writeState(vaultRoot, state);
    return setupResult("apply", state);
  } catch (error) {
    if (state) {
      state.status = "failed";
      state.updatedAt = nowIso();
      state.git.issues = [...(state.git?.issues || []), error.message];
      await writeState(vaultRoot, state);
    }
    throw error;
  }
}

async function attachSetup() {
  const input = await normalizeSetupInput({ requirePreflight: true });
  const plan = buildPlan(input);
  const vaultRoot = plan.vaultPath;
  if (!(await pathExists(vaultRoot))) {
    return {
      schema: SETUP_STATE_SCHEMA,
      action: "attach",
      status: "failed",
      issues: ["vault path does not exist; attach requires an existing vault"],
    };
  }

  const precheck = await inspectVaultBeforeBootstrap(plan, "attach");
  if (precheck.issues.length > 0) {
    return {
      schema: SETUP_STATE_SCHEMA,
      action: "attach",
      status: "failed",
      issues: precheck.issues,
    };
  }

  let state = await bootstrapManagedSetup(plan);
  for (const artifact of plan.managedArtifacts) {
    if (artifact.relativePath === ".oh-my-obsidian" || artifact.relativePath === ".oh-my-obsidian/setup-state.json") {
      continue;
    }
    const existing = await existingArtifactState(vaultRoot, artifact, plan);
    if (!existing.exists || existing.conflict) continue;
    state = await markArtifactApplied(state, vaultRoot, artifact.relativePath, existing.hash);
  }

  state = await hydrateAttachState(vaultRoot, state);
  state = await maybeWriteConfigPointer(state, vaultRoot, state.vaultRealPath);
  state.envVar = await buildEnvState(state.vaultRealPath, state.vaultPath);
  state.status = state.managedArtifacts.every((entry) => entry.applied)
    ? await completionStatus(state.vaultRealPath, state)
    : "in_progress";
  await writeState(vaultRoot, state);

  return {
    ...setupResult("attach", state),
    missing: state.managedArtifacts.filter((entry) => !entry.applied).map((entry) => entry.relativePath),
  };
}

async function normalizeSetupInput(options = {}) {
  const projectName = String(args.projectName || "").trim();
  if (!projectName) throw new Error("--project-name is required");
  const knowledgeDomains = uniqueValues(args.domains.map((domain) => sanitizePathSegment(domain, "")));
  if (knowledgeDomains.length < 2) {
    throw new Error("at least two --domain values are required");
  }

  const vaultPath = resolve(expandHome(args.vaultPath || join(args.home, "Documents", "Obsidian", sanitizePathSegment(projectName)), args.home));
  const preflight = await parsePreflight(args.preflightJson);
  if (options.requirePreflight) {
    ensurePreflightCompleted(preflight);
  }

  return {
    vaultPath,
    projectName,
    serviceRoot: sanitizePathSegment(projectName, "Project"),
    knowledgeDomains,
    description: args.description,
    techStack: uniqueValues(args.techStack),
    team: args.team,
    preflight,
    gitMode: args.git,
    obsidianGitChoice: args.obsidianGit,
  };
}

function buildPlan(input) {
  const dirArtifacts = [
    ".oh-my-obsidian",
    input.serviceRoot,
    ...input.knowledgeDomains.map((domain) => `${input.serviceRoot}/${domain}`),
    "작업기록",
    "작업기록/세션기록",
    "작업기록/의사결정",
    "작업기록/트러블슈팅",
    "작업기록/회의록",
    "scripts",
    "scripts/team-setup",
    ".obsidian",
  ].map((relativePath) => artifact(relativePath, "dir", "setup"));

  const fileArtifacts = [
    artifact(".oh-my-obsidian/setup-state.json", "config", "setup-state"),
    artifact("README.md", "file", "vault-readme"),
    artifact("scripts/team-setup/install.sh", "file", "team-install-sh"),
    artifact("scripts/team-setup/install.ps1", "file", "team-install-ps1"),
    artifact("scripts/team-setup/README.md", "file", "team-install-readme"),
  ];

  return {
    ...input,
    managedArtifacts: [...dirArtifacts, ...fileArtifacts],
  };
}

function artifact(relativePath, kind, template) {
  return {
    relativePath: normalizeVaultRelativePath(relativePath),
    kind,
    template,
    planned: true,
    applied: false,
    contentHash: null,
    lastAppliedAt: null,
  };
}

function buildInitialState(plan, vaultRealPath, createdAt) {
  return {
    schema: SETUP_STATE_SCHEMA,
    status: "in_progress",
    pluginVersion: PLUGIN_VERSION,
    createdAt,
    updatedAt: createdAt,
    projectName: plan.projectName,
    vaultPath: plan.vaultPath,
    vaultRealPath,
    knowledgeDomains: plan.knowledgeDomains,
    preflight: plan.preflight,
    envVar: {
      name: "OBSIDIAN_VAULT",
      expectedValue: plan.vaultPath,
      currentProcessMatches: false,
      shellProfileMutation: "not-applied",
    },
    codexConfigPointer: {
      path: codexConfigPath(args.home),
      created: false,
      approved: args.createConfigPointer,
      approvedAt: args.createConfigPointer ? createdAt : null,
    },
    git: {
      requested: plan.gitMode,
      initialized: false,
      committed: false,
      skippedReason: plan.gitMode === "skip" ? "not requested" : "",
      issues: [],
    },
    obsidianGit: {
      choice: plan.obsidianGitChoice,
      installed: false,
      enabled: false,
      preset: plan.obsidianGitChoice,
      status: plan.obsidianGitChoice === "skip" ? "skipped" : "requires-separate-approval",
    },
    hookPreview: {
      enabled: false,
      status: "not-installed",
    },
    managedArtifacts: plan.managedArtifacts,
  };
}

async function applyArtifact(vaultRoot, state, artifactToApply, plan) {
  if (artifactToApply.kind === "dir") {
    await createManagedDir(vaultRoot, artifactToApply.relativePath);
    return await markArtifactApplied(state, vaultRoot, artifactToApply.relativePath, "");
  }

  const content = renderArtifact(artifactToApply.template, plan);
  await createManagedFile(vaultRoot, artifactToApply.relativePath, content);
  return await markArtifactApplied(state, vaultRoot, artifactToApply.relativePath, contentHash(content));
}

async function createManagedDir(vaultRoot, relativePath) {
  const { normalized, targetPath, parentPath } = await validatePlannedVaultTarget(vaultRoot, relativePath);
  await mkdir(parentPath, { recursive: true });
  await mkdir(targetPath, { recursive: true });
  await validatePlannedVaultTarget(vaultRoot, normalized);
}

async function createManagedFile(vaultRoot, relativePath, content) {
  const { normalized, targetPath } = await validatePlannedVaultTarget(vaultRoot, relativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await validatePlannedVaultTarget(vaultRoot, normalized);

  if (await pathExists(targetPath)) {
    const existingHash = await fileContentHash(targetPath).catch(() => "");
    const nextHash = contentHash(content);
    if (existingHash === nextHash) return;
    throw new Error(`refusing to overwrite existing unmanaged file: ${normalized}`);
  }

  await writeFile(targetPath, content, { encoding: "utf8", flag: "wx" });
}

async function markArtifactApplied(state, vaultRoot, relativePath, hash) {
  const now = nowIso();
  const managedArtifacts = state.managedArtifacts.map((entry) =>
    entry.relativePath === relativePath
      ? {
          ...entry,
          applied: true,
          contentHash: hash || entry.contentHash,
          lastAppliedAt: now,
        }
      : entry
  );
  return {
    ...state,
    updatedAt: now,
    vaultRealPath: await realpathOrSelf(vaultRoot),
    managedArtifacts,
  };
}

async function writeState(vaultRoot, state) {
  await writeJsonAtomic(setupStatePath(vaultRoot), {
    ...state,
    updatedAt: nowIso(),
  });
}

function renderArtifact(template, plan) {
  if (template === "vault-readme") {
    return `# ${plan.projectName} - Knowledge Vault

## Project Overview

${plan.description || "Project context captured by oh-my-obsidian setup."}

## Tech Stack

${plan.techStack.length > 0 ? plan.techStack.map((item) => `- ${item}`).join("\n") : "- Not specified yet"}

## Team

${plan.team || "Not specified yet"}

## Vault Structure

${treeDiagram(plan)}

## Knowledge Domains

${plan.knowledgeDomains.map((domain) => `- ${domain}`).join("\n")}

---
Managed by oh-my-obsidian.
`;
  }

  if (template === "team-install-sh") {
    return `#!/usr/bin/env bash
set -euo pipefail

VAULT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")/../.." && pwd)"
PROFILE_FILE="\${HOME}/.profile"
MARKER_START="# oh-my-obsidian OBSIDIAN_VAULT start"
MARKER_END="# oh-my-obsidian OBSIDIAN_VAULT end"

if ! command -v git >/dev/null 2>&1; then
  printf 'git is required. Install git and rerun this script.\\n' >&2
  exit 1
fi

mkdir -p "$VAULT_DIR/작업기록/세션기록" "$VAULT_DIR/작업기록/의사결정" "$VAULT_DIR/작업기록/트러블슈팅" "$VAULT_DIR/작업기록/회의록"

if ! grep -q "$MARKER_START" "$PROFILE_FILE" 2>/dev/null; then
  {
    printf '\\n%s\\n' "$MARKER_START"
    printf 'export OBSIDIAN_VAULT=%q\\n' "$VAULT_DIR"
    printf '%s\\n' "$MARKER_END"
  } >> "$PROFILE_FILE"
fi

printf 'OBSIDIAN_VAULT configured for future shells: %s\\n' "$VAULT_DIR"
printf 'Restart Codex or export OBSIDIAN_VAULT in the current shell before use.\\n'
`;
  }

  if (template === "team-install-ps1") {
    return `$ErrorActionPreference = "Stop"

$VaultDir = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "git is required. Install git and rerun this script."
}

$Dirs = @(
    "작업기록\\세션기록",
    "작업기록\\의사결정",
    "작업기록\\트러블슈팅",
    "작업기록\\회의록"
)

foreach ($Dir in $Dirs) {
    New-Item -ItemType Directory -Force -Path (Join-Path $VaultDir $Dir) | Out-Null
}

[Environment]::SetEnvironmentVariable("OBSIDIAN_VAULT", $VaultDir, "User")
Write-Host "OBSIDIAN_VAULT configured for future shells: $VaultDir"
Write-Host "Restart Codex or set OBSIDIAN_VAULT in the current shell before use."
`;
  }

  if (template === "team-install-readme") {
    return `# Team Setup

Run the script for your platform from this directory after cloning the vault.

## macOS/Linux

\`\`\`bash
./install.sh
\`\`\`

## Windows PowerShell

\`\`\`powershell
.\\install.ps1
\`\`\`

Restart Codex after the script sets \`OBSIDIAN_VAULT\`, or export the variable
manually in the current shell before using oh-my-obsidian skills.
`;
  }

  throw new Error(`unknown artifact template: ${template}`);
}

function treeDiagram(plan) {
  const domainLines = plan.knowledgeDomains.map((domain, index) => {
    const branch = index === plan.knowledgeDomains.length - 1 ? "    └──" : "    ├──";
    return `${branch} ${domain}/`;
  });
  return ["```text", `${plan.projectName}/`, `├── ${plan.serviceRoot}/`, ...domainLines, "├── 작업기록/", "│   ├── 세션기록/", "│   ├── 의사결정/", "│   ├── 트러블슈팅/", "│   └── 회의록/", "├── scripts/team-setup/", "├── .obsidian/", "└── README.md", "```"].join("\n");
}

async function maybeInitializeGit(vaultRoot, state) {
  const gitState = {
    ...state.git,
    issues: [],
  };
  if (args.git !== "init") return gitState;
  if (!commandExists("git")) {
    return { ...gitState, skippedReason: "git is not available", issues: ["git is not available"] };
  }

  if (run("git", ["-C", vaultRoot, "rev-parse", "--is-inside-work-tree"]).status !== 0) {
    const init = run("git", ["-C", vaultRoot, "-c", "init.defaultBranch=main", "init"]);
    if (init.status !== 0) {
      return { ...gitState, skippedReason: "git init failed", issues: [init.stderr || init.stdout] };
    }
    gitState.initialized = true;
  } else {
    gitState.initialized = true;
  }

  const paths = state.managedArtifacts
    .filter((entry) => entry.applied && entry.relativePath !== ".oh-my-obsidian/setup-state.json")
    .map((entry) => entry.relativePath);
  paths.push(".oh-my-obsidian/setup-state.json");

  const statusBefore = run("git", ["-C", vaultRoot, "status", "--porcelain=v1", "--untracked-files=all"]);
  if (statusBefore.status !== 0) {
    return { ...gitState, skippedReason: "git status failed", issues: [statusBefore.stderr || statusBefore.stdout] };
  }

  const unsafePaths = collectUnsafeGitPaths(statusBefore.stdout, state.managedArtifacts.map((entry) => entry.relativePath));
  if (unsafePaths.length > 0) {
    return {
      ...gitState,
      skippedReason: "unrelated git changes exist",
      issues: [`skipped commit because unrelated git paths are dirty or staged: ${unsafePaths.join(", ")}`],
    };
  }

  const add = run("git", ["-C", vaultRoot, "add", "--", ...paths]);
  if (add.status !== 0) {
    return { ...gitState, skippedReason: "git add failed", issues: [add.stderr || add.stdout] };
  }

  const commit = run("git", ["-C", vaultRoot, "commit", "-m", "init: vault created by oh-my-obsidian"]);
  if (commit.status !== 0) {
    return { ...gitState, skippedReason: "git commit skipped or failed", issues: [commit.stderr || commit.stdout] };
  }

  return {
    ...gitState,
    committed: true,
    skippedReason: "",
    commit: run("git", ["-C", vaultRoot, "rev-parse", "--short", "HEAD"]).stdout.trim(),
  };
}

async function maybeWriteConfigPointer(state, vaultRoot, vaultRealPath) {
  if (!args.createConfigPointer) return state;
  const configPath = codexConfigPath(args.home);
  const value = {
    schema: CODEX_CONFIG_SCHEMA,
    createdBy: CODEX_CONFIG_CREATED_BY,
    vaultPath: vaultRoot,
    vaultRealPath,
    approvedAt: nowIso(),
    setupStatePath: setupStatePath(vaultRoot),
  };
  await writeJsonAtomic(configPath, value);
  return {
    ...state,
    codexConfigPointer: {
      path: configPath,
      created: true,
      approved: true,
      approvedAt: value.approvedAt,
    },
  };
}

async function buildEnvState(vaultRealPath, vaultPath) {
  let currentProcessMatches = false;
  if (process.env.OBSIDIAN_VAULT) {
    const candidate = await realpathOrEmpty(resolve(expandHome(process.env.OBSIDIAN_VAULT)));
    currentProcessMatches = candidate === vaultRealPath;
  }
  return {
    name: "OBSIDIAN_VAULT",
    expectedValue: vaultPath,
    currentProcessMatches,
    shellProfileMutation: "not-applied",
  };
}

async function completionStatus(vaultRealPath, state) {
  if (!state.managedArtifacts.every((entry) => entry.applied)) return "failed";
  if (!(await pathExists(state.vaultPath))) return "failed";
  const resolved = await resolveVault({ env: process.env, home: args.home });
  if (resolved.ok && resolved.vaultRealPath === vaultRealPath) return "complete";
  if (state.codexConfigPointer.created) {
    const pointerResolved = await resolveVault({ env: {}, home: args.home });
    if (pointerResolved.ok && pointerResolved.vaultRealPath === vaultRealPath) return "complete";
  }
  return "action_required_env";
}

async function validateSetup(vaultPathInput) {
  const vaultPath = resolve(expandHome(vaultPathInput || "", args.home));
  const issues = [];
  if (!vaultPathInput) issues.push("--vault or OBSIDIAN_VAULT is required");
  if (!(await pathExists(vaultPath))) issues.push("vault path does not exist");
  const statePath = setupStatePath(vaultPath);
  const state = await readJsonObjectIfExists(statePath, "setup-state.json", issues, true);
  if (state) {
    if (state.schema !== SETUP_STATE_SCHEMA) issues.push("setup-state schema mismatch");
    const real = await realpathOrEmpty(vaultPath);
    if (state.vaultRealPath !== real) issues.push("vaultRealPath mismatch");
    for (const entry of state.managedArtifacts || []) {
      const target = join(vaultPath, ...normalizeVaultRelativePath(entry.relativePath).split("/"));
      if (!(await pathExists(target))) issues.push(`managed artifact missing: ${entry.relativePath}`);
    }
    const resolved = await resolveVault({ env: process.env, home: args.home });
    if (!resolved.ok || resolved.vaultRealPath !== real) {
      issues.push(...(resolved.issues || []));
      return {
        schema: SETUP_STATE_SCHEMA,
        action: "validate",
        status: "action_required_env",
        issues,
        setupStatePath: statePath,
      };
    }
  }
  return {
    schema: SETUP_STATE_SCHEMA,
    action: "validate",
    status: issues.length > 0 ? "failed" : state.status || "complete",
    issues,
    setupStatePath: statePath,
  };
}

async function resumeOrReconcile({ applyMissing, resumeOnly }) {
  const vaultPath = resolve(expandHome(args.vaultPath || process.env.OBSIDIAN_VAULT || "", args.home));
  if (!vaultPath) throw new Error("--vault or OBSIDIAN_VAULT is required");
  const issues = [];
  const state = await readJsonObjectIfExists(setupStatePath(vaultPath), "setup-state.json", issues, true);
  if (!state) {
    return { schema: SETUP_STATE_SCHEMA, action: args.action, status: "failed", issues };
  }
  const vaultRealPath = await realpathOrEmpty(vaultPath);
  if (state.vaultRealPath !== vaultRealPath) {
    return {
      schema: SETUP_STATE_SCHEMA,
      action: args.action,
      status: "failed",
      issues: ["vaultRealPath mismatch"],
    };
  }
  if (resumeOnly && state.status !== "in_progress" && state.status !== "failed") {
    return {
      schema: SETUP_STATE_SCHEMA,
      action: args.action,
      status: state.status,
      issues: [`setup status is ${state.status}; use reconcile for completed setups`],
    };
  }

  const plan = buildPlan({
    vaultPath,
    projectName: state.projectName,
    serviceRoot: sanitizePathSegment(state.projectName, "Project"),
    knowledgeDomains: state.knowledgeDomains || [],
    description: "",
    techStack: [],
    team: "",
    preflight: state.preflight || {},
    gitMode: state.git?.requested || "skip",
    obsidianGitChoice: state.obsidianGit?.choice || "skip",
  });

  const missing = [];
  let nextState = {
    ...state,
    managedArtifacts: state.managedArtifacts || plan.managedArtifacts,
  };
  for (const entry of nextState.managedArtifacts) {
    const target = join(vaultPath, ...normalizeVaultRelativePath(entry.relativePath).split("/"));
    if (await pathExists(target)) continue;
    missing.push(entry.relativePath);
    if (applyMissing) {
      nextState = await applyArtifact(vaultPath, nextState, entry, plan);
      await writeState(vaultPath, nextState);
    }
  }

  if (applyMissing) {
    nextState.status = await completionStatus(await realpathOrSelf(vaultPath), nextState);
    await writeState(vaultPath, nextState);
  }

  return {
    schema: SETUP_STATE_SCHEMA,
    action: args.action,
    status: applyMissing ? nextState.status : missing.length > 0 ? "needs-reconcile" : nextState.status,
    missing,
    applied: applyMissing,
  };
}

async function parsePreflight(preflightJson) {
  if (!preflightJson) {
    return {
      status: "not-run",
      checkedAt: nowIso(),
      issues: ["run obsidian-app-preflight.mjs check before setup interview"],
    };
  }
  try {
    const value = JSON.parse(await readMaybeFile(preflightJson));
    return {
      ...value,
      checkedAt: nowIso(),
    };
  } catch (error) {
    return {
      status: "invalid",
      checkedAt: nowIso(),
      issues: [error.message],
    };
  }
}

function ensurePreflightCompleted(preflight) {
  if (!preflight || preflight.status === "not-run" || preflight.status === "invalid") {
    throw new Error("preflight result is required before apply or attach");
  }
}

async function inspectVaultBeforeBootstrap(plan, mode) {
  const issues = [];
  const vaultExists = await pathExists(plan.vaultPath);
  const statePath = setupStatePath(plan.vaultPath);
  const stateExists = await pathExists(statePath);
  const stateDirExists = await pathExists(join(plan.vaultPath, ".oh-my-obsidian"));

  if (stateExists) {
    const existingState = await readJsonObjectIfExists(statePath, "setup-state.json", issues, true);
    if (existingState) {
      if (existingState.status === "in_progress" || existingState.status === "failed") {
        issues.push("setup-state already exists; use resume instead of apply or attach");
      } else {
        issues.push("setup-state already exists; use reconcile instead of apply or attach");
      }
    }
    return { issues };
  }

  if (stateDirExists && !stateExists) {
    issues.push(".oh-my-obsidian exists without setup-state; use attach after cleanup or inspect the vault manually");
  }

  if (!vaultExists && mode === "attach") {
    issues.push("attach requires an existing vault");
  }

  if (!vaultExists) return { issues };

  for (const entry of plan.managedArtifacts) {
    if (entry.relativePath === ".oh-my-obsidian" || entry.relativePath === ".oh-my-obsidian/setup-state.json") {
      continue;
    }
    const existing = await existingArtifactState(plan.vaultPath, entry, plan);
    if (existing.conflict) issues.push(existing.conflict);
  }

  return { issues };
}

async function existingArtifactState(vaultRoot, entry, plan) {
  const target = join(vaultRoot, ...normalizeVaultRelativePath(entry.relativePath).split("/"));
  if (!(await pathExists(target))) {
    return { exists: false, hash: "" };
  }
  if (entry.kind === "dir") {
    const real = await realpathOrSelf(target);
    const statResult = await import("node:fs/promises").then((fs) => fs.stat(target));
    if (!statResult.isDirectory()) {
      return { exists: true, hash: "", conflict: `managed directory path is not a directory: ${entry.relativePath}` };
    }
    if (!isInsidePath(await realpathOrSelf(vaultRoot), real)) {
      return { exists: true, hash: "", conflict: `managed directory escapes vault: ${entry.relativePath}` };
    }
    return { exists: true, hash: "" };
  }

  const targetRealPath = await realpathOrSelf(target);
  if (!isInsidePath(await realpathOrSelf(vaultRoot), targetRealPath)) {
    return {
      exists: true,
      hash: "",
      conflict: `managed file escapes vault: ${entry.relativePath}`,
    };
  }

  const expected = entry.template === "setup-state" ? "" : renderArtifact(entry.template, plan);
  const hash = await fileContentHash(target).catch(() => "");
  if (expected && hash !== contentHash(expected)) {
    return {
      exists: true,
      hash,
      conflict: `existing unmanaged file would block setup: ${entry.relativePath}`,
    };
  }
  return { exists: true, hash };
}

async function bootstrapManagedSetup(plan) {
  const vaultRoot = plan.vaultPath;
  await mkdir(vaultRoot, { recursive: true });
  await mkdir(join(vaultRoot, ".oh-my-obsidian"), { recursive: true });
  const vaultRealPath = await realpathOrSelf(vaultRoot);
  const createdAt = nowIso();
  let state = buildInitialState(plan, vaultRealPath, createdAt);
  await writeJsonAtomic(setupStatePath(vaultRoot), state);
  state = await markArtifactApplied(state, vaultRoot, ".oh-my-obsidian", "");
  state = await markArtifactApplied(
    state,
    vaultRoot,
    ".oh-my-obsidian/setup-state.json",
    contentHash(JSON.stringify(state))
  );
  await writeState(vaultRoot, state);
  return state;
}

function setupResult(action, state) {
  return {
    schema: SETUP_STATE_SCHEMA,
    action,
    status: state.status,
    vaultPath: state.vaultPath,
    vaultRealPath: state.vaultRealPath,
    setupStatePath: setupStatePath(state.vaultPath),
    managedArtifacts: state.managedArtifacts,
    git: state.git,
    obsidianGit: state.obsidianGit,
    envVar: state.envVar,
    codexConfigPointer: state.codexConfigPointer,
    nextSteps: state.status === "complete" ? [] : envNextSteps(state.vaultPath),
  };
}

function collectUnsafeGitPaths(statusOutput, managedRelativePaths) {
  const allowed = new Set(managedRelativePaths);
  const allowedPrefixes = managedRelativePaths
    .filter((path) => !path.includes("."))
    .map((path) => `${path}/`);
  const unsafe = [];

  for (const line of statusOutput.split("\n")) {
    if (!line.trim()) continue;
    const path = extractGitStatusPath(line);
    if (!path) continue;
    const allowedPath =
      allowed.has(path) || allowedPrefixes.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
    if (!allowedPath) unsafe.push(path);
  }

  return uniqueValues(unsafe);
}

function extractGitStatusPath(line) {
  const raw = line.slice(3).trim();
  if (!raw) return "";
  if (raw.includes(" -> ")) return raw.split(" -> ").at(-1);
  return raw;
}

async function hydrateAttachState(vaultRoot, state) {
  const gitInitialized =
    commandExists("git") &&
    run("git", ["-C", vaultRoot, "rev-parse", "--is-inside-work-tree"]).status === 0;
  const pluginDir = join(vaultRoot, ".obsidian", "plugins", "obsidian-git");
  const manifestPath = join(pluginDir, "manifest.json");
  const mainPath = join(pluginDir, "main.js");
  const stylesPath = join(pluginDir, "styles.css");
  const communityPath = join(vaultRoot, ".obsidian", "community-plugins.json");
  const installed =
    (await pathExists(manifestPath)) &&
    (await pathExists(mainPath)) &&
    (await pathExists(stylesPath));
  let enabled = false;
  let inferredPreset = state.obsidianGit.preset;
  if (await pathExists(communityPath)) {
    try {
      const value = JSON.parse(await readFile(communityPath, "utf8"));
      enabled = Array.isArray(value) && value.includes("obsidian-git");
    } catch {
      enabled = false;
    }
  }
  const dataPath = join(pluginDir, "data.json");
  if (installed && await pathExists(dataPath)) {
    try {
      const data = JSON.parse(await readFile(dataPath, "utf8"));
      const syncEnabled =
        Number(data.autoSaveInterval || 0) > 0 ||
        Number(data.autoPullInterval || 0) > 0 ||
        Number(data.autoPushInterval || 0) > 0 ||
        data.disablePush === false;
      inferredPreset = syncEnabled ? "team-sync" : enabled ? "manual" : "safe";
    } catch {
      inferredPreset = enabled ? "manual" : "safe";
    }
  } else if (installed) {
    inferredPreset = enabled ? "manual" : "safe";
  }

  return {
    ...state,
    git: {
      ...state.git,
      requested: gitInitialized ? "attached-existing" : state.git.requested,
      initialized: gitInitialized,
      skippedReason: gitInitialized ? "" : state.git.skippedReason,
    },
    obsidianGit: {
      ...state.obsidianGit,
      choice: installed ? inferredPreset : state.obsidianGit.choice,
      installed,
      enabled,
      preset: installed ? inferredPreset : state.obsidianGit.preset,
      status: installed ? (enabled ? "attached-existing" : "installed-disabled") : state.obsidianGit.status,
    },
  };
}

async function readMaybeFile(value) {
  if (await pathExists(value)) return await readFile(value, "utf8");
  return value;
}

async function realpathOrSelf(path) {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

async function realpathOrEmpty(path) {
  try {
    return await realpath(path);
  } catch {
    return "";
  }
}

function envNextSteps(vaultPath) {
  return [
    `Set OBSIDIAN_VAULT for the current shell: export OBSIDIAN_VAULT="${vaultPath}"`,
    "Or rerun setup with --create-config-pointer after explicit approval.",
  ];
}

function commandExists(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8" });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

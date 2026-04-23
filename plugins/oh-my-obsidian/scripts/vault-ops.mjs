#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import {
  contentHash,
  normalizeVaultRelativePath,
  pathExists,
  resolveVault,
  sanitizePathSegment,
  slugifyAscii,
  uniqueValues,
  validatePlannedVaultTarget,
} from "./vault-core.mjs";

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  printJson({
    status: "failed",
    action: args.action || "unknown",
    issues: [error.message],
  });
  process.exit(1);
});

async function main() {
  const action = args.action;
  if (!["recall", "session-save", "vault"].includes(action)) {
    throw new Error(`unknown action: ${action || ""}`);
  }

  if (action === "recall") {
    const result = await recall();
    printJson(result);
    process.exit(result.status === "failed" ? 1 : 0);
    return;
  }

  if (action === "session-save") {
    const result = await sessionSave();
    printJson(result);
    process.exit(result.status === "failed" ? 1 : 0);
    return;
  }

  const result = await vaultCommand();
  printJson(result);
  process.exit(result.status === "failed" ? 1 : 0);
}

function parseArgs(argv) {
  const parsed = {
    action: argv[0] || "",
    subaction: argv[0] === "vault" ? argv[1] || "" : "",
    query: "",
    topic: "",
    title: "",
    category: "",
    relativeDir: "",
    detail: "",
    detailFile: "",
    body: "",
    bodyFile: "",
    commitMessage: "",
    planToken: "",
    moves: [],
    files: [],
    participants: [],
    decisions: [],
    nextSteps: [],
    tags: [],
  };

  const startIndex = argv[0] === "vault" ? 2 : 1;
  for (let index = startIndex; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--query") parsed.query = argv[++index] || "";
    else if (arg === "--topic") parsed.topic = argv[++index] || "";
    else if (arg === "--title") parsed.title = argv[++index] || "";
    else if (arg === "--category") parsed.category = argv[++index] || "";
    else if (arg === "--relative-dir") parsed.relativeDir = argv[++index] || "";
    else if (arg === "--detail") parsed.detail = argv[++index] || "";
    else if (arg === "--detail-file") parsed.detailFile = argv[++index] || "";
    else if (arg === "--body") parsed.body = argv[++index] || "";
    else if (arg === "--body-file") parsed.bodyFile = argv[++index] || "";
    else if (arg === "--commit-message") parsed.commitMessage = argv[++index] || "";
    else if (arg === "--plan-token") parsed.planToken = argv[++index] || "";
    else if (arg === "--move") parsed.moves.push(argv[++index] || "");
    else if (arg === "--file") parsed.files.push(argv[++index] || "");
    else if (arg === "--participant") parsed.participants.push(argv[++index] || "");
    else if (arg === "--decision") parsed.decisions.push(argv[++index] || "");
    else if (arg === "--next-step") parsed.nextSteps.push(argv[++index] || "");
    else if (arg === "--tag") parsed.tags.push(argv[++index] || "");
    else throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

async function recall() {
  const query = String(args.query || "").trim();
  if (!query) throw new Error("--query is required");
  const vault = await resolveManagedVault({ allowIncomplete: true });
  if (!vault.ok) return vault;

  const keywords = uniqueValues(query.split(/\s+/).map((part) => part.trim().toLowerCase())).slice(0, 8);
  const files = await collectMarkdownFiles(vault.vaultPath);
  const results = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    const lowerContent = content.toLowerCase();
    const lowerBase = basename(file).toLowerCase();
    let score = 0;
    let firstHit = -1;
    for (const keyword of keywords) {
      if (!keyword) continue;
      if (lowerBase.includes(keyword)) score += 5;
      const hit = lowerContent.indexOf(keyword);
      if (hit >= 0) {
        score += 3;
        if (firstHit === -1 || hit < firstHit) firstHit = hit;
      }
    }
    if (score === 0) continue;
    const fileStat = await stat(file);
    results.push({
      path: relative(vault.vaultPath, file),
      category: classifyPath(relative(vault.vaultPath, file)),
      excerpt: extractExcerpt(content, firstHit),
      score,
      modifiedAt: fileStat.mtime.toISOString(),
    });
  }

  results.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return right.modifiedAt.localeCompare(left.modifiedAt);
  });

  return {
    status: "ok",
    action: "recall",
    query,
    results: results.slice(0, 10),
    guidance: results.length === 0 ? ["Run the setup skill if the vault is empty or not configured."] : [],
  };
}

async function sessionSave() {
  const vault = await resolveManagedVault();
  if (!vault.ok) return vault;

  const topic = String(args.topic || "").trim();
  if (!topic) throw new Error("--topic is required");
  const categoryName = mapWorkCategory(args.category || "세션기록");
  const details = await resolveTextInput(args.detail, args.detailFile);
  const title = topic;
  const noteBody = renderSessionNote({
    title,
    topic,
    category: categoryName,
    details,
    decisions: uniqueValues(args.decisions),
    nextSteps: uniqueValues(args.nextSteps),
    files: uniqueValues(args.files),
    participants: uniqueValues(args.participants),
    tags: uniqueValues(args.tags),
  });
  const preExistingGit = inspectGitRepository(vault.vaultPath);
  const reserved = await reserveDatedMarkdownTarget(
    vault.vaultPath,
    `작업기록/${categoryName}`,
    topic,
    extractStatusPaths(preExistingGit.status)
  );
  await writeReservedMarkdownTarget(reserved, noteBody);
  const git =
    preExistingGit.isGitRepo && preExistingGit.status.length > 0
      ? {
          attempted: false,
          committed: false,
          reason: `skipped commit because pre-existing git changes make session-save ambiguous: ${preExistingGit.status.join(", ")}`,
        }
      : await maybeCommitPaths(vault.vaultPath, [reserved.relativePath], args.commitMessage || `docs: ${categoryName} - ${topic}`);

  return {
    status: "ok",
    action: "session-save",
    topic,
    relativePath: reserved.relativePath,
    git,
  };
}

async function vaultCommand() {
  const subaction = args.subaction;
  const vault = await resolveManagedVault({ allowIncomplete: true });
  if (!vault.ok) return vault;

  if (subaction === "list") return await listVault(vault);
  if (subaction === "add") return await addDocument(vault);
  if (subaction === "organize-plan") return await organizePlan(vault);
  if (subaction === "organize-apply") return await organizeApply(vault);
  if (subaction === "health-check") return await healthCheck(vault);
  throw new Error(`unknown vault subaction: ${subaction || ""}`);
}

async function listVault(vault) {
  const serviceRoot = inferServiceRoot(vault.setupState);
  const serviceCounts = await collectChildMarkdownCounts(join(vault.vaultPath, serviceRoot));
  const workCounts = await collectChildMarkdownCounts(join(vault.vaultPath, "작업기록"));
  return {
    status: "ok",
    action: "vault-list",
    serviceRoot,
    serviceCounts,
    workCounts,
  };
}

async function addDocument(vault) {
  requireCompleteSetup(vault.setupState);
  const title = String(args.title || "").trim();
  if (!title) throw new Error("--title is required");
  const body = await resolveTextInput(args.body, args.bodyFile);
  if (!body.trim()) throw new Error("--body or --body-file is required");

  const relativeDir = normalizeAddTarget(vault.setupState, args.relativeDir, args.category);
  assertNotReservedMetadataPath(relativeDir);
  const noteBody = renderGenericNote({
    title,
    body,
    tags: uniqueValues(args.tags),
    category: classifyPath(relativeDir),
  });
  const preExistingGit = inspectGitRepository(vault.vaultPath);
  const reserved = await reserveDatedMarkdownTarget(
    vault.vaultPath,
    relativeDir,
    title,
    extractStatusPaths(preExistingGit.status)
  );
  await writeReservedMarkdownTarget(reserved, noteBody);
  const git =
    preExistingGit.isGitRepo && preExistingGit.status.length > 0
      ? {
          attempted: false,
          committed: false,
          reason: `skipped commit because pre-existing git changes make vault-add ambiguous: ${preExistingGit.status.join(", ")}`,
        }
      : await maybeCommitPaths(
          vault.vaultPath,
          [reserved.relativePath],
          args.commitMessage || `docs: add ${title}`
        );

  return {
    status: "ok",
    action: "vault-add",
    relativePath: reserved.relativePath,
    git,
  };
}

async function organizePlan(vault) {
  const suggestions = await buildOrganizeSuggestions(vault.vaultPath);
  const planToken = contentHash(JSON.stringify(suggestions));
  return {
    status: "ok",
    action: "vault-organize-plan",
    planToken,
    suggestions,
  };
}

async function buildOrganizeSuggestions(vaultPath) {
  const files = await collectMarkdownFiles(vaultPath);
  const suggestions = [];
  for (const file of files) {
    const rel = relative(vaultPath, file);
    if (rel === "README.md") continue;
    if (rel.startsWith("작업기록/") || rel.startsWith(".obsidian/") || rel.startsWith(".git/") || rel.startsWith(".oh-my-obsidian/")) {
      continue;
    }
    const segments = rel.split("/");
    if (segments.length === 1) {
      suggestions.push({
        from: rel,
        to: `작업기록/세션기록/${basename(rel)}`,
        reason: "Root-level markdown file is outside managed categories.",
      });
    }
  }
  return suggestions;
}

async function organizeApply(vault) {
  requireCompleteSetup(vault.setupState);
  if (args.moves.length === 0) throw new Error("at least one --move src:dest is required");
  const suggestions = await buildOrganizeSuggestions(vault.vaultPath);
  const expectedPlanToken = contentHash(JSON.stringify(suggestions));
  if (!args.planToken || args.planToken !== expectedPlanToken) {
    throw new Error("organize-apply requires a matching --plan-token from vault organize-plan");
  }
  const allowedMoves = new Set(suggestions.map((item) => `${item.from}:${item.to}`));
  const preExistingGit = inspectGitRepository(vault.vaultPath);
  const changedPaths = [];
  for (const move of args.moves) {
    if (!allowedMoves.has(move)) throw new Error(`move is not part of the current organize plan: ${move}`);
    const [from, to] = move.split(":");
    if (!from || !to) throw new Error(`invalid move spec: ${move}`);
    assertNotReservedMetadataPath(from);
    assertNotReservedMetadataPath(to);
    const fromInfo = await validatePlannedVaultTarget(vault.vaultPath, from);
    const toInfo = await validatePlannedVaultTarget(vault.vaultPath, to);
    if (!(await pathExists(fromInfo.targetPath))) throw new Error(`source path does not exist: ${from}`);
    if (await pathExists(toInfo.targetPath)) throw new Error(`target path already exists: ${to}`);
    await mkdir(dirname(toInfo.targetPath), { recursive: true });
    await rename(fromInfo.targetPath, toInfo.targetPath);
    changedPaths.push(fromInfo.normalized, toInfo.normalized);
  }
  let git;
  if (preExistingGit.isGitRepo && preExistingGit.status.length > 0) {
    git = {
      attempted: false,
      committed: false,
      reason: `skipped commit because pre-existing git changes make organize ambiguous: ${preExistingGit.status.join(", ")}`,
    };
  } else {
    git = await maybeCommitPaths(vault.vaultPath, uniqueValues(changedPaths), args.commitMessage || "docs: organize vault");
  }
  return {
    status: "ok",
    action: "vault-organize-apply",
    moves: args.moves,
    git,
  };
}

async function healthCheck(vault) {
  const files = await collectMarkdownFiles(vault.vaultPath);
  const missingManagedArtifacts = [];
  for (const entry of vault.setupState.managedArtifacts || []) {
    const target = join(vault.vaultPath, ...normalizeVaultRelativePath(entry.relativePath).split("/"));
    if (!(await pathExists(target))) missingManagedArtifacts.push(entry.relativePath);
  }
  const git = inspectGitRepository(vault.vaultPath);
  const healthy = vault.setupState.status === "complete" && missingManagedArtifacts.length === 0;
  return {
    status: healthy ? "ok" : "needs-attention",
    action: "vault-health-check",
    setupStatus: vault.setupState.status,
    totalMarkdownFiles: files.length,
    missingManagedArtifacts,
    git,
  };
}

async function resolveManagedVault(options = {}) {
  const resolved = await resolveVault();
  if (!resolved.ok) {
    return {
      ok: false,
      status: resolved.status || "action_required_env",
      issues: resolved.issues,
      guidance: ["Run the oh-my-obsidian setup skill first."],
    };
  }
  if (!options.allowIncomplete && resolved.setupState.status !== "complete") {
    return {
      ok: false,
      status: "failed",
      issues: [`setup-state status is ${resolved.setupState.status}`],
      guidance: ["Complete or reconcile setup before mutating the vault."],
    };
  }
  return { ok: true, ...resolved };
}

async function collectMarkdownFiles(rootDir) {
  const entries = [];
  await walk(rootDir);
  return entries;

  async function walk(currentDir) {
    const dirEntries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of dirEntries) {
      if (entry.name === ".git" || entry.name === ".obsidian" || entry.name === ".oh-my-obsidian") continue;
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        entries.push(fullPath);
      }
    }
  }
}

function extractExcerpt(content, firstHit) {
  const lines = content.split("\n");
  if (firstHit < 0) return lines.slice(0, 6).join("\n");
  let seen = 0;
  let lineIndex = 0;
  while (lineIndex < lines.length && seen + lines[lineIndex].length + 1 <= firstHit) {
    seen += lines[lineIndex].length + 1;
    lineIndex += 1;
  }
  const start = Math.max(0, lineIndex - 2);
  return lines.slice(start, start + 5).join("\n");
}

function classifyPath(relativePath) {
  if (relativePath.startsWith("작업기록/세션기록")) return "세션기록";
  if (relativePath.startsWith("작업기록/의사결정")) return "의사결정";
  if (relativePath.startsWith("작업기록/트러블슈팅")) return "트러블슈팅";
  if (relativePath.startsWith("작업기록/회의록")) return "회의록";
  return "서비스";
}

function renderSessionNote({ title, topic, category, details, decisions, nextSteps, files, participants, tags }) {
  const timestamp = new Date().toISOString();
  const participantText = participants.length > 0 ? participants.join(", ") : "Codex, User";
  const tagText = tags.length > 0 ? tags.join(", ") : "";
  return `---
date: ${timestamp}
topic: ${topic}
category: ${category}
participants: [${participantText}]
tags: [${tagText}]
---

# ${title}

## Summary

${details || "Session summary recorded by oh-my-obsidian."}

## Decisions

${decisions.length > 0 ? decisions.map((item) => `- ${item}`).join("\n") : "- None recorded"}

## Files

${files.length > 0 ? files.map((item) => `- \`${item}\``).join("\n") : "- None recorded"}

## Next Steps

${nextSteps.length > 0 ? nextSteps.map((item) => `- [ ] ${item}`).join("\n") : "- [ ] None recorded"}
`;
}

function renderGenericNote({ title, body, tags, category }) {
  const timestamp = new Date().toISOString();
  const tagText = tags.length > 0 ? tags.join(", ") : "";
  return `---
date: ${timestamp}
topic: ${title}
category: ${category}
tags: [${tagText}]
---

# ${title}

${body}
`;
}

async function reserveDatedMarkdownTarget(vaultPath, relativeDir, title, blockedRelativePaths = []) {
  const normalizedDir = normalizeVaultRelativePath(relativeDir);
  const baseSlug = slugifyAscii(title, "note");
  const date = new Date().toISOString().slice(0, 10);
  let suffix = 0;
  const blocked = new Set(blockedRelativePaths);

  while (true) {
    const filename = suffix === 0 ? `${date}_${baseSlug}.md` : `${date}_${baseSlug}_${suffix + 1}.md`;
    const relativePath = `${normalizedDir}/${filename}`;
    const target = await validatePlannedVaultTarget(vaultPath, relativePath);
    if (!(await pathExists(target.targetPath)) && !blocked.has(target.normalized)) {
      return {
        relativePath: target.normalized,
        targetPath: target.targetPath,
      };
    }
    suffix += 1;
  }
}

async function writeReservedMarkdownTarget(target, body) {
  await mkdir(dirname(target.targetPath), { recursive: true });
  await writeFile(target.targetPath, body, { encoding: "utf8", flag: "wx" });
}

function mapWorkCategory(input) {
  const category = String(input || "").trim();
  if (["세션기록", "session", "session-log"].includes(category)) return "세션기록";
  if (["의사결정", "decision", "adr"].includes(category)) return "의사결정";
  if (["트러블슈팅", "troubleshooting", "issue"].includes(category)) return "트러블슈팅";
  if (["회의록", "meeting", "meeting-notes"].includes(category)) return "회의록";
  return category || "세션기록";
}

function inferServiceRoot(setupState) {
  const candidate = (setupState.managedArtifacts || [])
    .map((entry) => entry.relativePath)
    .find((relativePath) =>
      !relativePath.startsWith(".") &&
      !relativePath.startsWith("작업기록") &&
      !relativePath.startsWith("scripts")
    );
  return candidate || sanitizePathSegment(setupState.projectName, "Project");
}

async function collectChildMarkdownCounts(rootDir) {
  if (!(await pathExists(rootDir))) return [];
  const entries = await readdir(rootDir, { withFileTypes: true });
  const counts = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const childDir = join(rootDir, entry.name);
    const files = await collectMarkdownFiles(childDir);
    counts.push({ name: entry.name, count: files.length });
  }
  return counts;
}

async function resolveTextInput(text, filePath) {
  if (filePath) return await readFile(filePath, "utf8");
  return text || "";
}

function normalizeAddTarget(setupState, relativeDir, category) {
  if (relativeDir) return normalizeVaultRelativePath(relativeDir);
  if (category) return `작업기록/${mapWorkCategory(category)}`;
  return `작업기록/세션기록`;
}

function assertNotReservedMetadataPath(relativePath) {
  const normalized = normalizeVaultRelativePath(relativePath);
  if (
    normalized === ".git" ||
    normalized === ".obsidian" ||
    normalized === ".oh-my-obsidian" ||
    normalized.startsWith(".git/") ||
    normalized.startsWith(".obsidian/") ||
    normalized.startsWith(".oh-my-obsidian/")
  ) {
    throw new Error(`reserved metadata paths are not allowed: ${normalized}`);
  }
}

function requireCompleteSetup(setupState) {
  if (setupState.status !== "complete") {
    throw new Error(`setup-state status is ${setupState.status}`);
  }
}

async function maybeCommitPaths(vaultPath, relativePaths, commitMessage) {
  const inspection = inspectGitRepository(vaultPath, relativePaths);
  if (!inspection.isGitRepo) {
    return {
      attempted: false,
      committed: false,
      reason: "vault is not a git repository",
    };
  }

  if (inspection.unsafePaths.length > 0) {
    return {
      attempted: false,
      committed: false,
      reason: `skipped commit because unrelated git paths are dirty or staged: ${inspection.unsafePaths.join(", ")}`,
    };
  }

  const add = run("git", ["-C", vaultPath, "add", "--", ...relativePaths]);
  if (add.status !== 0) {
    return {
      attempted: true,
      committed: false,
      reason: add.stderr || add.stdout,
    };
  }

  const commit = run("git", ["-C", vaultPath, "commit", "-m", commitMessage]);
  if (commit.status !== 0) {
    return {
      attempted: true,
      committed: false,
      reason: commit.stderr || commit.stdout,
    };
  }

  const verify = run("git", ["-C", vaultPath, "diff", "--cached", "--name-only", "--", ...relativePaths]);
  return {
    attempted: true,
    committed: true,
    commit: run("git", ["-C", vaultPath, "rev-parse", "--short", "HEAD"]).stdout.trim(),
    indexClear: verify.stdout.trim().length === 0,
  };
}

function inspectGitRepository(vaultPath, allowedRelativePaths = []) {
  if (!commandExists("git")) {
    return { available: false, isGitRepo: false, unsafePaths: [], status: [] };
  }
  const repoCheck = run("git", ["-C", vaultPath, "rev-parse", "--is-inside-work-tree"]);
  if (repoCheck.status !== 0) {
    return { available: true, isGitRepo: false, unsafePaths: [], status: [] };
  }
  const status = run("git", ["-C", vaultPath, "status", "--porcelain=v1", "--untracked-files=all"]);
  const unsafePaths = collectUnsafeGitPaths(status.stdout, allowedRelativePaths);
  return {
    available: true,
    isGitRepo: true,
    unsafePaths,
    status: status.stdout.trim().split("\n").filter(Boolean),
  };
}

function collectUnsafeGitPaths(statusOutput, allowedRelativePaths) {
  const allowed = new Set(allowedRelativePaths);
  const unsafe = [];
  for (const line of statusOutput.split("\n")) {
    if (!line.trim()) continue;
    for (const path of parseGitStatusPaths(line)) {
      if (!allowed.has(path)) unsafe.push(path);
    }
  }
  return uniqueValues(unsafe);
}

function extractStatusPaths(statusLines) {
  return uniqueValues(statusLines.flatMap((line) => parseGitStatusPaths(line)));
}

function parseGitStatusPaths(line) {
  const raw = line.slice(3).trim();
  if (!raw) return [];
  if (raw.includes(" -> ")) {
    const [from, to] = raw.split(" -> ");
    return [decodeGitPath(from), decodeGitPath(to)];
  }
  return [decodeGitPath(raw)];
}

function decodeGitPath(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1).replace(/\\"/g, '"');
    }
  }
  return trimmed;
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

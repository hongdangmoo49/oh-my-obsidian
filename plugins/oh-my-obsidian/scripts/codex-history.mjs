#!/usr/bin/env node
/**
 * codex-history.mjs — Codex CLI session file discovery, parsing, and restore helper.
 *
 * Actions:
 *   scan     — Discover Codex sessions and return metadata.
 *   restore  — Read sessions and write structured Markdown files to an Obsidian vault.
 *
 * Platform paths:
 *   macOS / Linux / WSL:     ~/.codex/sessions/
 *   Windows (native):        %USERPROFILE%\.codex\sessions\
 *   Override with $CODEX_HOME → $CODEX_HOME/sessions/
 *
 * Codex rollout files follow:
 *   $CODEX_HOME/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-*.jsonl
 */

import { readFile, readdir, mkdir, writeFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathExists, writeJsonAtomic, catalogPath, nowIso } from "./vault-core.mjs";
import {
  discoverRolloutFiles,
  extractRolloutMeta,
  parseRolloutFile,
  extractCwd,
  extractTextContent,
  normalizeCwdForComparison,
  resolveCodexHome as sharedResolveCodexHome,
  resolveSessionsRoot as sharedResolveSessionsRoot,
  detectPlatformLabel,
  humanFileSize,
} from "./parse-codex-rollout.mjs";

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

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
  if (!["scan", "restore"].includes(args.action)) {
    throw new Error(`unknown action: ${args.action || ""}`);
  }

  if (args.action === "scan") {
    const result = await scanSessions();
    printJson(result);
    return;
  }

  if (args.action === "restore") {
    const result = await restoreSessions();
    printJson(result);
    process.exit(result.status === "failed" ? 1 : 0);
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const parsed = {
    action: argv[0] || "",
    cwd: "",
    vault: "",
    recent: 0,
    from: "",
    to: "",
    all: false,
    codexHome: "",
    commitMessage: "",
    updateCatalog: false,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cwd") parsed.cwd = argv[++index] || "";
    else if (arg === "--vault") parsed.vault = argv[++index] || "";
    else if (arg === "--recent") parsed.recent = parseInt(argv[++index] || "0", 10) || 0;
    else if (arg === "--from") parsed.from = argv[++index] || "";
    else if (arg === "--to") parsed.to = argv[++index] || "";
    else if (arg === "--all") parsed.all = true;
    else if (arg === "--codex-home") parsed.codexHome = argv[++index] || "";
    else if (arg === "--commit-message") parsed.commitMessage = argv[++index] || "";
    else if (arg === "--update-catalog") parsed.updateCatalog = true;
    else throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Codex home resolution (delegates to shared module)
// ---------------------------------------------------------------------------

function resolveCodexHome() {
  return sharedResolveCodexHome(args.codexHome);
}

function resolveSessionsRoot() {
  return sharedResolveSessionsRoot(args.codexHome);
}

// ---------------------------------------------------------------------------
// Scan action
// ---------------------------------------------------------------------------

async function scanSessions() {
  const sessionsRoot = resolveSessionsRoot();
  if (!(await pathExists(sessionsRoot))) {
    return {
      status: "ok",
      action: "scan",
      codexHome: resolveCodexHome(),
      sessionsRoot,
      sessionsFound: false,
      sessions: [],
      message: `Codex 세션 디렉토리가 존재하지 않습니다: ${sessionsRoot}`,
    };
  }

  const rolloutFiles = await discoverRolloutFiles(sessionsRoot);
  if (rolloutFiles.length === 0) {
    return {
      status: "ok",
      action: "scan",
      codexHome: resolveCodexHome(),
      sessionsRoot,
      sessionsFound: false,
      sessions: [],
      message: "Codex 세션 파일이 없습니다.",
    };
  }

  const allMeta = [];
  for (const file of rolloutFiles) {
    const meta = await extractRolloutMeta(file);
    if (meta) allMeta.push(meta);
  }

  let filtered = allMeta;

  if (args.cwd) {
    const normalizedCwd = normalizeCwdForComparison(args.cwd);
    filtered = filtered.filter((m) => {
      if (!m.sessionCwd) return false;
      return normalizeCwdForComparison(m.sessionCwd) === normalizedCwd;
    });
  }

  if (args.from) filtered = filtered.filter((m) => m.date >= args.from);
  if (args.to) filtered = filtered.filter((m) => m.date <= args.to);

  filtered = filtered.filter((m) => m.sizeBytes >= 1024);

  filtered.sort((a, b) => {
    const dateComp = b.date.localeCompare(a.date);
    if (dateComp !== 0) return dateComp;
    return b.time.localeCompare(a.time);
  });

  if (args.recent > 0) filtered = filtered.slice(0, args.recent);

  const totalSizeBytes = filtered.reduce((sum, m) => sum + m.sizeBytes, 0);

  return {
    status: "ok",
    action: "scan",
    codexHome: resolveCodexHome(),
    sessionsRoot,
    sessionsFound: true,
    platform: detectPlatformLabel(),
    totalRolloutFiles: rolloutFiles.length,
    filteredCount: filtered.length,
    totalSizeBytes,
    totalSizeHuman: humanFileSize(totalSizeBytes),
    sessions: filtered.map((m) => ({
      fileName: m.fileName,
      date: m.date,
      time: m.time,
      sizeBytes: m.sizeBytes,
      sizeHuman: humanFileSize(m.sizeBytes),
      firstUserMessage: m.firstUserMessage,
      sessionCwd: m.sessionCwd,
      lineCount: m.lineCount,
    })),
  };
}

// ---------------------------------------------------------------------------
// Restore action
// ---------------------------------------------------------------------------

async function restoreSessions() {
  const vaultPath = args.vault || process.env.OBSIDIAN_VAULT || "";
  if (!vaultPath) {
    throw new Error("--vault 또는 OBSIDIAN_VAULT 환경변수가 필요합니다.");
  }

  const resolvedVault = resolve(vaultPath);
  if (!(await pathExists(resolvedVault))) {
    throw new Error(`볼트 경로가 존재하지 않습니다: ${resolvedVault}`);
  }

  const scanResult = await scanSessions();
  if (!scanResult.sessionsFound || scanResult.filteredCount === 0) {
    return {
      status: "ok",
      action: "restore",
      restored: 0,
      skipped: 0,
      message: "복원할 Codex 세션이 없습니다.",
    };
  }

  const sessionsRoot = resolveSessionsRoot();
  const generatedFiles = [];
  const skippedSessions = [];
  const sessionFileMap = new Map(); // fileName → relativePath
  let restored = 0;

  for (const sessionMeta of scanResult.sessions) {
    const filePath = join(sessionsRoot, resolveRelativeSessionPath(sessionMeta));
    let rawContent;
    try {
      rawContent = await readFile(filePath, "utf8");
    } catch {
      const allFiles = await discoverRolloutFiles(sessionsRoot);
      const match = allFiles.find((f) => basename(f) === sessionMeta.fileName);
      if (!match) {
        skippedSessions.push({ fileName: sessionMeta.fileName, reason: "file not found" });
        continue;
      }
      try {
        rawContent = await readFile(match, "utf8");
      } catch {
        skippedSessions.push({ fileName: sessionMeta.fileName, reason: "read error" });
        continue;
      }
    }

    const parsed = parseRolloutFile(rawContent, sessionMeta);

    if (parsed.userMessages.length === 0) {
      skippedSessions.push({ fileName: sessionMeta.fileName, reason: "no user messages" });
      continue;
    }

    const substantiveMessages = parsed.userMessages.filter((m) => m.text.length >= 10);
    if (substantiveMessages.length === 0) {
      skippedSessions.push({ fileName: sessionMeta.fileName, reason: "no substantive messages" });
      continue;
    }

    const topicMessage = substantiveMessages[0].text;
    const topic = topicMessage.slice(0, 60);
    const slug = generateSlug(topic, sessionMeta.fileName);

    const markdownContent = renderCodexSessionNote({
      date: sessionMeta.date,
      time: sessionMeta.time,
      topic,
      userMessages: parsed.userMessages,
      toolsUsed: parsed.toolsUsed,
      filesModified: parsed.filesModified,
      sessionCwd: parsed.sessionCwd,
      fileName: sessionMeta.fileName,
      source: "codex-rollout",
    });

    const targetDir = join(resolvedVault, "작업기록", "세션기록");
    await mkdir(targetDir, { recursive: true });

    const targetFileName = `${sessionMeta.date}_${slug}.md`;
    let finalPath = join(targetDir, targetFileName);

    let suffix = 1;
    while (await pathExists(finalPath)) {
      suffix += 1;
      finalPath = join(targetDir, `${sessionMeta.date}_${slug}-${suffix}.md`);
    }

    try {
      await writeFile(finalPath, markdownContent, { encoding: "utf8", flag: "wx" });
      const relativePath = `작업기록/세션기록/${basename(finalPath)}`;
      generatedFiles.push(relativePath);
      sessionFileMap.set(sessionMeta.fileName, relativePath);
      restored += 1;
    } catch (writeError) {
      skippedSessions.push({ fileName: sessionMeta.fileName, reason: `write error: ${writeError.message}` });
    }
  }

  // Update catalog if requested
  let catalogUpdate = null;
  if (args.updateCatalog && generatedFiles.length > 0) {
    catalogUpdate = await updateCatalogWithRestoredSessions(resolvedVault, sessionFileMap);
  }

  const git = await maybeGitCommit(resolvedVault, generatedFiles, restored);

  return {
    status: "ok",
    action: "restore",
    platform: detectPlatformLabel(),
    codexHome: resolveCodexHome(),
    vaultPath: resolvedVault,
    restored,
    skipped: skippedSessions.length,
    skippedSessions,
    generatedFiles,
    catalogUpdate,
    git,
    message: restored > 0
      ? `${restored}개 Codex 세션 기록이 볼트에 복원되었습니다.`
      : "복원할 의미 있는 세션 기록이 없습니다.",
  };
}

// ---------------------------------------------------------------------------
// Catalog update (for --update-catalog)
// ---------------------------------------------------------------------------

async function updateCatalogWithRestoredSessions(vaultPath, sessionFileMap) {
  const catPath = catalogPath(vaultPath);
  let catalog;
  try {
    catalog = JSON.parse(await readFile(catPath, "utf8"));
  } catch {
    return { updated: false, reason: "catalog file not found or unreadable" };
  }

  let updatedCount = 0;
  for (const entry of catalog.sessions || []) {
    if (entry.source !== "codex") continue;
    const docPath = sessionFileMap.get(entry.sourceFile);
    if (docPath) {
      entry.documentGenerated = true;
      entry.documentPath = docPath;
      updatedCount += 1;
    }
  }

  catalog.updatedAt = nowIso();
  catalog.stats.documentedSessions = (catalog.sessions || []).filter((s) => s.documentGenerated).length;

  try {
    await writeJsonAtomic(catPath, catalog);
    return { updated: true, sessionsUpdated: updatedCount };
  } catch (error) {
    return { updated: false, reason: error.message };
  }
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function renderCodexSessionNote({ date, time, topic, userMessages, toolsUsed, filesModified, sessionCwd, fileName, source }) {
  const dateTime = `${date} ${time}`;
  const messageList = userMessages
    .map((m) => {
      const ts = m.timestamp ? extractTime(m.timestamp) : "";
      const prefix = ts ? `${ts}: ` : "- ";
      const text = m.text.slice(0, 120);
      return `- ${prefix}${text}`;
    })
    .join("\n");

  const toolSection = toolsUsed.length > 0
    ? `\n## 사용된 도구\n- ${toolsUsed.join(", ")}\n`
    : "";

  const fileSection = filesModified.length > 0
    ? `\n## 수정된 파일\n${filesModified.map((f) => `- ${f}`).join("\n")}\n`
    : "";

  const cwdSection = sessionCwd ? `\nproject: ${sessionCwd}` : "";

  return `---
date: ${dateTime}
topic: ${topic}
category: 세션기록
participants: [Codex, User]
restoredFrom: ${source}
codexRollout: ${fileName}${cwdSection}
---

# ${topic}

## 요약
${fileName} 세션의 사용자 요청 기록입니다.
전체 대화 내용은 restore-history 명령어로 복원할 수 있습니다.

## 사용자 요청 목록
${messageList}
${toolSection}${fileSection}
## 비고
이 기록은 Codex CLI rollout 파일에서 자동 생성된 경량 복원본입니다.
`;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async function maybeGitCommit(vaultPath, relativePaths, restoredCount) {
  if (relativePaths.length === 0) {
    return { attempted: false, committed: false, reason: "no files to commit" };
  }

  const { spawnSync } = await import("node:child_process");

  const repoCheck = spawnSync("git", ["-C", vaultPath, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (repoCheck.status !== 0) {
    return { attempted: false, committed: false, reason: "vault is not a git repository" };
  }

  const statusCheck = spawnSync("git", ["-C", vaultPath, "status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" });
  const statusLines = (statusCheck.stdout || "").trim().split("\n").filter(Boolean);
  const ourPaths = new Set(relativePaths);
  const unsafePaths = statusLines.filter((line) => {
    const path = line.slice(3).trim();
    return !ourPaths.has(path);
  });

  if (unsafePaths.length > 0) {
    return {
      attempted: false,
      committed: false,
      reason: `skipped commit because pre-existing git changes exist: ${unsafePaths.length} unrelated paths`,
    };
  }

  const add = spawnSync("git", ["-C", vaultPath, "add", "--", ...relativePaths], { encoding: "utf8" });
  if (add.status !== 0) {
    return { attempted: true, committed: false, reason: add.stderr || add.stdout };
  }

  const message = args.commitMessage || `restore: Codex 세션 기록 ${restoredCount}개 복원`;
  const commit = spawnSync("git", ["-C", vaultPath, "commit", "-m", message], { encoding: "utf8" });
  if (commit.status !== 0) {
    return { attempted: true, committed: false, reason: commit.stderr || commit.stdout };
  }

  const rev = spawnSync("git", ["-C", vaultPath, "rev-parse", "--short", "HEAD"], { encoding: "utf8" });
  return {
    attempted: true,
    committed: true,
    commit: (rev.stdout || "").trim(),
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function generateSlug(topic, fallbackFileName) {
  let slug = String(topic || "")
    .replace(/\s+/g, "-")
    .replace(/[\\/:*?"<>|]+/g, "")
    .slice(0, 60);

  if (!slug) {
    slug = fallbackFileName
      .replace(/^rollout-/, "")
      .replace(/\.jsonl$/, "")
      .slice(0, 30);
  }

  return slug;
}

function extractTime(timestamp) {
  if (!timestamp) return "";
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return "";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function resolveRelativeSessionPath(meta) {
  const parts = meta.date.split("-");
  if (parts.length === 3) {
    return join(parts[0], parts[1], parts[2], meta.fileName);
  }
  return meta.fileName;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

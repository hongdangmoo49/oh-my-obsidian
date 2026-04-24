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
 *
 * Each line in a rollout JSONL is an independent JSON object. Known fields:
 *   { type: "message", role: "user"|"assistant"|"developer", content: [...] }
 *   { type: "tool_call", tool: "...", ... }
 *   { type: "execution_result", tool: "...", output: "..." }
 *   { type: "plan", id: "...", text: "..." }
 *
 * This script is intentionally defensive: unknown line formats are silently
 * skipped so it gracefully handles future schema changes in Codex CLI.
 */

import { readFile, readdir, mkdir, writeFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathExists } from "./vault-core.mjs";

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
    else throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Codex home resolution (cross-platform)
// ---------------------------------------------------------------------------

/**
 * Resolve the Codex home directory with platform-aware logic.
 *
 * Priority:
 *   1. --codex-home CLI flag
 *   2. $CODEX_HOME environment variable
 *   3. Platform default:
 *      - macOS / Linux / WSL: ~/.codex
 *      - Windows native:      %USERPROFILE%\.codex
 */
function resolveCodexHome() {
  if (args.codexHome) return resolve(args.codexHome);
  if (process.env.CODEX_HOME) return resolve(process.env.CODEX_HOME);

  const home = homedir();
  // All platforms default to $HOME/.codex (or %USERPROFILE%\.codex on Windows)
  return join(home, ".codex");
}

/**
 * Return the sessions root: $CODEX_HOME/sessions
 */
function resolveSessionsRoot() {
  return join(resolveCodexHome(), "sessions");
}

// ---------------------------------------------------------------------------
// Session discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collect all rollout-*.jsonl files under the sessions root.
 * Returns an array of absolute paths sorted by filename (chronological).
 */
async function discoverRolloutFiles(sessionsRoot) {
  const files = [];
  if (!(await pathExists(sessionsRoot))) return files;

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  }

  await walk(sessionsRoot);
  files.sort(); // filenames are date-based, so lexical sort ≈ chronological
  return files;
}

/**
 * Extract lightweight metadata from a rollout file WITHOUT reading the entire content.
 * Reads only the first ~8KB to extract the first user message and timestamps.
 */
async function extractRolloutMeta(filePath) {
  const fileName = basename(filePath);
  const fileStat = await stat(filePath);

  // Parse date from filename: rollout-YYYY-MM-DDTHH-MM-SS-*.jsonl
  const dateMatch = fileName.match(/^rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  const dateStr = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : new Date(fileStat.mtime).toISOString().slice(0, 10);
  const timeStr = dateMatch
    ? `${dateMatch[4]}:${dateMatch[5]}`
    : new Date(fileStat.mtime).toISOString().slice(11, 16);

  // Read first chunk to get metadata
  let firstUserMessage = "";
  let sessionCwd = "";
  let rawContent;
  try {
    rawContent = await readFile(filePath, "utf8");
  } catch {
    return null;
  }

  const lines = rawContent.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);

      // Try to extract cwd from metadata/context lines
      if (!sessionCwd) {
        sessionCwd = extractCwd(obj);
      }

      // Extract first user message for topic inference
      if (!firstUserMessage && obj.role === "user") {
        firstUserMessage = extractTextContent(obj);
      }

      // Stop early once we have both
      if (firstUserMessage && sessionCwd) break;
    } catch {
      continue;
    }
  }

  return {
    filePath,
    fileName,
    date: dateStr,
    time: timeStr,
    sizeBytes: fileStat.size,
    firstUserMessage: firstUserMessage.slice(0, 120),
    sessionCwd,
    lineCount: lines.filter((l) => l.trim()).length,
  };
}

/**
 * Try to extract the working directory from various possible metadata structures.
 * Codex rollout files may store cwd in different ways across versions.
 */
function extractCwd(obj) {
  // Direct cwd field
  if (obj.cwd) return String(obj.cwd);
  // Nested in metadata
  if (obj.metadata?.cwd) return String(obj.metadata.cwd);
  // Nested in context
  if (obj.context?.cwd) return String(obj.context.cwd);
  // Nested in session info
  if (obj.session?.cwd) return String(obj.session.cwd);
  // Working directory field
  if (obj.working_directory) return String(obj.working_directory);
  if (obj.workingDirectory) return String(obj.workingDirectory);
  return "";
}

/**
 * Extract text content from a message object.
 * Handles both string and array content formats.
 */
function extractTextContent(obj) {
  if (typeof obj.content === "string") return obj.content;
  if (Array.isArray(obj.content)) {
    for (const part of obj.content) {
      if (typeof part === "string") return part;
      if (part?.text) return String(part.text);
      if (part?.type === "input_text" && part?.text) return String(part.text);
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Full session parsing
// ---------------------------------------------------------------------------

/**
 * Parse a complete rollout JSONL file into a structured session object.
 */
function parseRolloutFile(rawContent, meta) {
  const lines = rawContent.split("\n");
  const userMessages = [];
  const toolsUsed = new Set();
  const filesModified = new Set();
  let sessionCwd = meta.sessionCwd || "";

  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    // Extract cwd if not already found
    if (!sessionCwd) {
      sessionCwd = extractCwd(obj);
    }

    // Collect user messages
    if (obj.role === "user") {
      const text = extractTextContent(obj);
      if (text) {
        userMessages.push({
          text,
          timestamp: obj.timestamp || obj.created_at || "",
        });
      }
    }

    // Collect tool usage
    if (obj.type === "tool_call" || obj.type === "function_call") {
      const toolName = obj.tool || obj.name || obj.function?.name || "";
      if (toolName) toolsUsed.add(toolName);
    }
    if (obj.tool_calls && Array.isArray(obj.tool_calls)) {
      for (const tc of obj.tool_calls) {
        const name = tc.function?.name || tc.tool || tc.name || "";
        if (name) toolsUsed.add(name);
      }
    }

    // Collect file modifications from tool calls
    if (obj.type === "tool_call" || obj.type === "function_call") {
      const path = obj.path || obj.input?.path || obj.arguments?.path || "";
      if (path && (obj.tool === "filesystem_write" || obj.tool === "write" || obj.tool === "edit" || obj.tool === "create")) {
        filesModified.add(path);
      }
    }
  }

  return {
    sessionCwd,
    userMessages,
    toolsUsed: [...toolsUsed],
    filesModified: [...filesModified],
    totalLines: lines.filter((l) => l.trim()).length,
  };
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

  // Extract metadata for all files
  const allMeta = [];
  for (const file of rolloutFiles) {
    const meta = await extractRolloutMeta(file);
    if (meta) allMeta.push(meta);
  }

  // Apply filters
  let filtered = allMeta;

  // Filter by CWD (project)
  if (args.cwd) {
    const normalizedCwd = normalizeCwdForComparison(args.cwd);
    filtered = filtered.filter((m) => {
      if (!m.sessionCwd) return false;
      return normalizeCwdForComparison(m.sessionCwd) === normalizedCwd;
    });
  }

  // Filter by date range
  if (args.from) {
    filtered = filtered.filter((m) => m.date >= args.from);
  }
  if (args.to) {
    filtered = filtered.filter((m) => m.date <= args.to);
  }

  // Filter small files (< 1KB)
  filtered = filtered.filter((m) => m.sizeBytes >= 1024);

  // Sort by date descending (newest first)
  filtered.sort((a, b) => {
    const dateComp = b.date.localeCompare(a.date);
    if (dateComp !== 0) return dateComp;
    return b.time.localeCompare(a.time);
  });

  // Apply recent limit
  if (args.recent > 0) {
    filtered = filtered.slice(0, args.recent);
  }

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
  // Resolve vault
  const vaultPath = args.vault || process.env.OBSIDIAN_VAULT || "";
  if (!vaultPath) {
    throw new Error("--vault 또는 OBSIDIAN_VAULT 환경변수가 필요합니다.");
  }

  const resolvedVault = resolve(vaultPath);
  if (!(await pathExists(resolvedVault))) {
    throw new Error(`볼트 경로가 존재하지 않습니다: ${resolvedVault}`);
  }

  // Scan sessions first
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
  let restored = 0;

  // Process sessions
  for (const sessionMeta of scanResult.sessions) {
    const filePath = join(sessionsRoot, resolveRelativeSessionPath(sessionMeta));
    let rawContent;
    try {
      rawContent = await readFile(filePath, "utf8");
    } catch {
      // Fallback: try to find the file by walking
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

    // Skip empty sessions
    if (parsed.userMessages.length === 0) {
      skippedSessions.push({ fileName: sessionMeta.fileName, reason: "no user messages" });
      continue;
    }

    // Skip sessions where ALL messages are trivially short (< 10 chars)
    const substantiveMessages = parsed.userMessages.filter((m) => m.text.length >= 10);
    if (substantiveMessages.length === 0) {
      skippedSessions.push({ fileName: sessionMeta.fileName, reason: "no substantive messages" });
      continue;
    }

    // Derive topic from first substantive user message
    const topicMessage = substantiveMessages[0].text;
    const topic = topicMessage.slice(0, 60);
    const slug = generateSlug(topic, sessionMeta.fileName);

    // Generate markdown
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

    // Write to vault
    const targetDir = join(resolvedVault, "작업기록", "세션기록");
    await mkdir(targetDir, { recursive: true });

    const targetFileName = `${sessionMeta.date}_${slug}.md`;
    let finalPath = join(targetDir, targetFileName);

    // Handle duplicates
    let suffix = 1;
    while (await pathExists(finalPath)) {
      suffix += 1;
      finalPath = join(targetDir, `${sessionMeta.date}_${slug}-${suffix}.md`);
    }

    try {
      await writeFile(finalPath, markdownContent, { encoding: "utf8", flag: "wx" });
      const relativePath = `작업기록/세션기록/${basename(finalPath)}`;
      generatedFiles.push(relativePath);
      restored += 1;
    } catch (writeError) {
      skippedSessions.push({ fileName: sessionMeta.fileName, reason: `write error: ${writeError.message}` });
    }
  }

  // Git commit if vault is a git repo
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
    git,
    message: restored > 0
      ? `${restored}개 Codex 세션 기록이 볼트에 복원되었습니다.`
      : "복원할 의미 있는 세션 기록이 없습니다.",
  };
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

  // Check if vault is a git repo
  const repoCheck = spawnSync("git", ["-C", vaultPath, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (repoCheck.status !== 0) {
    return { attempted: false, committed: false, reason: "vault is not a git repository" };
  }

  // Check for pre-existing changes
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

  // Stage and commit
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

/**
 * Normalize a CWD path for cross-platform comparison.
 * Handles Windows backslashes, drive letter casing, trailing slashes.
 */
function normalizeCwdForComparison(cwd) {
  let normalized = String(cwd || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");

  // Lowercase drive letter on Windows paths (C:/... → c:/...)
  if (/^[A-Z]:\//.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }

  return normalized;
}

/**
 * Try to reconstruct the relative path under sessions/ from a session meta object.
 */
function resolveRelativeSessionPath(meta) {
  // Date parts from meta.date (YYYY-MM-DD)
  const parts = meta.date.split("-");
  if (parts.length === 3) {
    return join(parts[0], parts[1], parts[2], meta.fileName);
  }
  return meta.fileName;
}

function detectPlatformLabel() {
  const os = platform();
  if (os === "darwin") return "macOS";
  if (os === "win32") return "Windows";
  if (os === "linux") {
    // Check for WSL
    try {
      const procVersion = readFileSync("/proc/version", "utf8").toLowerCase();
      if (procVersion.includes("microsoft") || procVersion.includes("wsl")) {
        return "WSL";
      }
    } catch {
      // Not WSL or can't read
    }
    return "Linux";
  }
  return os;
}

function humanFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

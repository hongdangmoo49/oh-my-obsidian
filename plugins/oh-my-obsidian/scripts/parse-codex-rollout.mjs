/**
 * parse-codex-rollout.mjs — Shared Codex CLI rollout parsing utilities.
 *
 * Extracted from codex-history.mjs so that transcript-preextract.mjs
 * can reuse the same parsing logic without importing the CLI entry point.
 *
 * All functions are pure (no global state, no side effects).
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { pathExists } from "./vault-core.mjs";

// ---------------------------------------------------------------------------
// Codex home resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the Codex home directory.
 * Priority: explicit override → $CODEX_HOME env → platform default ~/.codex
 */
export function resolveCodexHome(codexHomeOverride) {
  if (codexHomeOverride) return resolve(codexHomeOverride);
  if (process.env.CODEX_HOME) return resolve(process.env.CODEX_HOME);
  return join(homedir(), ".codex");
}

/** Return the sessions root: $CODEX_HOME/sessions */
export function resolveSessionsRoot(codexHomeOverride) {
  return join(resolveCodexHome(codexHomeOverride), "sessions");
}

// ---------------------------------------------------------------------------
// Session discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collect all rollout-*.jsonl files under the sessions root.
 * Returns an array of absolute paths sorted by filename (chronological).
 */
export async function discoverRolloutFiles(sessionsRoot) {
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
  files.sort();
  return files;
}

// ---------------------------------------------------------------------------
// Error signal detection (shared with transcript-preextract.mjs)
// ---------------------------------------------------------------------------

const MAX_ERROR_SIGNALS = 10;
const ERROR_SIGNAL_TRUNCATE = 120;

const ERROR_PATTERNS = [
  /\berror\b/i,
  /\bfail(?:ed|ure)?\b/i,
  /\bexception\b/i,
  /\btraceback\b/i,
  /\bcannot find\b/i,
  /\bENOENT\b/i,
  /\bSyntaxError\b/i,
  /\bsyntax error\b/i,
  /\bTypeError\b/i,
  /\bReferenceError\b/i,
  /\bRangeError\b/i,
  /\bexit code [1-9]/i,
];

const SEARCH_TOOLS = new Set(["grep", "Grep", "Glob", "glob", "rg", "find"]);

export { MAX_ERROR_SIGNALS, ERROR_SIGNAL_TRUNCATE, ERROR_PATTERNS, SEARCH_TOOLS };

export function scanErrorSignals(text, accumulator) {
  if (accumulator.length >= MAX_ERROR_SIGNALS) return;

  for (const line of text.split("\n")) {
    if (accumulator.length >= MAX_ERROR_SIGNALS) break;
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(line)) {
        accumulator.push(line.trim().slice(0, ERROR_SIGNAL_TRUNCATE));
        break; // One match per line is enough
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Metadata & content extraction helpers
// ---------------------------------------------------------------------------

/** Try to extract the working directory from various possible metadata structures. */
export function extractCwd(obj) {
  if (obj.cwd) return String(obj.cwd);
  if (obj.metadata?.cwd) return String(obj.metadata.cwd);
  if (obj.context?.cwd) return String(obj.context.cwd);
  if (obj.session?.cwd) return String(obj.session.cwd);
  if (obj.working_directory) return String(obj.working_directory);
  if (obj.workingDirectory) return String(obj.workingDirectory);
  return "";
}

/** Extract text content from a message object (string or array content). */
export function extractTextContent(obj) {
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

/** Normalize a CWD path for cross-platform comparison. */
export function normalizeCwdForComparison(cwd) {
  let normalized = String(cwd || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  if (/^[A-Z]:\//.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Lightweight metadata extraction
// ---------------------------------------------------------------------------

/**
 * Extract metadata from a rollout file.
 * Reads the file and iterates lines until both firstUserMessage and sessionCwd are found.
 * Accepts optional pre-computed fileStat and returns rawContent when includeRawContent is true.
 */
export async function extractRolloutMeta(filePath, options = {}) {
  const { fileStat: providedStat, includeRawContent = false } = options;
  const fileName = basename(filePath);
  const fileStat = providedStat || await stat(filePath);

  const dateMatch = fileName.match(/^rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  const dateStr = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : new Date(fileStat.mtime).toISOString().slice(0, 10);
  const timeStr = dateMatch
    ? `${dateMatch[4]}:${dateMatch[5]}`
    : new Date(fileStat.mtime).toISOString().slice(11, 16);

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
      if (!sessionCwd) sessionCwd = extractCwd(obj);
      if (!firstUserMessage && obj.role === "user") {
        firstUserMessage = extractTextContent(obj);
      }
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
    ...(includeRawContent ? { rawContent } : {}),
  };
}

// ---------------------------------------------------------------------------
// Full session parsing
// ---------------------------------------------------------------------------

/**
 * Parse a complete rollout JSONL file into a structured session object.
 * When options.errorSignalAccumulator is provided, error signals are collected
 * during the same pass to avoid iterating the content twice.
 */
export function parseRolloutFile(rawContent, meta, options = {}) {
  const { errorSignalAccumulator = null } = options;
  const lines = rawContent.split("\n");
  const userMessages = [];
  const toolsUsed = new Set();
  const filesModified = new Set();
  let sessionCwd = meta.sessionCwd || "";
  let currentToolName = "";

  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (!sessionCwd) sessionCwd = extractCwd(obj);

    if (obj.role === "user") {
      const text = extractTextContent(obj);
      if (text) {
        userMessages.push({
          text,
          timestamp: obj.timestamp || obj.created_at || "",
        });
      }
    }

    if (obj.type === "tool_call" || obj.type === "function_call") {
      const toolName = obj.tool || obj.name || obj.function?.name || "";
      if (toolName) {
        toolsUsed.add(toolName);
        currentToolName = toolName;
      }
    }
    if (obj.tool_calls && Array.isArray(obj.tool_calls)) {
      for (const tc of obj.tool_calls) {
        const name = tc.function?.name || tc.tool || tc.name || "";
        if (name) {
          toolsUsed.add(name);
          currentToolName = name;
        }
      }
    }

    if (obj.type === "tool_call" || obj.type === "function_call") {
      const path = obj.path || obj.input?.path || obj.arguments?.path || "";
      if (path && (obj.tool === "filesystem_write" || obj.tool === "write" || obj.tool === "edit" || obj.tool === "create")) {
        filesModified.add(path);
      }
    }

    // Scan for error signals in execution results
    if (errorSignalAccumulator && obj.type === "execution_result" && !SEARCH_TOOLS.has(currentToolName)) {
      const output = obj.output || "";
      if (output) scanErrorSignals(output, errorSignalAccumulator);
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
// Utility exports used by codex-history.mjs
// ---------------------------------------------------------------------------

export function detectPlatformLabel() {
  const os = platform();
  if (os === "darwin") return "macOS";
  if (os === "win32") return "Windows";
  if (os === "linux") {
    try {
      const procVersion = readFileSync("/proc/version", "utf8").toLowerCase();
      if (procVersion.includes("microsoft") || procVersion.includes("wsl")) return "WSL";
    } catch {
      // not WSL
    }
    return "Linux";
  }
  return os;
}

export function humanFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

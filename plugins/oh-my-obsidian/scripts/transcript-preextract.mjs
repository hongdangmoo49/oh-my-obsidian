#!/usr/bin/env node
/**
 * transcript-preextract.mjs — Map-phase pre-extraction engine.
 *
 * Mechanically parses Claude Code and Codex CLI JSONL transcripts into
 * compact structured JSON with zero LLM tokens. The output is stored in
 * the session catalog for later selective Reduce-phase processing.
 *
 * Actions:
 *   scan            — Discover all JSONL files, pre-extract metadata,
 *                     build/update session-catalog.json.
 *   catalog-status  — Print catalog summary.
 */

import { readFile, stat, readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import {
  catalogPath,
  nowIso,
  pathExists,
  writeJsonAtomic,
} from "./vault-core.mjs";
import {
  discoverRolloutFiles,
  extractRolloutMeta,
  parseRolloutFile,
  normalizeCwdForComparison,
  resolveSessionsRoot as resolveCodexSessionsRoot,
  detectPlatformLabel,
  humanFileSize,
  scanErrorSignals,
  MAX_ERROR_SIGNALS,
  ERROR_PATTERNS,
  SEARCH_TOOLS,
} from "./parse-codex-rollout.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATALOG_SCHEMA = "oh-my-obsidian/session-catalog/v1";
const USER_MSG_TRUNCATE = 200;
const FIRST_MSG_TRUNCATE = 300;
const LAST_MSG_TRUNCATE = 200;

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
  if (!["scan", "catalog-status"].includes(args.action)) {
    throw new Error(`unknown action: ${args.action || ""}`);
  }

  if (args.action === "scan") {
    const result = await scanAndBuildCatalog();
    printJson(result);
    return;
  }

  if (args.action === "catalog-status") {
    const result = await catalogStatus();
    printJson(result);
    return;
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const parsed = {
    action: argv[0] || "",
    vault: "",
    source: "both",
    cwd: "",
    recent: 0,
    from: "",
    to: "",
    codexHome: "",
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--vault") parsed.vault = argv[++index] || "";
    else if (arg === "--source") parsed.source = argv[++index] || "both";
    else if (arg === "--cwd") parsed.cwd = argv[++index] || "";
    else if (arg === "--recent") parsed.recent = parseInt(argv[++index] || "0", 10) || 0;
    else if (arg === "--from") parsed.from = argv[++index] || "";
    else if (arg === "--to") parsed.to = argv[++index] || "";
    else if (arg === "--codex-home") parsed.codexHome = argv[++index] || "";
    else throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Claude Code JSONL pre-extraction
// ---------------------------------------------------------------------------

/**
 * Derive the Claude Code project hash from a working directory path.
 * 1. Replace all \ with /
 * 2. Replace all / and : with -
 */
function deriveClaudeProjectHash(cwdPath) {
  return cwdPath.replace(/\\/g, "/").replace(/[/:]/g, "-");
}

/**
 * Discover Claude Code session JSONL files.
 */
async function discoverClaudeCodeSessions(projectHash, allProjects) {
  const home = homedir();
  const projectsDir = join(home, ".claude", "projects");

  if (!(await pathExists(projectsDir))) return [];

  if (allProjects) {
    // Scan all project directories
    const entries = [];
    try {
      const dirs = await readdir(projectsDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const dirPath = join(projectsDir, dir.name);
        const files = await readdir(dirPath, { withFileTypes: true });
        for (const file of files) {
          if (file.isFile() && file.name.endsWith(".jsonl") && !file.name.startsWith(".")) {
            entries.push(join(dirPath, file.name));
          }
        }
      }
    } catch {
      // ignore read errors
    }
    return entries;
  }

  // Single project
  const projectDir = join(projectsDir, projectHash);
  if (!(await pathExists(projectDir))) return [];

  const files = [];
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl") && !entry.name.startsWith(".")) {
        // Exclude subagent files (inside subagents/ subdirectory — already excluded by direct readdir)
        files.push(join(projectDir, entry.name));
      }
    }
  } catch {
    // ignore
  }
  return files;
}

/**
 * Load Claude Code history.jsonl for cross-referencing session metadata.
 */
async function loadClaudeCodeHistory() {
  const home = homedir();
  const historyPath = join(home, ".claude", "history.jsonl");
  if (!(await pathExists(historyPath))) return new Map();

  try {
    const content = await readFile(historyPath, "utf8");
    const history = new Map();
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.sessionId) {
          history.set(obj.sessionId, obj);
        }
      } catch {
        continue;
      }
    }
    return history;
  } catch {
    return new Map();
  }
}

/**
 * Full async pre-extraction for Claude Code session.
 */
async function preextractClaudeCodeSessionAsync(filePath, historyMeta, fileStatResult) {
  const fileName = basename(filePath);
  const sessionId = fileName.replace(/\.jsonl$/, "");

  let rawContent;
  try {
    rawContent = await readFile(filePath, "utf8");
  } catch {
    return null;
  }

  const lines = rawContent.split("\n").filter((l) => l.trim());
  const userMessages = [];
  const toolsUsed = new Set();
  const filesModified = new Set();
  const filesRead = new Set();
  const errorSignals = [];
  let assistantTurnCount = 0;
  let currentToolName = "";
  let sessionCwd = "";

  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    const type = obj.type || "";

    // Extract CWD if present
    if (!sessionCwd && obj.cwd) sessionCwd = String(obj.cwd);
    if (!sessionCwd && obj.message?.cwd) sessionCwd = String(obj.message.cwd);

    if (type === "human") {
      const text = extractClaudeCodeText(obj.message);
      if (text) {
        userMessages.push({
          text: text.slice(0, USER_MSG_TRUNCATE),
          timestamp: obj.timestamp || "",
        });
      }
    }

    if (type === "assistant") {
      assistantTurnCount += 1;
    }

    if (type === "tool_use") {
      const toolName = obj.tool_use?.name || obj.name || "";
      if (toolName) {
        toolsUsed.add(toolName);
        currentToolName = toolName;
      }

      const toolInput = obj.tool_use?.input || obj.input || {};
      const filePath = toolInput.file_path || toolInput.path || toolInput.filePath || "";
      if (filePath) {
        if (["Write", "Edit", "write", "edit", "create"].includes(toolName)) {
          filesModified.add(filePath);
        } else {
          filesRead.add(filePath);
        }
      }
    }

    if (type === "tool_result") {
      if (!SEARCH_TOOLS.has(currentToolName)) {
        const resultContent = extractClaudeCodeResultText(obj);
        if (resultContent) {
          scanErrorSignals(resultContent, errorSignals);
        }
      }
      currentToolName = "";
    }
  }

  const substantiveMessages = userMessages.filter((m) => m.text.length >= 10);
  const isEmptySession = substantiveMessages.length < 1;

  // Determine date/time
  let date = "";
  let startTime = "";
  let endTime = "";

  if (historyMeta?.timestamp) {
    const d = new Date(historyMeta.timestamp);
    date = d.toISOString().slice(0, 10);
    startTime = d.toISOString().slice(11, 16);
  }

  if (!date && fileStatResult) {
    date = fileStatResult.mtime.toISOString().slice(0, 10);
    startTime = fileStatResult.mtime.toISOString().slice(11, 16);
  }

  // Try to compute endTime from last user message timestamp
  if (userMessages.length > 0) {
    const lastTs = userMessages[userMessages.length - 1].timestamp;
    if (lastTs) {
      try {
        endTime = new Date(lastTs).toISOString().slice(11, 16);
      } catch {
        // ignore
      }
    }
  }

  const firstUserMessage = userMessages.length > 0
    ? userMessages[0].text.slice(0, FIRST_MSG_TRUNCATE)
    : "";
  const lastUserMessage = userMessages.length > 0
    ? userMessages[userMessages.length - 1].text.slice(0, LAST_MSG_TRUNCATE)
    : "";

  return {
    id: sessionId,
    source: "claude-code",
    sourceFile: fileName,
    date,
    startTime,
    endTime,
    projectCwd: sessionCwd,
    sizeBytes: fileStatResult ? fileStatResult.size : rawContent.length,
    userMessageCount: userMessages.length,
    assistantTurnCount,
    firstUserMessage,
    lastUserMessage,
    toolsUsed: [...toolsUsed],
    filesModified: [...filesModified],
    filesRead: [...filesRead],
    errorSignals: errorSignals.slice(0, MAX_ERROR_SIGNALS),
    errorSignalCount: errorSignals.length,
    isEmptySession,
    documentGenerated: false,
    documentPath: null,
    topic: null,
    category: null,
  };
}

// ---------------------------------------------------------------------------
// Codex JSONL pre-extraction
// ---------------------------------------------------------------------------

async function preextractCodexSession(filePath, fileStatResult) {
  const meta = await extractRolloutMeta(filePath, {
    fileStat: fileStatResult,
    includeRawContent: true,
  });
  if (!meta) return null;

  const errorSignals = [];
  const parsed = parseRolloutFile(meta.rawContent, meta, {
    errorSignalAccumulator: errorSignals,
  });

  const substantiveMessages = parsed.userMessages.filter((m) => m.text.length >= 10);
  const isEmptySession = substantiveMessages.length < 1;

  // Derive ID from filename
  const sessionId = meta.fileName.replace(/\.jsonl$/, "");

  const firstUserMessage = parsed.userMessages.length > 0
    ? parsed.userMessages[0].text.slice(0, FIRST_MSG_TRUNCATE)
    : meta.firstUserMessage;
  const lastUserMessage = parsed.userMessages.length > 0
    ? parsed.userMessages[parsed.userMessages.length - 1].text.slice(0, LAST_MSG_TRUNCATE)
    : "";

  return {
    id: sessionId,
    source: "codex",
    sourceFile: meta.fileName,
    date: meta.date,
    startTime: meta.time,
    endTime: "",
    projectCwd: meta.sessionCwd,
    sizeBytes: meta.sizeBytes,
    userMessageCount: parsed.userMessages.length,
    assistantTurnCount: 0,
    firstUserMessage,
    lastUserMessage,
    toolsUsed: parsed.toolsUsed,
    filesModified: parsed.filesModified,
    filesRead: [],
    errorSignals: errorSignals.slice(0, MAX_ERROR_SIGNALS),
    errorSignalCount: errorSignals.length,
    isEmptySession,
    documentGenerated: false,
    documentPath: null,
    topic: null,
    category: null,
  };
}

// ---------------------------------------------------------------------------
// Catalog operations
// ---------------------------------------------------------------------------

async function loadCatalog(vaultPath) {
  const catPath = catalogPath(vaultPath);
  if (!(await pathExists(catPath))) return null;
  try {
    return JSON.parse(await readFile(catPath, "utf8"));
  } catch {
    return null;
  }
}

function createEmptyCatalog(vaultPath) {
  return {
    schema: CATALOG_SCHEMA,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    vaultPath,
    stats: {
      totalSessions: 0,
      documentedSessions: 0,
      lastScanAt: nowIso(),
    },
    sessions: [],
  };
}

function mergeCatalogEntries(existing, newEntries) {
  const existingById = new Map();
  for (const entry of (existing.sessions || [])) {
    existingById.set(entry.id, entry);
  }

  for (const entry of newEntries) {
    const existingEntry = existingById.get(entry.id);
    if (existingEntry) {
      // Preserve documentGenerated and documentPath from existing entry
      entry.documentGenerated = existingEntry.documentGenerated;
      entry.documentPath = existingEntry.documentPath;
      entry.topic = existingEntry.topic;
      entry.category = existingEntry.category;
    }
    existingById.set(entry.id, entry);
  }

  return [...existingById.values()];
}

// ---------------------------------------------------------------------------
// Scan action
// ---------------------------------------------------------------------------

async function scanAndBuildCatalog() {
  const vaultPath = args.vault || process.env.OBSIDIAN_VAULT || "";
  if (!vaultPath) {
    throw new Error("--vault 또는 OBSIDIAN_VAULT 환경변수가 필요합니다.");
  }

  const resolvedVault = resolve(vaultPath);
  if (!(await pathExists(resolvedVault))) {
    throw new Error(`볼트 경로가 존재하지 않습니다: ${resolvedVault}`);
  }

  const source = args.source;
  const allEntries = [];
  let claudeCodeCount = 0;
  let codexCount = 0;
  let claudeCodeError = null;
  let codexError = null;

  // --- Claude Code sessions ---
  if (source === "both" || source === "claude-code") {
    try {
      const history = await loadClaudeCodeHistory();
      const projectHash = args.cwd ? deriveClaudeProjectHash(args.cwd) : null;
      const allProjects = !args.cwd;
      const files = await discoverClaudeCodeSessions(projectHash, allProjects);

      for (const filePath of files) {
        const fileName = basename(filePath);
        const sessionId = fileName.replace(/\.jsonl$/, "");
        const historyMeta = history.get(sessionId) || null;

        // Skip small files
        try {
          const fileStat = await stat(filePath);
          if (fileStat.size < 1024) continue;
        } catch {
          continue;
        }

        const entry = await preextractClaudeCodeSessionAsync(filePath, historyMeta, fileStat);
        if (entry) {
          allEntries.push(entry);
          claudeCodeCount += 1;
        }
      }
    } catch (error) {
      claudeCodeError = error.message;
    }
  }

  // --- Codex sessions ---
  if (source === "both" || source === "codex") {
    try {
      const sessionsRoot = resolveCodexSessionsRoot(args.codexHome);
      const rolloutFiles = await discoverRolloutFiles(sessionsRoot);

      for (const filePath of rolloutFiles) {
        // Skip small files
        try {
          const fileStat = await stat(filePath);
          if (fileStat.size < 1024) continue;
        } catch {
          continue;
        }

        const entry = await preextractCodexSession(filePath, fileStat);
        if (entry) {
          allEntries.push(entry);
          codexCount += 1;
        }
      }
    } catch (error) {
      codexError = error.message;
    }
  }

  // Apply filters
  let filtered = allEntries;

  if (args.cwd) {
    const normalizedCwd = normalizeCwdForComparison(args.cwd);
    filtered = filtered.filter((e) => {
      if (!e.projectCwd) return false;
      return normalizeCwdForComparison(e.projectCwd) === normalizedCwd;
    });
  }

  if (args.from) filtered = filtered.filter((e) => e.date >= args.from);
  if (args.to) filtered = filtered.filter((e) => e.date <= args.to);

  // Sort by date descending
  filtered.sort((a, b) => {
    const dateComp = (b.date || "").localeCompare(a.date || "");
    if (dateComp !== 0) return dateComp;
    return (b.startTime || "").localeCompare(a.startTime || "");
  });

  if (args.recent > 0) filtered = filtered.slice(0, args.recent);

  // Load existing catalog and merge
  const existingCatalog = await loadCatalog(resolvedVault);
  const catalog = existingCatalog || createEmptyCatalog(resolvedVault);

  const mergedSessions = mergeCatalogEntries(catalog, filtered);

  catalog.sessions = mergedSessions;
  catalog.updatedAt = nowIso();
  catalog.vaultPath = resolvedVault;
  catalog.stats.totalSessions = mergedSessions.length;
  catalog.stats.documentedSessions = mergedSessions.filter((s) => s.documentGenerated).length;
  catalog.stats.lastScanAt = nowIso();

  // Write catalog
  const catPath = catalogPath(resolvedVault);
  await writeJsonAtomic(catPath, catalog);

  const totalSize = filtered.reduce((sum, e) => sum + (e.sizeBytes || 0), 0);
  const emptyCount = filtered.filter((e) => e.isEmptySession).length;
  const documentedCount = filtered.filter((e) => e.documentGenerated).length;

  return {
    status: "ok",
    action: "scan",
    vaultPath: resolvedVault,
    catalogPath: catPath,
    source,
    claudeCodeSessions: claudeCodeCount,
    codexSessions: codexCount,
    totalSessions: filtered.length,
    emptySessions: emptyCount,
    documentedSessions: documentedCount,
    totalSizeBytes: totalSize,
    totalSizeHuman: humanFileSize(totalSize),
    platform: detectPlatformLabel(),
    claudeCodeError,
    codexError,
  };
}

// ---------------------------------------------------------------------------
// Catalog status action
// ---------------------------------------------------------------------------

async function catalogStatus() {
  const vaultPath = args.vault || process.env.OBSIDIAN_VAULT || "";
  if (!vaultPath) {
    throw new Error("--vault 또는 OBSIDIAN_VAULT 환경변수가 필요합니다.");
  }

  const resolvedVault = resolve(vaultPath);
  const catalog = await loadCatalog(resolvedVault);

  if (!catalog) {
    return {
      status: "ok",
      action: "catalog-status",
      vaultPath: resolvedVault,
      catalogExists: false,
      message: "카탈로그가 존재하지 않습니다. scan 명령으로 생성하세요.",
    };
  }

  const sessions = catalog.sessions || [];
  const bySource = {
    "claude-code": sessions.filter((s) => s.source === "claude-code").length,
    "codex": sessions.filter((s) => s.source === "codex").length,
  };

  return {
    status: "ok",
    action: "catalog-status",
    vaultPath: resolvedVault,
    catalogExists: true,
    schema: catalog.schema,
    createdAt: catalog.createdAt,
    updatedAt: catalog.updatedAt,
    lastScanAt: catalog.stats?.lastScanAt,
    totalSessions: sessions.length,
    documentedSessions: catalog.stats?.documentedSessions || 0,
    bySource,
    emptySessions: sessions.filter((s) => s.isEmptySession).length,
    withErrors: sessions.filter((s) => s.errorSignalCount > 0).length,
  };
}

// ---------------------------------------------------------------------------
// Text extraction helpers for Claude Code format
// ---------------------------------------------------------------------------

function extractClaudeCodeText(message) {
  if (!message) return "";
  if (typeof message === "string") return message;

  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = [];
    for (const part of content) {
      if (typeof part === "string") {
        texts.push(part);
      } else if (part?.type === "text" && part.text) {
        texts.push(part.text);
      }
    }
    return texts.join(" ");
  }
  return "";
}

function extractClaudeCodeResultText(obj) {
  const content = obj.content || obj.result || obj.message || "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = [];
    for (const part of content) {
      if (typeof part === "string") texts.push(part);
      else if (part?.text) texts.push(part.text);
    }
    return texts.join(" ");
  }
  return "";
}

// Utility
// ---------------------------------------------------------------------------

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

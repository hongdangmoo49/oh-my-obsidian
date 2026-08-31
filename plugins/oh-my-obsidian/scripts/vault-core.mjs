import { createHash } from "node:crypto";
import { access, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve, sep, win32 } from "node:path";

export const PLUGIN_VERSION = "0.3.3";
export const SETUP_STATE_SCHEMA = "oh-my-obsidian/setup-state/v1";
export const CODEX_CONFIG_SCHEMA = "oh-my-obsidian/codex-config/v1";
export const CODEX_CONFIG_CREATED_BY = "oh-my-obsidian-codex-setup";
export const CODEX_HOOKS_POINTER_SCHEMA = "oh-my-obsidian/codex-hooks-pointer/v1";
export const CODEX_HOOKS_POINTER_CREATED_BY = "oh-my-obsidian-codex-hooks";

export function nowIso() {
  return new Date().toISOString();
}

export function expandHome(input, home = homedir()) {
  if (!input) return input;
  if (input === "~") return home;
  if (input.startsWith(`~${sep}`) || input.startsWith("~/")) {
    return join(home, input.slice(2));
  }
  return input;
}

export async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function fileContentHash(path) {
  return contentHash(await readFile(path, "utf8"));
}

export function contentHash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function readJsonObjectIfExists(path, label = path, issues = [], required = false) {
  if (!(await pathExists(path))) {
    if (required) issues.push(`${label} is missing`);
    return null;
  }

  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") {
      issues.push(`${label} must be a JSON object`);
      return null;
    }
    return value;
  } catch (error) {
    issues.push(`${label} is invalid JSON: ${error.message}`);
    return null;
  }
}

export async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

export function codexConfigPath(home = homedir()) {
  return join(home, ".oh-my-obsidian", "config.json");
}

export async function readSetupState(vaultRoot) {
  const statePath = join(vaultRoot, ".oh-my-obsidian", "setup-state.json");
  const issues = [];
  const state = await readJsonObjectIfExists(statePath, "setup-state.json", issues, true);
  return { statePath, state, issues };
}

export function setupStatePath(vaultRoot) {
  return join(vaultRoot, ".oh-my-obsidian", "setup-state.json");
}

export function catalogPath(vaultRoot) {
  return join(vaultRoot, ".oh-my-obsidian", "session-catalog.json");
}

export function normalizeVaultRelativePath(input) {
  if (typeof input !== "string" || input.length === 0) {
    throw new Error("relative path is required");
  }
  if (input.includes("\0")) {
    throw new Error(`path contains NUL byte: ${input}`);
  }
  if (isAbsolute(input) || win32.isAbsolute(input)) {
    throw new Error(`absolute paths are not allowed: ${input}`);
  }

  const segments = input.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0) {
    throw new Error("relative path must contain at least one segment");
  }
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new Error(`path traversal is not allowed: ${input}`);
    }
    if (segment.includes("\0")) {
      throw new Error(`path contains NUL byte: ${input}`);
    }
  }
  return segments.join("/");
}

export async function resolveSafeVaultTarget(vaultRoot, relativePath) {
  const normalized = normalizeVaultRelativePath(relativePath);
  const vaultRealPath = await realpath(vaultRoot);
  const targetPath = join(vaultRoot, ...normalized.split("/"));
  const parentPath = dirname(targetPath);
  const parentRealPath = await realpath(parentPath);
  if (!isInsidePath(vaultRealPath, parentRealPath)) {
    throw new Error(`parent path escapes vault: ${relativePath}`);
  }
  return { normalized, targetPath, parentPath, parentRealPath, vaultRealPath };
}

export async function validatePlannedVaultTarget(vaultRoot, relativePath) {
  const normalized = normalizeVaultRelativePath(relativePath);
  const vaultRealPath = await realpath(vaultRoot);
  const targetPath = join(vaultRoot, ...normalized.split("/"));
  const segments = normalized.split("/");
  let currentPath = vaultRoot;

  for (let index = 0; index < segments.length - 1; index += 1) {
    currentPath = join(currentPath, segments[index]);
    if (await pathExists(currentPath)) {
      const currentRealPath = await realpath(currentPath);
      if (!isInsidePath(vaultRealPath, currentRealPath)) {
        throw new Error(`parent path escapes vault: ${relativePath}`);
      }
    }
  }

  const parentPath = dirname(targetPath);
  if (await pathExists(parentPath)) {
    const parentRealPath = await realpath(parentPath);
    if (!isInsidePath(vaultRealPath, parentRealPath)) {
      throw new Error(`parent path escapes vault: ${relativePath}`);
    }
  }

  return { normalized, targetPath, parentPath, vaultRealPath };
}

export function isInsidePath(rootRealPath, candidateRealPath) {
  const rel = relative(rootRealPath, candidateRealPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel) && !win32.isAbsolute(rel));
}

export async function assertNoSymlinkEscape(vaultRoot, relativePath) {
  return await resolveSafeVaultTarget(vaultRoot, relativePath);
}

export async function resolveVault(options = {}) {
  const env = options.env || process.env;
  const home = options.home || homedir();
  const candidates = [];
  const issues = [];
  const cwd = resolve(expandHome(options.cwd || env.PWD || process.cwd(), home));

  if (env.OBSIDIAN_VAULT) {
    candidates.push({ source: "env", path: env.OBSIDIAN_VAULT });
  }

  const projectPointerPath = await findCodexHooksPointer(cwd);
  if (projectPointerPath) {
    const projectPointer = await readCodexHooksPointer(projectPointerPath, "project Codex hooks pointer", issues);
    if (projectPointer) {
      candidates.push({ source: "projectCodexPointer", path: projectPointer.vaultPath, configPath: projectPointerPath });
    }
  }

  const userPointerPath = join(home, ".codex", "oh-my-obsidian.local.json");
  const userPointer = await readCodexHooksPointer(userPointerPath, "user Codex hooks pointer", issues);
  if (userPointer) {
    candidates.push({ source: "userCodexPointer", path: userPointer.vaultPath, configPath: userPointerPath });
  }

  const configPath = codexConfigPath(home);
  const config = await readJsonObjectIfExists(configPath, "codex config", issues, false);
  if (
    config &&
    config.schema === CODEX_CONFIG_SCHEMA &&
    config.createdBy === CODEX_CONFIG_CREATED_BY &&
    config.approvedAt &&
    config.vaultPath
  ) {
    candidates.push({ source: "codexConfigPointer", path: config.vaultPath, configPath });
  } else if (config) {
    issues.push("codex config pointer exists but was not created by approved Codex setup");
  }

  for (const candidate of candidates) {
    const candidatePath = resolve(expandHome(candidate.path, home));
    let candidateRealPath = "";
    try {
      candidateRealPath = await realpath(candidatePath);
    } catch (error) {
      issues.push(`${candidate.source} vault path cannot be resolved: ${error.message}`);
      continue;
    }

    const { state, statePath, issues: stateIssues } = await readSetupState(candidateRealPath);
    if (stateIssues.length > 0 || !state) {
      issues.push(...stateIssues);
      continue;
    }
    if (state.schema !== SETUP_STATE_SCHEMA) {
      issues.push(`setup-state schema mismatch: ${state.schema || ""}`);
      continue;
    }
    if (state.vaultRealPath !== candidateRealPath) {
      issues.push("setup-state vaultRealPath does not match candidate realpath");
      continue;
    }

    return {
      ok: true,
      source: candidate.source,
      vaultPath: candidatePath,
      vaultRealPath: candidateRealPath,
      setupStatePath: statePath,
      setupState: state,
      issues,
    };
  }

  return {
    ok: false,
    status: "action_required_env",
    issues,
    instructions: [
      "Run the oh-my-obsidian setup skill.",
      "Or install repo-local Codex hooks with the project vault pointer.",
      "Or set OBSIDIAN_VAULT to the vault path in the current Codex environment.",
      "Or approve creation of ~/.oh-my-obsidian/config.json during setup.",
    ],
  };
}

export async function findCodexHooksPointer(startDir) {
  let current = resolve(startDir || process.cwd());
  const root = parse(current).root;
  while (true) {
    const pointerPath = join(current, ".codex", "oh-my-obsidian.local.json");
    if (await pathExists(pointerPath)) return pointerPath;
    const gitDir = join(current, ".git");
    if (await pathExists(gitDir)) return "";
    if (current === root) return "";
    current = dirname(current);
  }
}

async function readCodexHooksPointer(pointerPath, label, issues) {
  if (!(await pathExists(pointerPath))) return null;
  const pointer = await readJsonObjectIfExists(pointerPath, label, issues, false);
  if (!pointer) return null;
  if (
    pointer.schema !== CODEX_HOOKS_POINTER_SCHEMA ||
    pointer.createdBy !== CODEX_HOOKS_POINTER_CREATED_BY ||
    !pointer.approvedAt ||
    !pointer.vaultPath
  ) {
    issues.push(`${label} exists but was not created by approved Codex hooks setup`);
    return null;
  }
  return pointer;
}

export function sanitizePathSegment(input, fallback = "untitled") {
  const normalized = String(input || "")
    .normalize("NFKC")
    .trim()
    .replace(/[\\/]+/g, "_")
    .replace(/[\0<>:"|?*]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/^\.+$/, "")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

export function slugifyAscii(input, fallback = "note") {
  const slug = String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

export const CATEGORY_TYPE_MAP = {
  "세션기록": "session-log",
  "의사결정": "decision",
  "트러블슈팅": "troubleshooting",
  "회의록": "meeting-notes",
  "서비스": "knowledge",
};

export function typeFromCategory(category) {
  return CATEGORY_TYPE_MAP[category] || "session-log";
}

export function basenameWithoutExtension(filepath) {
  const base = String(filepath).split(/[\\/]/).pop() || "";
  return base.replace(/\.md$/i, "");
}

export function uniqueValues(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

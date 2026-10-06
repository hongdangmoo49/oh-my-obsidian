#!/usr/bin/env node
import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { SETUP_STATE_SCHEMA, nowIso, writeJsonAtomic } from "../plugins/oh-my-obsidian/scripts/vault-core.mjs";

const argv = process.argv.slice(2);
const action = argv[0] || "plan";
let home = homedir();
let vault = process.env.OBSIDIAN_VAULT || "";
let attachLegacy = false;
let autoSave = true;
async function privateJsonAtomic(path, value) {
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2), { flag: "wx", mode: 0o600 });
    await rename(temp, path);
  } finally {
    await unlink(temp).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
}
try {
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--home") home = resolve(argv[++i]);
    else if (argv[i] === "--vault") vault = argv[++i];
    else if (argv[i] === "--attach-legacy") attachLegacy = true;
    else if (argv[i] === "--disable") autoSave = false;
    else throw new Error("unknown migration argument");
  }
  if (!["plan", "apply"].includes(action) || !vault) throw new Error("plan/apply and --vault (or OBSIDIAN_VAULT) are required");
  const vaultRealPath = await realpath(resolve(vault));
  if (!(await lstat(vaultRealPath)).isDirectory()) throw new Error("vault must be an existing directory");
  const claudeDir = join(home, ".claude");
  const settingsPath = join(claudeDir, "settings.json");
  const pointerPath = join(claudeDir, "oh-my-obsidian.local.json");
  const metadata = join(vaultRealPath, ".oh-my-obsidian");
  const statePath = join(metadata, "setup-state.json");
  for (const path of [claudeDir, settingsPath, pointerPath, metadata, statePath]) {
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error("migration targets must not be symlinks"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const optional = async (path) => {
    try {
      const value = JSON.parse(await readFile(path, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid JSON object; existing settings preserved");
      return value;
    }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };
  const rawOptional = async (path) => {
    try { return await readFile(path, "utf8"); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };
  const originalSettings = await rawOptional(settingsPath);
  const state = await optional(statePath);
  if (state && (state.schema !== SETUP_STATE_SCHEMA || state.status !== "complete" || state.vaultRealPath !== vaultRealPath)) {
    throw new Error("existing setup-state is invalid or incomplete; repair it before enabling automatic saves");
  }
  if (!state && !attachLegacy) throw new Error("legacy vault needs explicit --attach-legacy approval; no files changed");
  const settings = (await optional(settingsPath)) || {};
  if (Array.isArray(settings) || typeof settings !== "object" ||
      (settings.hooks && (Array.isArray(settings.hooks) || typeof settings.hooks !== "object"))) throw new Error("invalid Claude settings shape");
  const previousPointer = await optional(pointerPath);
  if (previousPointer && (previousPointer.schema !== "oh-my-obsidian/claude-hooks-pointer/v1" || previousPointer.createdBy !== "oh-my-obsidian-claude-hooks")) {
    throw new Error("unrecognized existing Claude vault pointer; inspect it before migration");
  }
  const next = structuredClone(settings);
  let removed = 0;
  const legacy = new Set(["claude -p '/oh-my-obsidian:session-save'", 'claude -p "/oh-my-obsidian:session-save"']);
  if (next.hooks?.SessionEnd !== undefined) {
    if (!Array.isArray(next.hooks.SessionEnd)) throw new Error("SessionEnd must be an array");
    next.hooks.SessionEnd = next.hooks.SessionEnd.flatMap((entry) => {
      if (!entry || !Array.isArray(entry.hooks)) throw new Error("SessionEnd hook entry must contain hooks");
      const hooks = entry.hooks.filter((hook) => {
        const obsolete = hook?.type === "command" && legacy.has(String(hook.command || "").trim());
        if (obsolete) removed++;
        return !obsolete;
      });
      return hooks.length ? [{ ...entry, hooks }] : [];
    });
  }
  const output = { status: "planned", action, vaultRealPath, settingsPath, pointerPath,
    attachLegacyVault: !state, removedLegacySessionEndCommands: removed, autoSave,
    hookEvents: ["SessionStart", "UserPromptSubmit", "Stop"], notesModified: false };
  if (action === "apply") {
    if (await rawOptional(settingsPath) !== originalSettings) throw new Error("settings changed during migration; retry after reviewing the new plan");
    await mkdir(claudeDir, { recursive: true, mode: 0o700 });
    if (!state) {
      await mkdir(metadata, { recursive: true });
      await writeFile(statePath, JSON.stringify({ schema: SETUP_STATE_SCHEMA, status: "in_progress", vaultPath: vaultRealPath,
        vaultRealPath, projectName: basename(vaultRealPath), managedArtifacts: [], attachmentOnly: true, createdAt: nowIso() }), { flag: "wx" });
      await writeJsonAtomic(statePath, { schema: SETUP_STATE_SCHEMA, status: "complete", vaultPath: vaultRealPath,
        vaultRealPath, projectName: basename(vaultRealPath), knowledgeDomains: [], managedArtifacts: [],
        attachmentOnly: true, approvedAt: nowIso(), createdAt: nowIso() });
    }
    if (removed) {
      if (await rawOptional(settingsPath) !== originalSettings) throw new Error("settings changed during migration; preserving user changes");
      await writeFile(`${settingsPath}.omob-backup-${Date.now()}`, originalSettings, { flag: "wx", mode: 0o600 });
      await privateJsonAtomic(settingsPath, next);
    }
    await privateJsonAtomic(pointerPath, { schema: "oh-my-obsidian/claude-hooks-pointer/v1", createdBy: "oh-my-obsidian-claude-hooks",
      vaultPath: vaultRealPath, vaultRealPath, approvedAt: nowIso(), autoSave,
      quietStop: previousPointer?.quietStop !== false });
    output.status = "applied";
  }
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.log(JSON.stringify({ status: "failed", action, issues: [error instanceof SyntaxError ? "invalid JSON; existing settings preserved" : error.message] }));
  process.exitCode = 1;
}

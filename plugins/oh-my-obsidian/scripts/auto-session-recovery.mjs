import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { contentHash, validatePlannedVaultTarget, writeJsonAtomic } from "./vault-core.mjs";

async function readJson(path) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error("recovery metadata must not be a symlink");
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function acquireAutoLock(path, recover = false) {
  let lockRecovered = false;
  try {
    await mkdir(path);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (!recover) throw new Error("automatic session save is locked; use session-recover after the owner exits");
    if ((await lstat(path)).isSymbolicLink()) throw new Error("lock must not be a symlink");
    const claim = join(path, "recovery-claim");
    await writeFile(claim, "", { flag: "wx" });
    try {
      const owner = await readJson(join(path, "owner.json"));
      if (!owner || owner.host !== hostname() || owner.platform !== process.platform || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) {
        throw new Error("cannot prove lock owner is local and dead; manual inspection required");
      }
      try {
        process.kill(owner.pid, 0);
        throw new Error("lock owner is still alive; recovery refused");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
      await unlink(join(path, "owner.json"));
    } finally {
      await unlink(claim);
    }
    await rmdir(path);
    await mkdir(path);
    lockRecovered = true;
  }
  const token = randomUUID();
  try {
    await writeFile(join(path, "owner.json"), JSON.stringify({ host: hostname(), platform: process.platform, pid: process.pid, token }), { flag: "wx" });
  } catch (error) {
    await rmdir(path).catch(() => {});
    throw error;
  }
  const release = async () => {
    const owner = await readJson(join(path, "owner.json"));
    if (owner?.token !== token) throw new Error("lock ownership changed; release refused");
    await unlink(join(path, "owner.json"));
    await rmdir(path);
  };
  release.lockRecovered = lockRecovered;
  return release;
}

function validateState(state, key) {
  if (!state || !/^작업기록\/세션기록\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+\.md$/.test(state.relativePath || "") ||
      !state.relativePath.endsWith(`-${key}.md`) || !Number.isFinite(Date.parse(state.createdAt)) ||
      (state.noteHash !== undefined && !/^[a-f0-9]{64}$/.test(state.noteHash)) ||
      (state.inputs !== undefined && (!Array.isArray(state.inputs) || state.inputs.some((hash) => !/^[a-f0-9]{64}$/.test(hash))))) {
    throw new Error("invalid auto-session state; recovery refused");
  }
  return state;
}

async function noteHash(vault, state, key) {
  const target = await validatePlannedVaultTarget(vault, state.relativePath);
  try {
    if ((await lstat(target.targetPath)).isSymbolicLink()) throw new Error("auto-session note must not be a symlink");
    const text = await readFile(target.targetPath, "utf8");
    if (!text.endsWith(`\n<!-- oh-my-obsidian:auto-session:${key} -->\n`)) throw new Error("unmanaged note; recovery refused");
    return contentHash(text);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function commitAutoState(path, state) {
  for (const target of [`${path}.backup`, path]) {
    // Reject links before atomic replacement, including backup metadata.
    try { if ((await lstat(target)).isSymbolicLink()) throw new Error("recovery metadata must not be a symlink"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await writeJsonAtomic(target, state);
  }
}

export async function loadAutoState(vault, key, path, initial = null) {
  const pending = await readJson(`${path}.pending`);
  if (pending) {
    const next = validateState(pending.next, key);
    const prior = validateState(pending.prior, key);
    if (next.relativePath !== prior.relativePath || !/^[a-f0-9]{64}$/.test(next.noteHash) ||
        (pending.priorHash !== null && !/^[a-f0-9]{64}$/.test(pending.priorHash))) throw new Error("invalid pending transaction");
    const actual = await noteHash(vault, next, key);
    const state = actual === next.noteHash ? next : actual === pending.priorHash ? prior : null;
    if (!state) throw new Error("note differs from pending transaction; preserving user changes");
    await commitAutoState(path, state);
    await unlink(`${path}.pending`);
    return { state, recovered: true };
  }
  let current;
  try { current = validateState(await readJson(path), key); }
  catch (error) {
    if (!(error instanceof SyntaxError) && !error.message.startsWith("invalid auto-session state")) throw error;
  }
  if (current) {
    if (current.noteHash && await noteHash(vault, current, key) !== current.noteHash) {
      throw new Error("automatic note differs from saved state; preserving user changes");
    }
    return { state: current, recovered: false };
  }
  const backup = await readJson(`${path}.backup`);
  if (backup) {
    validateState(backup, key);
    if (!backup.noteHash || await noteHash(vault, backup, key) !== backup.noteHash) {
      throw new Error("backup does not match current note; preserving user changes");
    }
    try { await rename(path, `${path}.corrupt.${randomUUID()}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await commitAutoState(path, backup);
    return { state: backup, recovered: true };
  }
  try {
    await lstat(path);
    throw new Error("damaged state has no verified backup; recovery refused");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!initial) throw new Error("no state or verified backup to recover");
  await writeJsonAtomic(path, validateState(initial, key));
  return { state: initial, recovered: false };
}

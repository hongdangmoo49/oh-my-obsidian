import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { acquireAutoLock, commitAutoState, loadAutoState } from "../scripts/auto-session-recovery.mjs";
import { contentHash, pathExists } from "../scripts/vault-core.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "omob-recovery-test-"));
  const key = contentHash("recover-test");
  const path = join(root, ".oh-my-obsidian/auto-sessions", `${key}.json`);
  const relativePath = `작업기록/세션기록/2026-10/2026-10-06/test-${key}.md`;
  const notePath = join(root, relativePath);
  const marker = `\n<!-- oh-my-obsidian:auto-session:${key} -->\n`;
  const text = `# Original\n\nPrior decision and pending task\n${marker}`;
  const state = { createdAt: "2026-10-06T00:00:00Z", relativePath, noteHash: contentHash(text), inputs: [] };
  await mkdir(dirname(path), { recursive: true });
  await mkdir(dirname(notePath), { recursive: true });
  await writeFile(notePath, text);
  await commitAutoState(path, state);
  return { root, key, path, notePath, marker, text, state, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("truncated state restores a verified backup and keeps the original note", async () => {
  const f = await fixture();
  try {
    await writeFile(f.path, "");
    const result = await loadAutoState(f.root, f.key, f.path);
    assert.equal(result.recovered, true);
    assert.deepEqual(JSON.parse(await readFile(f.path, "utf8")), f.state);
    assert.equal(await readFile(f.notePath, "utf8"), f.text);
  } finally { await f.cleanup(); }
});

test("backup recovery refuses user edits and leaves corrupt state untouched", async () => {
  const f = await fixture();
  try {
    await writeFile(f.path, "broken");
    await writeFile(f.notePath, f.text.replace("Original", "USER EDIT"));
    await assert.rejects(loadAutoState(f.root, f.key, f.path), /preserving user changes/);
    assert.equal(await readFile(f.path, "utf8"), "broken");
    assert.match(await readFile(f.notePath, "utf8"), /USER EDIT/);
  } finally { await f.cleanup(); }
});

for (const committed of [false, true]) {
  test(`pending transaction ${committed ? "finalizes after note rename" : "rolls back before note rename"}`, async () => {
    const f = await fixture();
    try {
      const nextText = `# Updated\n\nPrior decision and pending task retained\n${f.marker}`;
      const next = { ...f.state, noteHash: contentHash(nextText), inputs: [contentHash("new work")] };
      await writeFile(`${f.path}.pending`, JSON.stringify({ prior: f.state, priorHash: f.state.noteHash, next }));
      if (committed) await writeFile(f.notePath, nextText);
      const result = await loadAutoState(f.root, f.key, f.path);
      assert.deepEqual(result.state, committed ? next : f.state);
      assert.equal(result.recovered, true);
      assert.equal(await pathExists(`${f.path}.pending`), false);
      assert.equal(await readFile(f.notePath, "utf8"), committed ? nextText : f.text);
    } finally { await f.cleanup(); }
  });
}

test("pending recovery rejects a note changed outside either transaction snapshot", async () => {
  const f = await fixture();
  try {
    const next = { ...f.state, noteHash: contentHash("not on disk") };
    await writeFile(`${f.path}.pending`, JSON.stringify({ prior: f.state, priorHash: f.state.noteHash, next }));
    await writeFile(f.notePath, f.text.replace("Original", "USER EDIT"));
    await assert.rejects(loadAutoState(f.root, f.key, f.path), /preserving user changes/);
    assert.equal(await pathExists(`${f.path}.pending`), true);
  } finally { await f.cleanup(); }
});

test("explicit recovery releases a dead local owner but refuses active and unknown owners", async () => {
  const f = await fixture();
  try {
    const lock = `${f.path}.lock`;
    const release = await acquireAutoLock(lock);
    await assert.rejects(acquireAutoLock(lock, true), /still alive/);
    await release();
    const dead = spawnSync(process.execPath, ["-e", ""], { encoding: "utf8" });
    assert.equal(dead.status, 0);
    assert.ok(dead.pid > 0);
    await mkdir(lock);
    await writeFile(join(lock, "owner.json"), JSON.stringify({ host: hostname(), platform: process.platform, pid: dead.pid, token: "dead" }));
    const recoveredRelease = await acquireAutoLock(lock, true);
    assert.equal(recoveredRelease.lockRecovered, true);
    await recoveredRelease();
    assert.equal(await pathExists(lock), false);
    await mkdir(lock);
    await assert.rejects(acquireAutoLock(lock, true), /manual inspection/);
    assert.equal(await pathExists(lock), true);
    await writeFile(join(lock, "owner.json"), JSON.stringify({ host: "foreign-host", platform: process.platform, pid: dead.pid }));
    await assert.rejects(acquireAutoLock(lock, true), /manual inspection/);
    await writeFile(join(lock, "owner.json"), JSON.stringify({ host: hostname(), platform: "other-platform", pid: dead.pid }));
    await assert.rejects(acquireAutoLock(lock, true), /manual inspection/);
  } finally { await f.cleanup(); }
});

test("damaged state without a backup does not invent a replacement", async () => {
  const f = await fixture();
  try {
    await rm(`${f.path}.backup`);
    await writeFile(f.path, "broken");
    await assert.rejects(loadAutoState(f.root, f.key, f.path), /no verified backup/);
    assert.equal(await readFile(f.path, "utf8"), "broken");
  } finally { await f.cleanup(); }
});

test("corrupt pending journal is not discarded to make a save succeed", async () => {
  const f = await fixture();
  try {
    await writeFile(`${f.path}.pending`, "broken");
    await assert.rejects(loadAutoState(f.root, f.key, f.path), SyntaxError);
    assert.equal(await readFile(f.notePath, "utf8"), f.text);
    assert.equal(await readFile(`${f.path}.pending`, "utf8"), "broken");
  } finally { await f.cleanup(); }
});

test("a forcibly terminated lock owner can be recovered without changing the note", { timeout: 10000 }, async () => {
  const f = await fixture();
  let child;
  try {
    const lock = `${f.path}.lock`;
    const moduleUrl = new URL("../scripts/auto-session-recovery.mjs", import.meta.url).href;
    child = spawn(process.execPath, ["--input-type=module", "-e",
      `import { acquireAutoLock } from ${JSON.stringify(moduleUrl)}; await acquireAutoLock(${JSON.stringify(lock)}); process.stdout.write('locked'); setInterval(() => {}, 1000);`], { stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((resolveRun, reject) => {
      child.once("error", reject);
      child.stdout.once("data", resolveRun);
      child.once("exit", () => reject(new Error("lock owner exited before ready")));
    });
    const exited = new Promise((resolveRun) => child.once("exit", resolveRun));
    assert.equal(child.kill("SIGKILL"), true);
    await exited;
    const release = await acquireAutoLock(lock, true);
    assert.equal(release.lockRecovered, true);
    await release();
    assert.equal(await readFile(f.notePath, "utf8"), f.text);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await f.cleanup();
  }
});

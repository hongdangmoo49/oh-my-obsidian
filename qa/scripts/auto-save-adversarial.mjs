import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, relative } from "node:path";

const repo = resolve(import.meta.dirname, "../..");
const helper = join(repo, "plugins/oh-my-obsidian/scripts/vault-ops.mjs");
const installer = join(repo, "plugins/oh-my-obsidian/scripts/codex-hooks.mjs");
const root = await mkdtemp(join(tmpdir(), "omob-adversarial-"));
const vault = join(root, "vault");
const home = join(root, "home");
const project = join(root, "repo");
const sessionId = "adversarial-session";
const key = createHash("sha256").update(sessionId).digest("hex");
const observations = {};

function run(script, args, input, env = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: project, input: input ? JSON.stringify(input) : undefined,
    encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home, OBSIDIAN_VAULT: vault, ...env },
  });
  return { exit: result.status, output: result.stdout ? JSON.parse(result.stdout) : null };
}

function save(summary, extra = []) {
  const statePath = join(vault, ".oh-my-obsidian/auto-sessions", `${key}.json`);
  let noteHash;
  try { noteHash = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")).noteHash : null; } catch {}
  return run(helper, ["session-save", "--auto-session-id", sessionId, "--topic", "Adversarial test", "--detail", summary,
    ...(noteHash ? ["--expected-note-hash", noteHash] : []), ...extra]);
}

try {
  await mkdir(join(vault, ".oh-my-obsidian"), { recursive: true });
  await mkdir(home);
  await mkdir(project);
  assert.equal(spawnSync("git", ["-C", project, "init"], { encoding: "utf8" }).status, 0);
  await writeFile(join(vault, ".oh-my-obsidian/setup-state.json"), JSON.stringify({
    schema: "oh-my-obsidian/setup-state/v1", status: "complete",
    vaultRealPath: await realpath(vault), projectName: "Test", knowledgeDomains: ["Tools", "Tests"], managedArtifacts: [],
  }));
  const install = run(installer, ["apply", "--mode", "repo-local", "--repo-root", project, "--vault", vault, "--home", home]);
  assert.equal(install.exit, 0);
  const projectPointer = JSON.parse(await readFile(install.output.pointerPath, "utf8"));
  await writeFile(install.output.pointerPath, JSON.stringify({ ...projectPointer, quietStop: false }));
  const runner = install.output.runnerPath;
  const first = save("Initial work", ["--decision", "Preserve prior decision", "--next-step", "Pending task"]);
  assert.equal(first.exit, 0);
  const target = join(vault, first.output.relativePath);
  const original = await readFile(target, "utf8");

  await writeFile(target, original.replace("Initial work", "USER EDIT MUST SURVIVE"));
  const overwritten = save("New work");
  observations.userEditOverwritten = overwritten.exit === 0 && !(await readFile(target, "utf8")).includes("USER EDIT MUST SURVIVE");
  observations.priorDecisionsLost = !(await readFile(target, "utf8")).includes("Preserve prior decision");
  observations.priorNextStepsLost = !(await readFile(target, "utf8")).includes("Pending task");
  assert.equal(observations.userEditOverwritten, false);
  await writeFile(target, original);

  const oldHash = JSON.parse(await readFile(join(vault, ".oh-my-obsidian/auto-sessions", `${key}.json`), "utf8")).noteHash;
  assert.equal(save("Latest summary", ["--decision", "Latest decision"]).exit, 0);
  const stale = save("Stale summary", ["--decision", "Old decision", "--expected-note-hash", oldHash]);
  assert.notEqual(stale.exit, 0);
  observations.staleSnapshotReplacesLatest = !(await readFile(target, "utf8")).includes("Latest decision");

  const concurrentHash = JSON.parse(await readFile(join(vault, ".oh-my-obsidian/auto-sessions", `${key}.json`), "utf8")).noteHash;
  const simultaneous = await Promise.all(Array.from({ length: 12 }, (_, index) => new Promise((resolveRun) => {
    const child = spawn(process.execPath, [helper, "session-save", "--auto-session-id", sessionId,
      "--topic", "Concurrent test", "--detail", `Concurrent work ${index}`, "--decision", `Concurrent decision ${index}`,
      "--expected-note-hash", concurrentHash], {
      cwd: project, env: { ...process.env, HOME: home, USERPROFILE: home, OBSIDIAN_VAULT: vault },
      stdio: "ignore",
    });
    child.on("error", () => resolveRun(-1));
    child.on("close", resolveRun);
  })));
  observations.concurrentSuccessfulWrites = simultaneous.filter((exit) => exit === 0).length;
  observations.concurrentDecisionsRetained = ((await readFile(target, "utf8")).match(/Concurrent decision /g) || []).length;
  assert.equal(observations.concurrentSuccessfulWrites, 1);
  assert.equal(observations.concurrentDecisionsRetained, 1);
  assert.equal(observations.priorDecisionsLost, false);
  assert.equal(observations.priorNextStepsLost, false);
  assert.equal(observations.staleSnapshotReplacesLatest, false);

  const blocked = run(runner, ["stop"], { cwd: project, session_id: sessionId, stop_hook_active: false });
  const continuedWithoutSaving = run(runner, ["stop"], { cwd: project, session_id: sessionId, stop_hook_active: true });
  observations.finishesWithoutSaveReceipt = blocked.output.decision === "block" && !continuedWithoutSaving.output.decision;

  const globalInstall = run(installer, ["apply", "--mode", "user-global", "--vault", vault, "--home", home]);
  assert.equal(globalInstall.exit, 0);
  const globalPointerPath = globalInstall.output.pointerPath;
  const globalPointer = JSON.parse(await readFile(globalPointerPath, "utf8"));
  await writeFile(globalPointerPath, JSON.stringify({ ...globalPointer, autoSave: false }));
  const optedOut = run(runner, ["stop"], { cwd: root, session_id: sessionId }, { OBSIDIAN_VAULT: "" });
  const envOverride = run(runner, ["stop"], { cwd: root, session_id: sessionId });
  observations.globalOptOutHonoredWithoutEnv = !optedOut.output.decision;
  observations.globalOptOutIgnoredWithEnv = envOverride.output.decision === "block";

  const fakeSecret = "sk-test-not-a-real-secret-1234567890";
  assert.equal(save(`Raw transcript: user supplied API_KEY=${fakeSecret}`).exit, 0);
  observations.rawTextAndSyntheticSecretStored = (await readFile(target, "utf8")).includes(fakeSecret);

  const statePath = join(vault, ".oh-my-obsidian/auto-sessions", `${key}.json`);
  const state = await readFile(statePath, "utf8");
  await writeFile(statePath, "");
  const damaged = save("Recover work");
  observations.truncatedStatePreventsFutureSave = damaged.exit !== 0;
  await writeFile(statePath, state);

  const outside = join(root, "outside");
  await mkdir(outside);
  await writeFile(join(outside, `test-${key}.md`), "OUTSIDE VAULT PRIVATE DATA");
  const junction = join(vault, "작업기록/세션기록/2000-01/2000-01-01");
  await mkdir(dirname(junction), { recursive: true });
  try {
    await symlink(outside, junction, process.platform === "win32" ? "junction" : "dir");
    await writeFile(statePath, JSON.stringify({ createdAt: "2000-01-01T00:00:00Z", relativePath: `작업기록/세션기록/2000-01/2000-01-01/test-${key}.md` }));
    const escaped = run(runner, ["stop"], { cwd: project, session_id: sessionId });
    const line = escaped.output.reason?.split("\n").find((value) => value.startsWith("{"));
    const data = line ? JSON.parse(line) : {};
    observations.hookInstructsReadOutsideVault = Boolean(data.existingNote) && await realpath(data.existingNote) === await realpath(join(outside, `test-${key}.md`));
    observations.writerRejectsOutsideVault = save("Should not escape").exit !== 0;
    assert.equal(observations.hookInstructsReadOutsideVault, false);
    assert.equal(observations.writerRejectsOutsideVault, true);
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) observations.symlinkTestSkipped = error.code;
    else throw error;
  }
  console.log(JSON.stringify(observations, null, 2));
} finally {
  const rel = relative(tmpdir(), root);
  assert.ok(rel.startsWith("omob-adversarial-") && !rel.includes(".."));
  await rm(root, { recursive: true, force: true });
}

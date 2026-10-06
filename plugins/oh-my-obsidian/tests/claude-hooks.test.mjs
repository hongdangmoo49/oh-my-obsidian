import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const rootRepo = resolve(import.meta.dirname, "../../..");
const runner = join(rootRepo, "plugins/oh-my-obsidian/hooks/codex-hook-runner.mjs");
const migrate = join(rootRepo, "scripts/claude-auto-save.mjs");
const saver = join(rootRepo, "plugins/oh-my-obsidian/scripts/vault-ops.mjs");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "omob-claude-test-"));
  const home = join(root, "home");
  const vault = join(root, "vault");
  await mkdir(join(home, ".claude"), { recursive: true });
  await mkdir(vault);
  await mkdir(join(root, ".git"));
  const env = { ...process.env, HOME: home, USERPROFILE: home, PWD: root, OBSIDIAN_VAULT: vault };
  const run = (script, args, input) => {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env, encoding: "utf8", input: input ? JSON.stringify(input) : undefined });
    return { code: result.status, output: result.stdout ? JSON.parse(result.stdout) : null, stderr: result.stderr };
  };
  const migration = (action, extra = []) => run(migrate, [action, "--home", home, "--vault", vault, ...extra]);
  return { root, home, vault, run, migration, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("PR #9 migration preserves mixed hooks/settings, requires attachment approval, and is idempotent", async () => {
  const f = await fixture();
  try {
    const settingsPath = join(f.home, ".claude/settings.json");
    const settings = { env: { ANTHROPIC_AUTH_TOKEN: "synthetic-private-value" }, permissions: { allow: ["Read"] }, hooks: { SessionEnd: [{ matcher: "", hooks: [
      { type: "command", command: "keep-this-command" }, { type: "command", command: "claude -p '/oh-my-obsidian:session-save'" },
    ] }], Stop: [{ hooks: [{ type: "command", command: "keep-stop" }] }] } };
    await writeFile(settingsPath, JSON.stringify(settings));
    assert.equal(f.migration("plan").code, 1);
    const plan = f.migration("plan", ["--attach-legacy"]);
    assert.equal(plan.code, 0);
    assert.equal(plan.output.removedLegacySessionEndCommands, 1);
    assert.equal(JSON.stringify(plan.output).includes("synthetic-private-value"), false);
    assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), settings);
    const applied = f.migration("apply", ["--attach-legacy"]);
    assert.equal(applied.code, 0, applied.stderr);
    const actual = JSON.parse(await readFile(settingsPath, "utf8"));
    assert.deepEqual(actual.permissions, settings.permissions);
    assert.deepEqual(actual.env, settings.env);
    assert.deepEqual(actual.hooks.Stop, settings.hooks.Stop);
    assert.deepEqual(actual.hooks.SessionEnd[0].hooks, [settings.hooks.SessionEnd[0].hooks[0]]);
    assert.equal(f.migration("apply").output.removedLegacySessionEndCommands, 0);
  } finally { await f.cleanup(); }
});

test("invalid settings are not cleared or replaced by migration", async () => {
  const f = await fixture();
  try {
    const path = join(f.home, ".claude/settings.json");
    for (const contents of ["{broken", "null", "[]"]) {
      await writeFile(path, contents);
      assert.equal(f.migration("apply", ["--attach-legacy"]).code, 1);
      assert.equal(await readFile(path, "utf8"), contents);
      await assert.rejects(readFile(join(f.vault, ".oh-my-obsidian/setup-state.json")), { code: "ENOENT" });
    }
  } finally { await f.cleanup(); }
});

test("legacy attachment never replaces incomplete setup metadata", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.vault, ".oh-my-obsidian"));
    const path = join(f.vault, ".oh-my-obsidian/setup-state.json");
    const original = JSON.stringify({ schema: "oh-my-obsidian/setup-state/v1", status: "in_progress", vaultRealPath: f.vault });
    await writeFile(path, original);
    assert.equal(f.migration("apply", ["--attach-legacy"]).code, 1);
    assert.equal(await readFile(path, "utf8"), original);
  } finally { await f.cleanup(); }
});

test("legacy attachment rejects metadata junction escape", async () => {
  const f = await fixture();
  try {
    const outside = join(f.root, "outside");
    await mkdir(outside);
    await symlink(outside, join(f.vault, ".oh-my-obsidian"), process.platform === "win32" ? "junction" : "dir");
    assert.equal(f.migration("apply", ["--attach-legacy"]).code, 1);
    await assert.rejects(readFile(join(outside, "setup-state.json")), { code: "ENOENT" });
  } finally { await f.cleanup(); }
});

for (const modern of [false, true]) {
  test(`Claude ${modern ? "prompt_id" : "legacy prompt-id fallback"} verifies real saves and preserves records`, async () => {
    const f = await fixture();
    try {
      assert.equal(f.migration("apply", ["--attach-legacy"]).code, 0);
      const hook = (event, promptId) => f.run(runner, [event, "--claude"], { cwd: f.root, session_id: "claude-test",
        ...(modern ? { prompt_id: promptId } : {}), prompt: "RAW_PROMPT_SHOULD_NOT_APPEAR", transcript_path: "/do-not-read.jsonl" }).output;
      const prompt = hook("user-prompt-submit", "prompt-1");
      assert.equal(prompt.hookSpecificOutput.hookEventName, "UserPromptSubmit");
      const context = prompt.hookSpecificOutput.additionalContext;
      assert.doesNotMatch(context, /RAW_PROMPT_SHOULD_NOT_APPEAR|do-not-read/);
      const data = JSON.parse(context.split("\n").find((line) => line.startsWith("{")));
      assert.equal(data.sessionId, "claude:claude-test");
      if (modern) assert.equal(data.turnId, "prompt-1");
      else assert.match(data.turnId, /^[a-f0-9-]{36}$/);
      assert.match(hook("stop", "prompt-1").systemMessage, /미확인/);
      const first = f.run(saver, ["session-save", "--auto-session-id", data.sessionId, "--auto-turn-id", data.turnId,
        "--topic", "Claude save", "--detail", "Completed work", "--decision", "Preserve prior decision", "--next-step", "Pending task",
        "--participant", "Claude", "--participant", "User"]);
      assert.equal(first.code, 0, JSON.stringify(first.output));
      assert.equal(first.output.verified, true);
      assert.equal(first.output.git.attempted, false);
      assert.deepEqual(hook("stop", "prompt-1"), { continue: true });
      const path = join(f.vault, first.output.relativePath);
      const original = await readFile(path, "utf8");
      assert.match(original, /participants: \[Claude, User\]/);
      const secondContext = hook("user-prompt-submit", "prompt-2").hookSpecificOutput.additionalContext;
      const second = JSON.parse(secondContext.split("\n").find((line) => line.startsWith("{")));
      assert.notEqual(second.turnId, data.turnId);
      assert.match(hook("stop", "prompt-2").systemMessage, /미확인/);
      const updated = f.run(saver, ["session-save", "--auto-session-id", second.sessionId, "--auto-turn-id", second.turnId,
        "--topic", "Claude save", "--detail", "New work", "--expected-note-hash", first.output.noteHash]);
      assert.equal(updated.code, 0);
      assert.equal(updated.output.relativePath, first.output.relativePath);
      assert.match(await readFile(path, "utf8"), /Preserve prior decision/);
      assert.match(await readFile(path, "utf8"), /Pending task/);
      assert.deepEqual(hook("stop", "prompt-2"), { continue: true });
      await writeFile(path, (await readFile(path, "utf8")).replace("New work", "USER EDIT"));
      assert.match(hook("stop", "prompt-2").systemMessage, /미확인/);
      assert.equal(f.migration("apply", ["--disable"]).code, 0);
      assert.deepEqual(hook("user-prompt-submit", "prompt-3"), { continue: true });
      assert.deepEqual(hook("stop", "prompt-3"), { continue: true });
    } finally { await f.cleanup(); }
  });
}

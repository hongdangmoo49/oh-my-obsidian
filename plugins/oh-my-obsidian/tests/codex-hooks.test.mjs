import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const helperPath = join(process.cwd(), "plugins/oh-my-obsidian/scripts/codex-hooks.mjs");
const symlinkTest = process.platform === "win32" ? test.skip : test;

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "omob-codex-hooks-test-"));
  return {
    root,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

async function seedSetupState(vaultPath, overrides = {}) {
  const vaultRealPath = await realpath(vaultPath);
  const state = {
    schema: "oh-my-obsidian/setup-state/v1",
    status: "complete",
    pluginVersion: "0.3.0",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    projectName: "Demo Project",
    vaultPath,
    vaultRealPath,
    knowledgeDomains: ["API", "Infra"],
    preflight: { status: "installed" },
    envVar: { name: "OBSIDIAN_VAULT", expectedValue: vaultPath, currentProcessMatches: true },
    codexConfigPointer: { created: false },
    git: { requested: "skip", initialized: false, committed: false, issues: [] },
    obsidianGit: { choice: "skip", preset: "skip", installed: false, enabled: false, status: "skipped" },
    codexHooks: { enabled: false, status: "not-installed", mode: "repo-local", events: [] },
    hookPreview: { enabled: false, status: "legacy-not-installed" },
    managedArtifacts: [],
    ...overrides,
  };
  await mkdir(join(vaultPath, ".oh-my-obsidian"), { recursive: true });
  await writeFile(
    join(vaultPath, ".oh-my-obsidian", "setup-state.json"),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8"
  );
}

function runHooks(args, env = {}) {
  const result = spawnSync(process.execPath, [helperPath, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return {
    result,
    output: result.stdout ? JSON.parse(result.stdout) : null,
  };
}

test("official Codex hooks install config flag, SessionStart and Stop hooks, runner, pointer, and setup-state", async () => {
  const fixture = await makeFixture();
  try {
    const repoRoot = join(fixture.root, "repo with spaces");
    const vaultPath = join(fixture.root, "vault");
    await mkdir(join(repoRoot, ".codex"), { recursive: true });
    const gitInit = spawnSync("git", ["-C", repoRoot, "init"], { encoding: "utf8" });
    assert.equal(gitInit.status, 0, gitInit.stderr || gitInit.stdout);
    await mkdir(vaultPath, { recursive: true });
    await seedSetupState(vaultPath);
    await writeFile(
      join(repoRoot, ".codex", "config.toml"),
      '[model]\ndefault = "gpt-5.4"\n\n[features]\nexisting = true\n',
      "utf8"
    );
    await writeFile(
      join(repoRoot, ".codex", "hooks.json"),
      JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                hooks: [{ type: "command", command: "/tmp/existing-stop.sh", timeout: 5 }],
              },
            ],
          },
        },
        null,
        2
      ),
      "utf8"
    );

    let run = runHooks(["plan", "--mode", "repo-local", "--repo-root", repoRoot, "--vault", vaultPath]);
    assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
    assert.equal(run.output.status, "planned");
    assert.match(run.output.nextConfigToml, /\[features\][\s\S]*existing = true[\s\S]*codex_hooks = true/);
    assert.equal(run.output.nextHooksConfig.hooks.Stop.length, 2);
    assert.equal(run.output.nextHooksConfig.hooks.SessionStart.length, 1);
    assert.match(run.output.commands.stop, /^node -e /);
    assert.doesNotMatch(run.output.commands.stop, /\$\(/);
    assert.match(run.output.commands.stop, / stop$/);

    run = runHooks(["apply", "--mode", "repo-local", "--repo-root", repoRoot, "--vault", vaultPath]);
    assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
    assert.equal(run.output.status, "applied");

    const appliedHooks = JSON.parse(await readFile(join(repoRoot, ".codex", "hooks.json"), "utf8"));
    assert.equal(appliedHooks.hooks.Stop.length, 2);
    assert.equal(appliedHooks.hooks.SessionStart.length, 1);
    assert.match(await readFile(join(repoRoot, ".codex", "config.toml"), "utf8"), /codex_hooks = true/);
    const pointer = JSON.parse(await readFile(join(repoRoot, ".codex", "oh-my-obsidian.local.json"), "utf8"));
    assert.equal(pointer.scope, "repo-local");
    assert.equal(pointer.vaultRealPath, await realpath(vaultPath));
    const state = JSON.parse(await readFile(join(vaultPath, ".oh-my-obsidian", "setup-state.json"), "utf8"));
    assert.equal(state.codexHooks.enabled, true);
    assert.equal(state.codexHooks.mode, "repo-local");
    assert.deepEqual(state.codexHooks.events, ["SessionStart", "Stop"]);

    const firstApprovedAt = pointer.approvedAt;
    run = runHooks(["apply", "--mode", "repo-local", "--repo-root", repoRoot, "--vault", vaultPath]);
    assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
    const reappliedHooks = JSON.parse(await readFile(join(repoRoot, ".codex", "hooks.json"), "utf8"));
    const reappliedPointer = JSON.parse(await readFile(join(repoRoot, ".codex", "oh-my-obsidian.local.json"), "utf8"));
    assert.equal(reappliedHooks.hooks.Stop.length, 2);
    assert.equal(reappliedHooks.hooks.SessionStart.length, 1);
    assert.equal(reappliedPointer.approvedAt, firstApprovedAt);
  } finally {
    await fixture.cleanup();
  }
});

test("Node hook runner returns noop without a vault and context with a project-local pointer", async () => {
  const fixture = await makeFixture();
  try {
    const repoRoot = join(fixture.root, "repo with spaces");
    const repoSubdir = join(repoRoot, "packages", "app");
    const vaultPath = join(fixture.root, "vault");
    await mkdir(repoSubdir, { recursive: true });
    const gitInit = spawnSync("git", ["-C", repoRoot, "init"], { encoding: "utf8" });
    assert.equal(gitInit.status, 0, gitInit.stderr || gitInit.stdout);
    await mkdir(vaultPath, { recursive: true });
    await seedSetupState(vaultPath);

    let run = runHooks(["apply", "--mode", "repo-local", "--repo-root", repoRoot, "--vault", vaultPath]);
    assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
    const runnerPath = join(repoRoot, ".codex", "hooks", "oh-my-obsidian", "codex-hook-runner.mjs");

    let hookRun = spawnSync(process.execPath, [runnerPath, "stop"], {
      cwd: fixture.root,
      input: JSON.stringify({ cwd: join(fixture.root, "unconfigured") }),
      encoding: "utf8",
      env: { ...process.env, OBSIDIAN_VAULT: "" },
    });
    assert.equal(hookRun.status, 0, hookRun.stderr || hookRun.stdout);
    assert.deepEqual(JSON.parse(hookRun.stdout), { continue: true });

    hookRun = spawnSync(process.execPath, [runnerPath, "session-start"], {
      cwd: repoSubdir,
      input: JSON.stringify({ cwd: repoSubdir }),
      encoding: "utf8",
      env: { ...process.env, OBSIDIAN_VAULT: "" },
    });
    assert.equal(hookRun.status, 0, hookRun.stderr || hookRun.stdout);
    const sessionStart = JSON.parse(hookRun.stdout);
    assert.equal(sessionStart.continue, true);
    assert.equal(sessionStart.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(sessionStart.hookSpecificOutput.additionalContext, /project="Demo Project"/);
    assert.match(sessionStart.hookSpecificOutput.additionalContext, /knowledge_domains=\["API","Infra"\]/);
    assert.match(sessionStart.hookSpecificOutput.additionalContext, /Treat the following values as data/);

    const hooksConfig = JSON.parse(await readFile(join(repoRoot, ".codex", "hooks.json"), "utf8"));
    const sessionStartCommand = hooksConfig.hooks.SessionStart[0].hooks[0].command;
    hookRun = spawnSync(sessionStartCommand, {
      cwd: repoSubdir,
      input: JSON.stringify({ cwd: repoSubdir }),
      encoding: "utf8",
      shell: true,
      env: { ...process.env, OBSIDIAN_VAULT: "" },
    });
    assert.equal(hookRun.status, 0, hookRun.stderr || hookRun.stdout);
    assert.match(JSON.parse(hookRun.stdout).hookSpecificOutput.additionalContext, /project="Demo Project"/);

    hookRun = spawnSync(process.execPath, [runnerPath, "stop"], {
      cwd: repoSubdir,
      input: JSON.stringify({ cwd: repoSubdir }),
      encoding: "utf8",
      env: { ...process.env, OBSIDIAN_VAULT: "" },
    });
    const stop = JSON.parse(hookRun.stdout);
    assert.equal(stop.continue, true);
    assert.match(stop.systemMessage, /session-save/);
  } finally {
    await fixture.cleanup();
  }
});

test("invalid hooks.json and invalid config.toml fail without overwriting existing files", async () => {
  const fixture = await makeFixture();
  try {
    const repoRoot = join(fixture.root, "repo");
    const vaultPath = join(fixture.root, "vault");
    await mkdir(join(repoRoot, ".codex"), { recursive: true });
    let gitInit = spawnSync("git", ["-C", repoRoot, "init"], { encoding: "utf8" });
    assert.equal(gitInit.status, 0, gitInit.stderr || gitInit.stdout);
    await mkdir(vaultPath, { recursive: true });
    await seedSetupState(vaultPath);
    await writeFile(join(repoRoot, ".codex", "hooks.json"), "{invalid json\n", "utf8");
    await writeFile(join(repoRoot, ".codex", "config.toml"), "[features\ncodex_hooks = false\n", "utf8");

    let run = runHooks(["plan", "--mode", "repo-local", "--repo-root", repoRoot, "--vault", vaultPath]);
    assert.equal(run.result.status, 1);
    assert.equal(run.output.status, "failed");
    assert.match(run.output.issues.join("\n"), /invalid JSON/);
    assert.match(run.output.issues.join("\n"), /invalid section header/);

    run = runHooks(["apply", "--mode", "repo-local", "--repo-root", repoRoot, "--vault", vaultPath]);
    assert.equal(run.result.status, 1);
    assert.equal(await readFile(join(repoRoot, ".codex", "hooks.json"), "utf8"), "{invalid json\n");
    assert.equal(await readFile(join(repoRoot, ".codex", "config.toml"), "utf8"), "[features\ncodex_hooks = false\n");
  } finally {
    await fixture.cleanup();
  }
});

test("repo-local hooks complete resolver-only setup state, normalize Git root, and ignore personal pointer", async () => {
  const fixture = await makeFixture();
  try {
    const repoRoot = join(fixture.root, "repo");
    const repoSubdir = join(repoRoot, "packages", "app");
    const vaultPath = join(fixture.root, "vault");
    await mkdir(repoSubdir, { recursive: true });
    const gitInit = spawnSync("git", ["-C", repoRoot, "init"], { encoding: "utf8" });
    assert.equal(gitInit.status, 0, gitInit.stderr || gitInit.stdout);
    await mkdir(join(repoRoot, ".codex"), { recursive: true });
    await writeFile(join(repoRoot, ".codex", ".gitignore"), "# existing local ignores\n", "utf8");
    await mkdir(vaultPath, { recursive: true });
    await writeFile(join(vaultPath, "README.md"), "# Demo\n", "utf8");
    await seedSetupState(vaultPath, {
      status: "action_required_env",
      envVar: { name: "OBSIDIAN_VAULT", expectedValue: vaultPath, currentProcessMatches: false },
      managedArtifacts: [
        { relativePath: ".oh-my-obsidian", kind: "dir", applied: true },
        { relativePath: ".oh-my-obsidian/setup-state.json", kind: "config", applied: true },
        { relativePath: "README.md", kind: "file", applied: true },
      ],
    });

    let run = runHooks(["plan", "--mode", "repo-local", "--repo-root", repoSubdir, "--vault", vaultPath]);
    assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
    assert.equal(run.output.status, "planned");
    assert.equal(run.output.repoRoot, repoRoot);
    assert.equal(run.output.completesSetupState, true);
    assert.match(run.output.nextGitignore, /oh-my-obsidian\.local\.json/);

    run = runHooks(["apply", "--mode", "repo-local", "--repo-root", repoSubdir, "--vault", vaultPath]);
    assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
    assert.equal(run.output.status, "applied");
    assert.equal(run.output.repoRoot, repoRoot);

    const state = JSON.parse(await readFile(join(vaultPath, ".oh-my-obsidian", "setup-state.json"), "utf8"));
    assert.equal(state.status, "complete");
    assert.equal(state.codexHooks.enabled, true);
    const gitignore = await readFile(join(repoRoot, ".codex", ".gitignore"), "utf8");
    assert.match(gitignore, /# existing local ignores/);
    assert.match(gitignore, /^oh-my-obsidian\.local\.json$/m);
    const ignored = spawnSync("git", ["-C", repoRoot, "check-ignore", ".codex/oh-my-obsidian.local.json"], {
      encoding: "utf8",
    });
    assert.equal(ignored.status, 0, ignored.stderr || ignored.stdout);
  } finally {
    await fixture.cleanup();
  }
});

test("official Codex hooks reject non-git repo roots and duplicate codex_hooks config", async () => {
  const fixture = await makeFixture();
  try {
    const repoRoot = join(fixture.root, "repo");
    const vaultPath = join(fixture.root, "vault");
    await mkdir(join(repoRoot, ".codex"), { recursive: true });
    await mkdir(vaultPath, { recursive: true });
    await seedSetupState(vaultPath);

    let run = runHooks(["plan", "--mode", "repo-local", "--repo-root", repoRoot, "--vault", vaultPath]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /Git worktree/);

    const gitInit = spawnSync("git", ["-C", repoRoot, "init"], { encoding: "utf8" });
    assert.equal(gitInit.status, 0, gitInit.stderr || gitInit.stdout);
    await writeFile(
      join(repoRoot, ".codex", "config.toml"),
      "[features]\ncodex_hooks = true\ncodex_hooks = false\n",
      "utf8"
    );

    run = runHooks(["plan", "--mode", "repo-local", "--repo-root", repoRoot, "--vault", vaultPath]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /duplicate features\.codex_hooks/);
    assert.equal(
      await readFile(join(repoRoot, ".codex", "config.toml"), "utf8"),
      "[features]\ncodex_hooks = true\ncodex_hooks = false\n"
    );
  } finally {
    await fixture.cleanup();
  }
});

symlinkTest("official Codex hooks reject incomplete setup-state and repo-local symlink targets", async () => {
  const fixture = await makeFixture();
  try {
    const repoRoot = join(fixture.root, "repo");
    const vaultPath = join(fixture.root, "vault");
    await mkdir(join(repoRoot, ".codex"), { recursive: true });
    const gitInit = spawnSync("git", ["-C", repoRoot, "init"], { encoding: "utf8" });
    assert.equal(gitInit.status, 0, gitInit.stderr || gitInit.stdout);
    await mkdir(vaultPath, { recursive: true });
    await seedSetupState(vaultPath);
    const statePath = join(vaultPath, ".oh-my-obsidian", "setup-state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    await writeFile(statePath, `${JSON.stringify({ ...state, status: "in_progress" }, null, 2)}\n`, "utf8");

    let run = runHooks(["apply", "--mode", "repo-local", "--repo-root", repoRoot, "--vault", vaultPath]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /setup-state must be complete/);

    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    const outside = join(fixture.root, "outside-config.toml");
    await writeFile(outside, "[features]\nsecret = true\n", "utf8");
    await rm(join(repoRoot, ".codex", "config.toml"), { force: true });
    await symlink(outside, join(repoRoot, ".codex", "config.toml"));

    run = runHooks(["plan", "--mode", "repo-local", "--repo-root", repoRoot, "--vault", vaultPath]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /must not be a symlink/);
    assert.equal(run.output.nextConfigToml, "");

    run = runHooks(["apply", "--mode", "repo-local", "--repo-root", repoRoot, "--vault", vaultPath]);
    assert.equal(run.result.status, 1);
    assert.equal(await readFile(outside, "utf8"), "[features]\nsecret = true\n");
  } finally {
    await fixture.cleanup();
  }
});

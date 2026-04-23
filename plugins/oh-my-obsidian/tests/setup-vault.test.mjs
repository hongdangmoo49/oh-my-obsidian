import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const scriptPath = join(process.cwd(), "plugins/oh-my-obsidian/scripts/setup-vault.mjs");
const preflightJson = JSON.stringify({
  schema: "oh-my-obsidian/obsidian-app-preflight/v1",
  status: "installed",
  obsidian: { installed: true, path: "/Applications/Obsidian.app", version: "1.0.0" },
});

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "omob-setup-test-"));
  const home = join(root, "home");
  await mkdir(home, { recursive: true });
  return {
    root,
    home,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

function runSetup(home, args, env = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: home,
      ...env,
    },
    encoding: "utf8",
  });
  const output = result.stdout ? JSON.parse(result.stdout) : null;
  return { result, output };
}

test("dry-run returns planned managed artifacts", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const { result, output } = runSetup(fixture.home, [
      "dry-run",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
      "--project-name",
      "Demo Project",
      "--domain",
      "API_명세",
      "--domain",
      "인증_인가",
    ]);
    assert.equal(result.status, 0);
    assert.equal(output.status, "planned");
    assert.ok(output.managedArtifacts.some((entry) => entry.relativePath === "작업기록/세션기록"));
  } finally {
    await fixture.cleanup();
  }
});

test("apply with config pointer completes and validate passes", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const applyRun = runSetup(fixture.home, [
      "apply",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
      "--project-name",
      "Demo Project",
      "--domain",
      "API_명세",
      "--domain",
      "인증_인가",
      "--preflight-json",
      preflightJson,
      "--create-config-pointer",
    ]);
    assert.equal(applyRun.result.status, 0);
    assert.equal(applyRun.output.status, "complete");
    assert.ok(applyRun.output.managedArtifacts.every((entry) => entry.applied === true));

    const validateRun = runSetup(fixture.home, [
      "validate",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
    ]);
    assert.equal(validateRun.result.status, 0);
    assert.equal(validateRun.output.status, "complete");
  } finally {
    await fixture.cleanup();
  }
});

test("apply without env or config pointer returns action_required_env", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const run = runSetup(fixture.home, [
      "apply",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
      "--project-name",
      "Demo Project",
      "--domain",
      "API",
      "--domain",
      "Infra",
      "--preflight-json",
      preflightJson,
    ]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.status, "action_required_env");
    assert.ok(run.output.nextSteps.length > 0);
  } finally {
    await fixture.cleanup();
  }
});

test("reconcile dry-run reports missing managed artifacts", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    runSetup(fixture.home, [
      "apply",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
      "--project-name",
      "Demo Project",
      "--domain",
      "API",
      "--domain",
      "Infra",
      "--preflight-json",
      preflightJson,
      "--create-config-pointer",
    ]);

    await unlink(join(vaultPath, "scripts", "team-setup", "README.md"));

    const run = runSetup(fixture.home, [
      "reconcile",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
    ]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.status, "needs-reconcile");
    assert.deepEqual(run.output.missing, ["scripts/team-setup/README.md"]);
  } finally {
    await fixture.cleanup();
  }
});

test("resume recreates missing managed artifacts for in-progress setup", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    runSetup(fixture.home, [
      "apply",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
      "--project-name",
      "Resume Demo",
      "--domain",
      "API",
      "--domain",
      "Infra",
      "--preflight-json",
      preflightJson,
      "--create-config-pointer",
    ]);

    await unlink(join(vaultPath, "scripts", "team-setup", "README.md"));
    const statePath = join(vaultPath, ".oh-my-obsidian", "setup-state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.status = "in_progress";
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const run = runSetup(fixture.home, [
      "resume",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
    ]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.status, "complete");
    const restored = await readFile(join(vaultPath, "scripts", "team-setup", "README.md"), "utf8");
    assert.match(restored, /Team Setup/);
  } finally {
    await fixture.cleanup();
  }
});

test("apply requires preflight result", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const run = runSetup(fixture.home, [
      "apply",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
      "--project-name",
      "No Preflight",
      "--domain",
      "API",
      "--domain",
      "Infra",
    ]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /preflight result is required/);
  } finally {
    await fixture.cleanup();
  }
});

test("apply blocks on existing unmanaged file before writing setup-state", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    await mkdir(vaultPath, { recursive: true });
    await writeFile(join(vaultPath, "README.md"), "# user readme\n", "utf8");

    const run = runSetup(fixture.home, [
      "apply",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
      "--project-name",
      "Conflict Demo",
      "--domain",
      "API",
      "--domain",
      "Infra",
      "--preflight-json",
      preflightJson,
    ]);
    assert.equal(run.result.status, 1);
    assert.equal(run.output.status, "failed");
    assert.match(run.output.issues.join("\n"), /existing unmanaged file would block setup/);
    assert.equal(
      runSetup(fixture.home, ["validate", "--home", fixture.home, "--vault", vaultPath]).result.status,
      1
    );
  } finally {
    await fixture.cleanup();
  }
});

test("validate returns action_required_env when resolver does not work", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    runSetup(fixture.home, [
      "apply",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
      "--project-name",
      "Env Demo",
      "--domain",
      "API",
      "--domain",
      "Infra",
      "--preflight-json",
      preflightJson,
    ]);

    const validateRun = runSetup(fixture.home, [
      "validate",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
    ]);
    assert.equal(validateRun.result.status, 0);
    assert.equal(validateRun.output.status, "action_required_env");
  } finally {
    await fixture.cleanup();
  }
});

test("attach creates setup-state for an existing vault without overwriting files", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    await mkdir(join(vaultPath, "작업기록", "세션기록"), { recursive: true });
    await mkdir(join(vaultPath, "Demo_Project", "API"), { recursive: true });
    await mkdir(join(vaultPath, "Demo_Project", "Infra"), { recursive: true });
    await mkdir(join(vaultPath, ".obsidian", "plugins", "obsidian-git"), { recursive: true });
    await writeFile(join(vaultPath, ".obsidian", "plugins", "obsidian-git", "manifest.json"), '{"id":"obsidian-git"}\n', "utf8");
    await writeFile(join(vaultPath, ".obsidian", "plugins", "obsidian-git", "main.js"), 'console.log("fixture");\n', "utf8");
    await writeFile(join(vaultPath, ".obsidian", "plugins", "obsidian-git", "styles.css"), '.fixture {}\n', "utf8");
    await writeFile(join(vaultPath, ".obsidian", "community-plugins.json"), '["obsidian-git"]\n', "utf8");
    spawnSync("git", ["-C", vaultPath, "-c", "init.defaultBranch=main", "init"], { encoding: "utf8" });

    const run = runSetup(fixture.home, [
      "attach",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
      "--project-name",
      "Demo Project",
      "--domain",
      "API",
      "--domain",
      "Infra",
      "--preflight-json",
      preflightJson,
      "--create-config-pointer",
    ]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.action, "attach");
    assert.ok(run.output.missing.length > 0);
    const state = JSON.parse(await readFile(join(vaultPath, ".oh-my-obsidian", "setup-state.json"), "utf8"));
    assert.equal(state.status, "in_progress");
    assert.equal(state.git.initialized, true);
    assert.equal(state.obsidianGit.installed, true);
    assert.equal(state.obsidianGit.enabled, true);
    assert.equal(state.obsidianGit.choice, "manual");
    assert.equal(state.obsidianGit.preset, "manual");
  } finally {
    await fixture.cleanup();
  }
});

test("attach blocks conflicting managed files such as README.md", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    await mkdir(join(vaultPath, "Demo_Project", "API"), { recursive: true });
    await mkdir(join(vaultPath, "Demo_Project", "Infra"), { recursive: true });
    await writeFile(join(vaultPath, "README.md"), "# existing readme\n", "utf8");

    const run = runSetup(fixture.home, [
      "attach",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
      "--project-name",
      "Demo Project",
      "--domain",
      "API",
      "--domain",
      "Infra",
      "--preflight-json",
      preflightJson,
    ]);
    assert.equal(run.result.status, 1);
    assert.equal(run.output.status, "failed");
    assert.match(run.output.issues.join("\n"), /existing unmanaged file would block setup: README\.md/);
    assert.equal(await readFile(join(vaultPath, "README.md"), "utf8"), "# existing readme\n");
  } finally {
    await fixture.cleanup();
  }
});

test("attach rejects managed file symlink escape", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const outside = join(fixture.root, "outside");
    await mkdir(join(vaultPath, "Demo_Project", "API"), { recursive: true });
    await mkdir(join(vaultPath, "Demo_Project", "Infra"), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "README.md"), "# Demo Project - Knowledge Vault\n", "utf8");
    await symlink(join(outside, "README.md"), join(vaultPath, "README.md"));

    const run = runSetup(fixture.home, [
      "attach",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
      "--project-name",
      "Demo Project",
      "--domain",
      "API",
      "--domain",
      "Infra",
      "--preflight-json",
      preflightJson,
    ]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /managed file escapes vault/);
  } finally {
    await fixture.cleanup();
  }
});

test("git init skips commit when unrelated staged changes exist", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    await mkdir(vaultPath, { recursive: true });
    spawnSync("git", ["-C", vaultPath, "-c", "init.defaultBranch=main", "init"], { encoding: "utf8" });
    spawnSync("git", ["-C", vaultPath, "config", "user.email", "test@example.com"], { encoding: "utf8" });
    spawnSync("git", ["-C", vaultPath, "config", "user.name", "Test User"], { encoding: "utf8" });
    await writeFile(join(vaultPath, "unrelated.txt"), "user work\n", "utf8");
    spawnSync("git", ["-C", vaultPath, "add", "unrelated.txt"], { encoding: "utf8" });

    const run = runSetup(fixture.home, [
      "apply",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
      "--project-name",
      "Git Safety",
      "--domain",
      "API",
      "--domain",
      "Infra",
      "--preflight-json",
      preflightJson,
      "--git",
      "init",
    ]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.git.committed, false);
    assert.match(run.output.git.issues.join("\n"), /unrelated git paths/);
  } finally {
    await fixture.cleanup();
  }
});

test("resume fails when vault realpath does not match setup-state", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    runSetup(fixture.home, [
      "apply",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
      "--project-name",
      "Resume Mismatch",
      "--domain",
      "API",
      "--domain",
      "Infra",
      "--preflight-json",
      preflightJson,
      "--create-config-pointer",
    ]);

    const statePath = join(vaultPath, ".oh-my-obsidian", "setup-state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.vaultRealPath = join(fixture.root, "different");
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const run = runSetup(fixture.home, [
      "resume",
      "--home",
      fixture.home,
      "--vault",
      vaultPath,
    ]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /vaultRealPath mismatch/);
  } finally {
    await fixture.cleanup();
  }
});

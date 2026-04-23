import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const scriptPath = join(process.cwd(), "plugins/oh-my-obsidian/scripts/obsidian-git-setup.mjs");

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "omob-git-test-"));
  return {
    root,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

function runGitSetup(args, env = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OH_MY_OBSIDIAN_TEST_PLATFORM: "linux",
      ...env,
    },
    encoding: "utf8",
  });
  return {
    result,
    output: result.stdout ? JSON.parse(result.stdout) : null,
  };
}

function createFixtureZip(zipPath, version = "9.9.9") {
  const script = `
import json, sys, zipfile
zip_path = sys.argv[1]
version = sys.argv[2]
with zipfile.ZipFile(zip_path, "w") as zf:
    zf.writestr("obsidian-git/manifest.json", json.dumps({
        "id": "obsidian-git",
        "name": "Git",
        "version": version,
        "description": "fixture"
    }))
    zf.writestr("obsidian-git/main.js", 'console.log("fixture");\\n')
    zf.writestr("obsidian-git/styles.css", '.fixture { display: none; }\\n')
`;
  const result = spawnSync("python3", ["-c", script, zipPath, version], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function seedSetupState(vaultPath, updatedAt = "2020-01-01T00:00:00.000Z") {
  await mkdir(join(vaultPath, ".oh-my-obsidian"), { recursive: true });
  await writeFile(
    join(vaultPath, ".oh-my-obsidian", "setup-state.json"),
    `${JSON.stringify(
      {
        schema: "oh-my-obsidian/setup-state/v1",
        status: "complete",
        pluginVersion: "0.1.0",
        createdAt: updatedAt,
        updatedAt,
        projectName: "Demo Project",
        vaultPath,
        vaultRealPath: vaultPath,
        knowledgeDomains: ["API", "Infra"],
        preflight: { status: "installed" },
        envVar: { name: "OBSIDIAN_VAULT", expectedValue: vaultPath, currentProcessMatches: true },
        codexConfigPointer: { created: false },
        git: { requested: "skip", initialized: false, committed: false, issues: [] },
        obsidianGit: { choice: "skip", installed: false, enabled: false, preset: "skip", status: "skipped" },
        hookPreview: { enabled: false, status: "not-installed" },
        managedArtifacts: [],
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function createFakeBrokenMacGitTooling(root) {
  const binDir = join(root, "fake-bin");
  const gitPath = join(binDir, "git");
  const xcodeSelectPath = join(binDir, "xcode-select");
  const systemGitPath = join(binDir, "system-git");
  await mkdir(binDir, { recursive: true });
  await writeFile(
    gitPath,
    '#!/bin/sh\nif [ "$1" = "--version" ]; then\n  echo "git version 2.41.0"\n  exit 0\nfi\nexit 0\n',
    "utf8"
  );
  await writeFile(
    xcodeSelectPath,
    '#!/bin/sh\nif [ "$1" = "-p" ]; then\n  echo "/Library/Developer/CommandLineTools"\n  exit 0\nfi\nexit 1\n',
    "utf8"
  );
  await writeFile(
    systemGitPath,
    '#!/bin/sh\necho "xcrun: error: invalid active developer path (/Library/Developer/CommandLineTools), missing xcrun at: /Library/Developer/CommandLineTools/usr/bin/xcrun" >&2\nexit 1\n',
    "utf8"
  );
  await chmod(gitPath, 0o755);
  await chmod(xcodeSelectPath, 0o755);
  await chmod(systemGitPath, 0o755);
  return { binDir, systemGitPath };
}

test("apply requires an existing valid setup-state", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const zipPath = join(fixture.root, "fixture.zip");
    await mkdir(join(vaultPath, ".obsidian"), { recursive: true });
    createFixtureZip(zipPath);

    const run = runGitSetup([
      "apply",
      vaultPath,
      "--preset",
      "safe",
      "--source-zip",
      zipPath,
      "--version",
      "9.9.9",
    ]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /valid setup-state\.json is required/);
  } finally {
    await fixture.cleanup();
  }
});

test("reconcile preserves enabled truth and updates setup-state timestamp", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const zipPath = join(fixture.root, "fixture.zip");
    await mkdir(join(vaultPath, ".obsidian"), { recursive: true });
    createFixtureZip(zipPath);
    await seedSetupState(vaultPath);

    let run = runGitSetup([
      "apply",
      vaultPath,
      "--preset",
      "manual",
      "--enable",
      "--source-zip",
      zipPath,
      "--version",
      "9.9.9",
    ]);
    assert.equal(run.result.status, 0);

    const afterEnable = JSON.parse(await readFile(join(vaultPath, ".oh-my-obsidian", "setup-state.json"), "utf8"));
    const firstUpdatedAt = afterEnable.updatedAt;
    assert.equal(afterEnable.obsidianGit.enabled, true);

    run = runGitSetup([
      "apply",
      vaultPath,
      "--preset",
      "safe",
      "--reconcile",
      "--source-zip",
      zipPath,
      "--version",
      "9.9.9",
    ]);
    assert.equal(run.result.status, 0);

    const afterReconcile = JSON.parse(await readFile(join(vaultPath, ".oh-my-obsidian", "setup-state.json"), "utf8"));
    const community = JSON.parse(await readFile(join(vaultPath, ".obsidian", "community-plugins.json"), "utf8"));
    assert.equal(community.includes("obsidian-git"), true);
    assert.equal(afterReconcile.obsidianGit.enabled, true);
    assert.equal(afterReconcile.obsidianGit.preset, "safe");
    assert.notEqual(afterReconcile.updatedAt, firstUpdatedAt);
  } finally {
    await fixture.cleanup();
  }
});

test("existing plugin files require explicit reconcile approval", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const zipPath = join(fixture.root, "fixture.zip");
    await mkdir(join(vaultPath, ".obsidian"), { recursive: true });
    createFixtureZip(zipPath);
    await seedSetupState(vaultPath);

    let run = runGitSetup([
      "apply",
      vaultPath,
      "--preset",
      "safe",
      "--source-zip",
      zipPath,
      "--version",
      "9.9.9",
    ]);
    assert.equal(run.result.status, 0);

    run = runGitSetup([
      "apply",
      vaultPath,
      "--preset",
      "manual",
      "--enable",
      "--source-zip",
      zipPath,
      "--version",
      "9.9.9",
    ]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /require explicit reconcile approval/);
  } finally {
    await fixture.cleanup();
  }
});

test("apply blocks when setup-state vaultRealPath does not match target vault", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const zipPath = join(fixture.root, "fixture.zip");
    await mkdir(join(vaultPath, ".obsidian"), { recursive: true });
    createFixtureZip(zipPath);
    await seedSetupState(vaultPath);

    const statePath = join(vaultPath, ".oh-my-obsidian", "setup-state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.vaultRealPath = join(fixture.root, "different");
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const run = runGitSetup([
      "apply",
      vaultPath,
      "--preset",
      "safe",
      "--source-zip",
      zipPath,
      "--version",
      "9.9.9",
    ]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /vaultRealPath does not match/);
    assert.equal(run.output.plugin.files.manifest, false);
    assert.equal(run.output.plugin.files.data, false);
  } finally {
    await fixture.cleanup();
  }
});

test("safe preset returns ready without remote or upstream requirements", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const zipPath = join(fixture.root, "fixture.zip");
    await mkdir(join(vaultPath, ".obsidian"), { recursive: true });
    createFixtureZip(zipPath);
    await seedSetupState(vaultPath);

    const run = runGitSetup([
      "apply",
      vaultPath,
      "--preset",
      "safe",
      "--source-zip",
      zipPath,
      "--version",
      "9.9.9",
    ]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.status, "ready");
    assert.equal(run.output.recommendations.some((entry) => /remote/i.test(entry)), false);
  } finally {
    await fixture.cleanup();
  }
});

test("validate uses persisted manual choice when preset is not explicitly passed", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const zipPath = join(fixture.root, "fixture.zip");
    await mkdir(join(vaultPath, ".obsidian"), { recursive: true });
    createFixtureZip(zipPath);
    await seedSetupState(vaultPath);

    let run = runGitSetup([
      "apply",
      vaultPath,
      "--preset",
      "manual",
      "--source-zip",
      zipPath,
      "--version",
      "9.9.9",
    ]);
    assert.equal(run.result.status, 0);

    run = runGitSetup(["validate", vaultPath]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.plugin.effectivePreset, "manual");
    assert.equal(run.output.status, "needs-user-action");
    assert.equal(run.output.recommendations.some((entry) => /Enable Obsidian Git/.test(entry)), true);

    const state = JSON.parse(await readFile(join(vaultPath, ".oh-my-obsidian", "setup-state.json"), "utf8"));
    assert.equal(state.obsidianGit.choice, "manual");
    assert.equal(state.obsidianGit.status, "needs-user-action");
  } finally {
    await fixture.cleanup();
  }
});

test("reconcile without explicit preset preserves persisted manual preset", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const zipPath = join(fixture.root, "fixture.zip");
    await mkdir(join(vaultPath, ".obsidian"), { recursive: true });
    createFixtureZip(zipPath);
    await seedSetupState(vaultPath);

    let run = runGitSetup([
      "apply",
      vaultPath,
      "--preset",
      "manual",
      "--enable",
      "--source-zip",
      zipPath,
      "--version",
      "9.9.9",
    ]);
    assert.equal(run.result.status, 0);

    run = runGitSetup([
      "apply",
      vaultPath,
      "--reconcile",
      "--source-zip",
      zipPath,
      "--version",
      "9.9.9",
    ]);
    assert.equal(run.result.status, 0);

    const data = JSON.parse(await readFile(join(vaultPath, ".obsidian", "plugins", "obsidian-git", "data.json"), "utf8"));
    const state = JSON.parse(await readFile(join(vaultPath, ".oh-my-obsidian", "setup-state.json"), "utf8"));
    assert.equal(data.autoSaveInterval, 0);
    assert.equal(state.obsidianGit.preset, "manual");
    assert.equal(state.obsidianGit.choice, "manual");
  } finally {
    await fixture.cleanup();
  }
});

test("validate treats an existing install without data.json as installed", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    await mkdir(join(vaultPath, ".obsidian", "plugins", "obsidian-git"), { recursive: true });
    await seedSetupState(vaultPath);
    await writeFile(
      join(vaultPath, ".obsidian", "plugins", "obsidian-git", "manifest.json"),
      '{"id":"obsidian-git","version":"9.9.9"}\n',
      "utf8"
    );
    await writeFile(
      join(vaultPath, ".obsidian", "plugins", "obsidian-git", "main.js"),
      'console.log("fixture");\n',
      "utf8"
    );
    await writeFile(
      join(vaultPath, ".obsidian", "plugins", "obsidian-git", "styles.css"),
      '.fixture {}\n',
      "utf8"
    );
    await writeFile(join(vaultPath, ".obsidian", "community-plugins.json"), '["obsidian-git"]\n', "utf8");

    const run = runGitSetup(["validate", vaultPath]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.plugin.installed, true);
  } finally {
    await fixture.cleanup();
  }
});

test("apply blocks .obsidian symlink escape without writing plugin files", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const outside = join(fixture.root, "outside");
    const zipPath = join(fixture.root, "fixture.zip");
    await mkdir(vaultPath, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(vaultPath, ".obsidian"));
    createFixtureZip(zipPath);
    await seedSetupState(vaultPath);

    const run = runGitSetup([
      "apply",
      vaultPath,
      "--preset",
      "safe",
      "--source-zip",
      zipPath,
      "--version",
      "9.9.9",
    ]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /write target escapes vault/);
    assert.equal(run.output.plugin.files.manifest, false);
    assert.equal(run.output.plugin.files.data, false);
  } finally {
    await fixture.cleanup();
  }
});

test("validate reports broken macOS git tooling explicitly", async () => {
  const fixture = await makeFixture();
  try {
    const vaultPath = join(fixture.root, "vault");
    const pluginDir = join(vaultPath, ".obsidian", "plugins", "obsidian-git");
    const { binDir, systemGitPath } = await createFakeBrokenMacGitTooling(fixture.root);
    await mkdir(pluginDir, { recursive: true });
    await seedSetupState(vaultPath);
    await writeFile(join(pluginDir, "manifest.json"), '{"id":"obsidian-git","version":"9.9.9"}\n', "utf8");
    await writeFile(join(pluginDir, "main.js"), 'console.log("fixture");\n', "utf8");
    await writeFile(join(pluginDir, "styles.css"), '.fixture {}\n', "utf8");
    await writeFile(join(pluginDir, "data.json"), '{"autoSaveInterval":0}\n', "utf8");
    await writeFile(join(vaultPath, ".obsidian", "community-plugins.json"), '["obsidian-git"]\n', "utf8");

    const run = runGitSetup(["validate", vaultPath], {
      PATH: `${binDir}:${process.env.PATH}`,
      OH_MY_OBSIDIAN_SYSTEM_GIT_PATH: systemGitPath,
      OH_MY_OBSIDIAN_TEST_PLATFORM: "darwin",
    });
    assert.equal(run.result.status, 1);
    assert.equal(run.output.git.status, "broken-path");
    assert.match(run.output.issues.join("\n"), /Command Line Tools path is broken/);
    assert.equal(run.output.git.fixCommand, "xcode-select --install");
  } finally {
    await fixture.cleanup();
  }
});

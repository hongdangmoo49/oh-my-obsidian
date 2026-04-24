import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const scriptPath = join(process.cwd(), "plugins/oh-my-obsidian/scripts/vault-ops.mjs");

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "omob-vault-ops-test-"));
  const vaultPath = join(root, "vault");
  await mkdir(vaultPath, { recursive: true });
  await mkdir(join(vaultPath, "Demo_Project", "API"), { recursive: true });
  await mkdir(join(vaultPath, "Demo_Project", "Infra"), { recursive: true });
  await mkdir(join(vaultPath, "작업기록", "세션기록"), { recursive: true });
  await mkdir(join(vaultPath, "작업기록", "의사결정"), { recursive: true });
  await mkdir(join(vaultPath, "작업기록", "트러블슈팅"), { recursive: true });
  await mkdir(join(vaultPath, "작업기록", "회의록"), { recursive: true });
  await mkdir(join(vaultPath, ".oh-my-obsidian"), { recursive: true });
  await writeFile(
    join(vaultPath, ".oh-my-obsidian", "setup-state.json"),
    `${JSON.stringify(
      {
        schema: "oh-my-obsidian/setup-state/v1",
        status: "complete",
        pluginVersion: "0.1.0",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        projectName: "Demo Project",
        vaultPath,
        vaultRealPath: vaultPath,
        knowledgeDomains: ["API", "Infra"],
        preflight: { status: "installed" },
        envVar: { name: "OBSIDIAN_VAULT", expectedValue: vaultPath, currentProcessMatches: true },
        codexConfigPointer: { created: false },
        git: { requested: "skip", initialized: false, committed: false, issues: [] },
        obsidianGit: { choice: "skip", preset: "skip", installed: false, enabled: false, status: "skipped" },
        hookPreview: { enabled: false, status: "not-installed" },
        managedArtifacts: [
          { relativePath: "Demo_Project", kind: "dir", planned: true, applied: true },
          { relativePath: "작업기록", kind: "dir", planned: true, applied: true },
        ],
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return {
    root,
    vaultPath,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

function runVaultOps(vaultPath, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OBSIDIAN_VAULT: vaultPath,
      ...extraEnv,
    },
    encoding: "utf8",
  });
  return {
    result,
    output: result.stdout ? JSON.parse(result.stdout) : null,
  };
}

test("recall returns relevant excerpts from managed markdown files", async () => {
  const fixture = await makeFixture();
  try {
    await writeFile(join(fixture.vaultPath, "Demo_Project", "API", "auth.md"), "# Auth\nOAuth token flow details\n", "utf8");
    const run = runVaultOps(fixture.vaultPath, ["recall", "--query", "OAuth token"]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.results[0].path, "Demo_Project/API/auth.md");
    assert.match(run.output.results[0].excerpt, /OAuth token flow/);
  } finally {
    await fixture.cleanup();
  }
});

test("session-save creates a collision-suffixed note and skips commit when unrelated git changes exist", async () => {
  const fixture = await makeFixture();
  try {
    spawnSync("git", ["-C", fixture.vaultPath, "-c", "init.defaultBranch=main", "init"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.email", "test@example.com"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.name", "Test User"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "add", "."], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "commit", "-m", "init"], { encoding: "utf8" });
    await writeFile(join(fixture.vaultPath, "unrelated.txt"), "user work\n", "utf8");
    spawnSync("git", ["-C", fixture.vaultPath, "add", "unrelated.txt"], { encoding: "utf8" });
    const existing = join(fixture.vaultPath, "작업기록", "세션기록", `${new Date().toISOString().slice(0, 10)}_release-plan.md`);
    await writeFile(existing, "# Existing\n", "utf8");

    const run = runVaultOps(fixture.vaultPath, [
      "session-save",
      "--topic",
      "Release Plan",
      "--detail",
      "Captured release plan details.",
    ]);
    assert.equal(run.result.status, 0);
    assert.match(run.output.relativePath, /release-plan_2\.md$/);
    assert.equal(run.output.git.committed, false);
    assert.match(run.output.git.reason, /pre-existing git changes make session-save ambiguous/);
  } finally {
    await fixture.cleanup();
  }
});

test("session-save skips commit when the target path has pre-existing git state", async () => {
  const fixture = await makeFixture();
  try {
    spawnSync("git", ["-C", fixture.vaultPath, "-c", "init.defaultBranch=main", "init"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.email", "test@example.com"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.name", "Test User"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "add", "."], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "commit", "-m", "init"], { encoding: "utf8" });
    const target = join(fixture.vaultPath, "작업기록", "세션기록", `${new Date().toISOString().slice(0, 10)}_release-plan.md`);
    await writeFile(target, "# Old note\n", "utf8");
    spawnSync("git", ["-C", fixture.vaultPath, "add", relative(fixture.vaultPath, target)], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "commit", "-m", "add old note"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "rm", relative(fixture.vaultPath, target)], { encoding: "utf8" });

    const run = runVaultOps(fixture.vaultPath, [
      "session-save",
      "--topic",
      "Release Plan",
      "--detail",
      "Updated release plan.",
    ]);
    assert.equal(run.result.status, 0);
    assert.match(run.output.relativePath, /release-plan_2\.md$/);
    assert.equal(run.output.git.committed, false);
    assert.match(run.output.git.reason, /pre-existing git changes make session-save ambiguous/);
  } finally {
    await fixture.cleanup();
  }
});

test("vault add also collision-suffixes when git has a staged delete on the target path", async () => {
  const fixture = await makeFixture();
  try {
    spawnSync("git", ["-C", fixture.vaultPath, "-c", "init.defaultBranch=main", "init"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.email", "test@example.com"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.name", "Test User"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "add", "."], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "commit", "-m", "init"], { encoding: "utf8" });
    const target = join(fixture.vaultPath, "작업기록", "세션기록", `${new Date().toISOString().slice(0, 10)}_api-note.md`);
    await writeFile(target, "# API note\n", "utf8");
    spawnSync("git", ["-C", fixture.vaultPath, "add", relative(fixture.vaultPath, target)], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "commit", "-m", "add api note"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "rm", relative(fixture.vaultPath, target)], { encoding: "utf8" });

    const run = runVaultOps(fixture.vaultPath, [
      "vault",
      "add",
      "--title",
      "API Note",
      "--body",
      "New content",
      "--category",
      "세션기록",
    ]);
    assert.equal(run.result.status, 0);
    assert.match(run.output.relativePath, /api-note_2\.md$/);
    assert.equal(run.output.git.committed, false);
  } finally {
    await fixture.cleanup();
  }
});

test("session-save collision-suffixes when git has a staged rename away from the target path", async () => {
  const fixture = await makeFixture();
  try {
    spawnSync("git", ["-C", fixture.vaultPath, "-c", "init.defaultBranch=main", "init"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.email", "test@example.com"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.name", "Test User"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "add", "."], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "commit", "-m", "init"], { encoding: "utf8" });
    const original = join(fixture.vaultPath, "작업기록", "세션기록", `${new Date().toISOString().slice(0, 10)}_release-plan.md`);
    await writeFile(original, "# Old note\n", "utf8");
    spawnSync("git", ["-C", fixture.vaultPath, "add", relative(fixture.vaultPath, original)], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "commit", "-m", "add old note"], { encoding: "utf8" });
    spawnSync(
      "git",
      ["-C", fixture.vaultPath, "mv", relative(fixture.vaultPath, original), `작업기록/세션기록/${new Date().toISOString().slice(0, 10)}_release-plan-archived.md`],
      { encoding: "utf8" }
    );

    const run = runVaultOps(fixture.vaultPath, [
      "session-save",
      "--topic",
      "Release Plan",
      "--detail",
      "New release plan.",
    ]);
    assert.equal(run.result.status, 0);
    assert.match(run.output.relativePath, /release-plan_2\.md$/);
    assert.equal(run.output.git.committed, false);
  } finally {
    await fixture.cleanup();
  }
});

test("vault add collision-suffixes when git has a staged rename away from the target path", async () => {
  const fixture = await makeFixture();
  try {
    spawnSync("git", ["-C", fixture.vaultPath, "-c", "init.defaultBranch=main", "init"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.email", "test@example.com"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.name", "Test User"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "add", "."], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "commit", "-m", "init"], { encoding: "utf8" });
    const original = join(fixture.vaultPath, "작업기록", "세션기록", `${new Date().toISOString().slice(0, 10)}_api-note.md`);
    await writeFile(original, "# API note\n", "utf8");
    spawnSync("git", ["-C", fixture.vaultPath, "add", relative(fixture.vaultPath, original)], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "commit", "-m", "add api note"], { encoding: "utf8" });
    spawnSync(
      "git",
      ["-C", fixture.vaultPath, "mv", relative(fixture.vaultPath, original), `작업기록/세션기록/${new Date().toISOString().slice(0, 10)}_api-note-archived.md`],
      { encoding: "utf8" }
    );

    const run = runVaultOps(fixture.vaultPath, [
      "vault",
      "add",
      "--title",
      "API Note",
      "--body",
      "New content",
      "--category",
      "세션기록",
    ]);
    assert.equal(run.result.status, 0);
    assert.match(run.output.relativePath, /api-note_2\.md$/);
    assert.equal(run.output.git.committed, false);
  } finally {
    await fixture.cleanup();
  }
});

test("vault add rejects traversal outside the vault", async () => {
  const fixture = await makeFixture();
  try {
    const run = runVaultOps(fixture.vaultPath, [
      "vault",
      "add",
      "--title",
      "Bad Path",
      "--body",
      "Should fail",
      "--relative-dir",
      "../escape",
    ]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /traversal|absolute/);
  } finally {
    await fixture.cleanup();
  }
});

test("vault add rejects reserved metadata paths", async () => {
  const fixture = await makeFixture();
  try {
    const run = runVaultOps(fixture.vaultPath, [
      "vault",
      "add",
      "--title",
      "Metadata Note",
      "--body",
      "Should fail",
      "--relative-dir",
      ".oh-my-obsidian",
    ]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /reserved metadata paths/);
  } finally {
    await fixture.cleanup();
  }
});

test("vault organize plan suggests root markdown moves and apply moves them", async () => {
  const fixture = await makeFixture();
  try {
    await writeFile(join(fixture.vaultPath, "loose-note.md"), "# Loose\n", "utf8");
    let run = runVaultOps(fixture.vaultPath, ["vault", "organize-plan"]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.suggestions[0].to, "작업기록/세션기록/loose-note.md");

    run = runVaultOps(fixture.vaultPath, [
      "vault",
      "organize-apply",
      "--plan-token",
      run.output.planToken,
      "--move",
      "loose-note.md:작업기록/세션기록/loose-note.md",
    ]);
    assert.equal(run.result.status, 0);
    const moved = await readFile(join(fixture.vaultPath, "작업기록", "세션기록", "loose-note.md"), "utf8");
    assert.match(moved, /Loose/);
  } finally {
    await fixture.cleanup();
  }
});

test("vault organize apply rejects moves outside the current plan", async () => {
  const fixture = await makeFixture();
  try {
    const run = runVaultOps(fixture.vaultPath, [
      "vault",
      "organize-apply",
      "--plan-token",
      "bogus",
      "--move",
      ".oh-my-obsidian/setup-state.json:작업기록/세션기록/setup-state.json",
    ]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /matching --plan-token|not part of the current organize plan/);
  } finally {
    await fixture.cleanup();
  }
});

test("vault organize apply requires a plan token from organize-plan", async () => {
  const fixture = await makeFixture();
  try {
    await writeFile(join(fixture.vaultPath, "loose-note.md"), "# Loose\n", "utf8");
    const run = runVaultOps(fixture.vaultPath, [
      "vault",
      "organize-apply",
      "--move",
      "loose-note.md:작업기록/세션기록/loose-note.md",
    ]);
    assert.equal(run.result.status, 1);
    assert.match(run.output.issues.join("\n"), /requires a matching --plan-token/);
  } finally {
    await fixture.cleanup();
  }
});

test("vault organize apply skips commit when pre-existing git changes exist", async () => {
  const fixture = await makeFixture();
  try {
    await writeFile(join(fixture.vaultPath, "loose-note.md"), "# Loose\n", "utf8");
    spawnSync("git", ["-C", fixture.vaultPath, "-c", "init.defaultBranch=main", "init"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.email", "test@example.com"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.name", "Test User"], { encoding: "utf8" });
    await writeFile(join(fixture.vaultPath, "loose-note.md"), "# Loose changed\n", "utf8");
    const plan = runVaultOps(fixture.vaultPath, ["vault", "organize-plan"]);
    const run = runVaultOps(fixture.vaultPath, [
      "vault",
      "organize-apply",
      "--plan-token",
      plan.output.planToken,
      "--move",
      "loose-note.md:작업기록/세션기록/loose-note.md",
    ]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.git.committed, false);
    assert.match(run.output.git.reason, /pre-existing git changes/);
  } finally {
    await fixture.cleanup();
  }
});

test("vault organize apply commits cleanly for filenames with spaces", async () => {
  const fixture = await makeFixture();
  try {
    await writeFile(join(fixture.vaultPath, "loose note.md"), "# Loose note\n", "utf8");
    spawnSync("git", ["-C", fixture.vaultPath, "-c", "init.defaultBranch=main", "init"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.email", "test@example.com"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "config", "user.name", "Test User"], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "add", "."], { encoding: "utf8" });
    spawnSync("git", ["-C", fixture.vaultPath, "commit", "-m", "init"], { encoding: "utf8" });

    const plan = runVaultOps(fixture.vaultPath, ["vault", "organize-plan"]);
    const run = runVaultOps(fixture.vaultPath, [
      "vault",
      "organize-apply",
      "--plan-token",
      plan.output.planToken,
      "--move",
      "loose note.md:작업기록/세션기록/loose note.md",
    ]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.git.committed, true);
  } finally {
    await fixture.cleanup();
  }
});

test("vault health-check reports missing managed artifacts", async () => {
  const fixture = await makeFixture();
  try {
    const statePath = join(fixture.vaultPath, ".oh-my-obsidian", "setup-state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.managedArtifacts.push({
      relativePath: "scripts/team-setup/README.md",
      kind: "file",
      planned: true,
      applied: true,
    });
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const run = runVaultOps(fixture.vaultPath, ["vault", "health-check"]);
    assert.equal(run.result.status, 0);
    assert.deepEqual(run.output.missingManagedArtifacts, ["scripts/team-setup/README.md"]);
  } finally {
    await fixture.cleanup();
  }
});

test("vault health-check surfaces failed setup status", async () => {
  const fixture = await makeFixture();
  try {
    const statePath = join(fixture.vaultPath, ".oh-my-obsidian", "setup-state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.status = "failed";
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const run = runVaultOps(fixture.vaultPath, ["vault", "health-check"]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.status, "needs-attention");
    assert.equal(run.output.setupStatus, "failed");
  } finally {
    await fixture.cleanup();
  }
});

test("session-save includes type field in frontmatter", async () => {
  const fixture = await makeFixture();
  try {
    const run = runVaultOps(fixture.vaultPath, [
      "session-save",
      "--topic",
      "Type Test",
      "--detail",
      "Testing type field.",
    ]);
    assert.equal(run.result.status, 0);
    assert.equal(run.output.type, "session-log");
    const notePath = join(fixture.vaultPath, run.output.relativePath);
    const note = await readFile(notePath, "utf8");
    assert.match(note, /^type: session-log$/m);
  } finally {
    await fixture.cleanup();
  }
});

test("session-save includes services and related_docs when provided", async () => {
  const fixture = await makeFixture();
  try {
    const run = runVaultOps(fixture.vaultPath, [
      "session-save",
      "--topic",
      "Service Test",
      "--detail",
      "Testing services.",
      "--service",
      "editor",
      "--service",
      "api",
      "--related-doc",
      "작업기록/의사결정/2026-04-24_arch-decision.md",
    ]);
    assert.equal(run.result.status, 0);
    const notePath = join(fixture.vaultPath, run.output.relativePath);
    const note = await readFile(notePath, "utf8");
    assert.match(note, /^services: \[editor, api\]$/m);
    assert.match(note, /^related_docs: \[작업기록\/의사결정\/2026-04-24_arch-decision\.md\]$/m);
  } finally {
    await fixture.cleanup();
  }
});

test("session-save generates wikilinks in 관련 문서 section", async () => {
  const fixture = await makeFixture();
  try {
    const run = runVaultOps(fixture.vaultPath, [
      "session-save",
      "--topic",
      "Wiki Test",
      "--detail",
      "Testing wikilinks.",
      "--related-doc",
      "작업기록/의사결정/2026-04-24_arch-decision.md",
    ]);
    assert.equal(run.result.status, 0);
    const notePath = join(fixture.vaultPath, run.output.relativePath);
    const note = await readFile(notePath, "utf8");
    assert.match(note, /\[\[2026-04-24_arch-decision\]\]/);
    assert.match(note, /## 관련 문서/);
  } finally {
    await fixture.cleanup();
  }
});

test("session-save auto-discovers related documents", async () => {
  const fixture = await makeFixture();
  try {
    await writeFile(
      join(fixture.vaultPath, "작업기록", "세션기록", "2026-04-20_oauth-setup.md"),
      "# OAuth Setup\nDetails about OAuth token flow implementation\n",
      "utf8"
    );
    const run = runVaultOps(fixture.vaultPath, [
      "session-save",
      "--topic",
      "OAuth token refresh",
      "--detail",
      "Adding token refresh logic.",
    ]);
    assert.equal(run.result.status, 0);
    const notePath = join(fixture.vaultPath, run.output.relativePath);
    const note = await readFile(notePath, "utf8");
    assert.match(note, /\[\[2026-04-20_oauth-setup\]\]/);
  } finally {
    await fixture.cleanup();
  }
});

test("recall returns type field when present in frontmatter", async () => {
  const fixture = await makeFixture();
  try {
    await writeFile(
      join(fixture.vaultPath, "작업기록", "의사결정", "2026-04-20_use-react.md"),
      "---\ntype: decision\ndate: 2026-04-20\n---\n# Use React\nDecision to use React\n",
      "utf8"
    );
    const run = runVaultOps(fixture.vaultPath, ["recall", "--query", "React"]);
    assert.equal(run.result.status, 0);
    const found = run.output.results.find((r) => r.path.includes("use-react"));
    assert.ok(found, "should find the decision note");
    assert.equal(found.type, "decision");
  } finally {
    await fixture.cleanup();
  }
});

test("recall works with old notes that lack type field", async () => {
  const fixture = await makeFixture();
  try {
    await writeFile(
      join(fixture.vaultPath, "작업기록", "세션기록", "2026-04-19_old-note.md"),
      "---\ndate: 2026-04-19\n---\n# Old Note\nLegacy note without type field\n",
      "utf8"
    );
    const run = runVaultOps(fixture.vaultPath, ["recall", "--query", "Legacy"]);
    assert.equal(run.result.status, 0);
    const found = run.output.results.find((r) => r.path.includes("old-note"));
    assert.ok(found, "should find old-format note");
    assert.equal(found.type, null);
  } finally {
    await fixture.cleanup();
  }
});

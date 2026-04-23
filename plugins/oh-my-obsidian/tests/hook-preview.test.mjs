import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const helperPath = join(process.cwd(), "plugins/oh-my-obsidian/scripts/hook-preview.mjs");
const hookScript = join(process.cwd(), "plugins/oh-my-obsidian/hooks-preview/stop-save-reminder.sh");

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "omob-hook-test-"));
  return {
    root,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

test("hook preview merge preserves existing Stop hooks and avoids duplicates", async () => {
  const fixture = await makeFixture();
  try {
    const repoRoot = join(fixture.root, "repo");
    await mkdir(join(repoRoot, ".codex"), { recursive: true });
    await writeFile(
      join(repoRoot, ".codex", "hooks.json"),
      JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    type: "command",
                    command: "/tmp/existing-stop.sh",
                    timeout: 5,
                  },
                ],
              },
            ],
          },
        },
        null,
        2
      ),
      "utf8"
    );

    let run = spawnSync(process.execPath, [helperPath, "plan", "--scope", "repo", "--repo-root", repoRoot], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    let output = JSON.parse(run.stdout);
    assert.equal(run.status, 0);
    assert.equal(output.nextConfig.hooks.Stop.length, 2);
    assert.equal(Array.isArray(output.skip), true);

    run = spawnSync(process.execPath, [helperPath, "apply", "--scope", "repo", "--repo-root", repoRoot], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    output = JSON.parse(run.stdout);
    assert.equal(run.status, 0);
    const appliedConfig = JSON.parse(await readFile(join(repoRoot, ".codex", "hooks.json"), "utf8"));
    assert.equal(appliedConfig.hooks.Stop.length, 2);

    run = spawnSync(process.execPath, [helperPath, "plan", "--scope", "repo", "--repo-root", repoRoot], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    output = JSON.parse(run.stdout);
    assert.equal(output.diff[0], "No hook changes required.");
  } finally {
    await fixture.cleanup();
  }
});

test("hook script returns noop json without vault and reminder json with valid setup", async () => {
  const fixture = await makeFixture();
  try {
    let run = spawnSync("bash", [hookScript], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env } });
    let output = JSON.parse(run.stdout);
    assert.equal(run.status, 0);
    assert.equal(output.continue, true);
    assert.equal(output.systemMessage, undefined);

    const vaultPath = join(fixture.root, "vault");
    await mkdir(join(vaultPath, ".oh-my-obsidian"), { recursive: true });
    await writeFile(
      join(vaultPath, ".oh-my-obsidian", "setup-state.json"),
      `${JSON.stringify(
        {
          schema: "oh-my-obsidian/setup-state/v1",
          status: "complete",
          vaultRealPath: vaultPath,
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    run = spawnSync("bash", [hookScript], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, OBSIDIAN_VAULT: vaultPath },
    });
    output = JSON.parse(run.stdout);
    assert.equal(run.status, 0);
    assert.equal(output.continue, true);
    assert.match(output.systemMessage, /session-save/);
  } finally {
    await fixture.cleanup();
  }
});

test("invalid hooks.json blocks plan and apply without overwrite", async () => {
  const fixture = await makeFixture();
  try {
    const repoRoot = join(fixture.root, "repo");
    await mkdir(join(repoRoot, ".codex"), { recursive: true });
    await writeFile(join(repoRoot, ".codex", "hooks.json"), "{invalid json\n", "utf8");

    let run = spawnSync(process.execPath, [helperPath, "plan", "--scope", "repo", "--repo-root", repoRoot], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    let output = JSON.parse(run.stdout);
    assert.equal(run.status, 1);
    assert.equal(output.status, "failed");
    assert.equal(Array.isArray(output.skip), true);

    run = spawnSync(process.execPath, [helperPath, "apply", "--scope", "repo", "--repo-root", repoRoot], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    output = JSON.parse(run.stdout);
    assert.equal(run.status, 1);
    assert.equal(await readFile(join(repoRoot, ".codex", "hooks.json"), "utf8"), "{invalid json\n");
  } finally {
    await fixture.cleanup();
  }
});

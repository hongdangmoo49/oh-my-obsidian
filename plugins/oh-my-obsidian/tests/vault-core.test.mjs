import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CODEX_CONFIG_CREATED_BY,
  CODEX_CONFIG_SCHEMA,
  SETUP_STATE_SCHEMA,
  codexConfigPath,
  normalizeVaultRelativePath,
  resolveSafeVaultTarget,
  validatePlannedVaultTarget,
  resolveVault,
  writeJsonAtomic,
} from "../scripts/vault-core.mjs";

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "omob-core-test-"));
  const home = join(root, "home");
  await mkdir(home, { recursive: true });
  return {
    root,
    home,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

test("normalizeVaultRelativePath rejects traversal and absolute paths", () => {
  assert.throws(() => normalizeVaultRelativePath("../escape"), /traversal/);
  assert.throws(() => normalizeVaultRelativePath("/absolute"), /absolute/);
  assert.throws(() => normalizeVaultRelativePath("bad\0path"), /NUL/);
  assert.equal(normalizeVaultRelativePath("작업기록/세션기록"), "작업기록/세션기록");
});

test("resolveSafeVaultTarget rejects symlink parent escape", async () => {
  const fixture = await makeFixture();
  try {
    const vaultRoot = join(fixture.root, "vault");
    const outside = join(fixture.root, "outside");
    await mkdir(vaultRoot, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(vaultRoot, "linked"));
    await assert.rejects(
      () => resolveSafeVaultTarget(vaultRoot, "linked/escape.md"),
      /escapes vault/
    );
  } finally {
    await fixture.cleanup();
  }
});

test("validatePlannedVaultTarget rejects missing-path symlink escape before writes", async () => {
  const fixture = await makeFixture();
  try {
    const vaultRoot = join(fixture.root, "vault");
    const outside = join(fixture.root, "outside");
    await mkdir(vaultRoot, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(vaultRoot, "linked"));
    await assert.rejects(
      () => validatePlannedVaultTarget(vaultRoot, "linked/new-folder/file.md"),
      /escapes vault/
    );
  } finally {
    await fixture.cleanup();
  }
});

test("resolveVault uses approved config pointer and rejects realpath mismatch", async () => {
  const fixture = await makeFixture();
  try {
    const vaultRoot = join(fixture.root, "vault");
    const stateDir = join(vaultRoot, ".oh-my-obsidian");
    await mkdir(stateDir, { recursive: true });
    const vaultRealPath = await realpath(vaultRoot);
    await writeJsonAtomic(join(stateDir, "setup-state.json"), {
      schema: SETUP_STATE_SCHEMA,
      status: "complete",
      vaultPath: vaultRoot,
      vaultRealPath,
    });
    await writeJsonAtomic(codexConfigPath(fixture.home), {
      schema: CODEX_CONFIG_SCHEMA,
      createdBy: CODEX_CONFIG_CREATED_BY,
      vaultPath: vaultRoot,
      approvedAt: new Date().toISOString(),
    });

    const resolved = await resolveVault({ env: {}, home: fixture.home });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.source, "codexConfigPointer");

    await writeJsonAtomic(join(stateDir, "setup-state.json"), {
      schema: SETUP_STATE_SCHEMA,
      status: "complete",
      vaultPath: vaultRoot,
      vaultRealPath: join(fixture.root, "different"),
    });
    const mismatch = await resolveVault({ env: {}, home: fixture.home });
    assert.equal(mismatch.ok, false);
    assert.match(mismatch.issues.join("\n"), /vaultRealPath/);
  } finally {
    await fixture.cleanup();
  }
});

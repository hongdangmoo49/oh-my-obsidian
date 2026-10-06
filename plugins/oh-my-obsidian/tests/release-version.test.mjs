import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PLUGIN_VERSION } from "../scripts/vault-core.mjs";

test("Claude and Codex release manifests match the runtime version", async () => {
  const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  const claude = await json("../../../.claude-plugin/plugin.json");
  const codex = await json("../.codex-plugin/plugin.json");
  const marketplace = await json("../../../.claude-plugin/marketplace.json");
  assert.match(PLUGIN_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(claude.version, PLUGIN_VERSION);
  assert.equal(codex.version, PLUGIN_VERSION);
  assert.equal(marketplace.plugins.find((plugin) => plugin.name === "oh-my-obsidian").version, PLUGIN_VERSION);
});

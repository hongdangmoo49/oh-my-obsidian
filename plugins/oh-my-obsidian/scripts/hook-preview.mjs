#!/usr/bin/env node
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathExists, readJsonObjectIfExists, writeJsonAtomic } from "./vault-core.mjs";

const args = parseArgs(process.argv.slice(2));
const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");

main().catch((error) => {
  printJson({
    status: "failed",
    action: args.action || "unknown",
    issues: [error.message],
  });
  process.exit(1);
});

async function main() {
  if (process.platform === "win32") {
    printJson({
      status: "failed",
      action: args.action,
      issues: ["hook preview is unsupported on Windows"],
    });
    process.exit(1);
  }
  if (!["plan", "apply"].includes(args.action)) {
    throw new Error(`unknown action: ${args.action || ""}`);
  }

  const preview = await buildPreview();
  if (args.action === "plan") {
    printJson(preview);
    process.exit(preview.status === "failed" ? 1 : 0);
    return;
  }
  if (preview.status === "failed") {
    printJson(preview);
    process.exit(1);
  }

  await mkdir(dirname(preview.installPath), { recursive: true });
  await copyFile(join(pluginRoot, "hooks-preview", "stop-save-reminder.sh"), preview.installPath);
  await chmod(preview.installPath, 0o755);
  await mkdir(dirname(preview.hooksConfigPath), { recursive: true });
  await writeJsonAtomic(preview.hooksConfigPath, preview.nextConfig);
  printJson({
    ...preview,
    status: "applied",
  });
}

function parseArgs(argv) {
  const parsed = {
    action: argv[0] || "plan",
    scope: "home",
    repoRoot: process.cwd(),
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scope") parsed.scope = argv[++index] || "home";
    else if (arg === "--repo-root") parsed.repoRoot = argv[++index] || parsed.repoRoot;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return parsed;
}

async function buildPreview() {
  const installBase =
    args.scope === "repo"
      ? join(resolve(args.repoRoot), ".codex", "hooks", "oh-my-obsidian")
      : join(homedir(), ".codex", "hooks", "oh-my-obsidian");
  const installPath = join(installBase, "stop-save-reminder.sh");
  const hooksConfigPath =
    args.scope === "repo"
      ? join(resolve(args.repoRoot), ".codex", "hooks.json")
      : join(homedir(), ".codex", "hooks.json");

  const issues = [];
  const currentConfig = (await readJsonObjectIfExists(hooksConfigPath, "hooks.json", issues, false)) || { hooks: {} };
  if (issues.length > 0) {
    return {
      status: "failed",
      action: args.action,
      scope: args.scope,
      installPath,
      hooksConfigPath,
      issues,
      skip: [
        "Leave the current hooks configuration unchanged.",
        "Fix hooks.json manually before retrying hook preview opt-in.",
      ],
    };
  }
  if (currentConfig.hooks && (Array.isArray(currentConfig.hooks) || typeof currentConfig.hooks !== "object")) {
    return {
      status: "failed",
      action: args.action,
      scope: args.scope,
      installPath,
      hooksConfigPath,
      issues: ["hooks.json must contain an object-valued hooks property"],
      skip: [
        "Leave the current hooks configuration unchanged.",
        "Fix hooks.json manually before retrying hook preview opt-in.",
      ],
    };
  }
  if (
    currentConfig.hooks &&
    currentConfig.hooks.Stop !== undefined &&
    !Array.isArray(currentConfig.hooks.Stop)
  ) {
    return {
      status: "failed",
      action: args.action,
      scope: args.scope,
      installPath,
      hooksConfigPath,
      issues: ["hooks.Stop must be an array when present"],
      skip: [
        "Leave the current hooks configuration unchanged.",
        "Fix hooks.json manually before retrying hook preview opt-in.",
      ],
    };
  }
  const nextConfig = mergeHooksConfig(currentConfig, installPath);
  return {
    status: "planned",
    action: args.action,
    scope: args.scope,
    installPath,
    hooksConfigPath,
    nextConfig,
    diff: describeDiff(currentConfig, nextConfig, installPath),
    rollback: [
      `Remove ${installPath}`,
      `Remove the added Stop hook command from ${hooksConfigPath}`,
    ],
    skip: [
      "Do not install the hook preview.",
      "Leave existing hook files and hooks.json unchanged.",
    ],
  };
}

function mergeHooksConfig(currentConfig, installPath) {
  const next = JSON.parse(JSON.stringify(currentConfig || { hooks: {} }));
  if (!next.hooks || typeof next.hooks !== "object" || Array.isArray(next.hooks)) {
    next.hooks = {};
  }
  if (!Array.isArray(next.hooks.Stop)) {
    next.hooks.Stop = [];
  }
  const existingCommands = next.hooks.Stop.flatMap((entry) =>
    Array.isArray(entry?.hooks) ? entry.hooks.map((hook) => hook.command) : []
  );
  if (!existingCommands.includes(installPath)) {
    next.hooks.Stop.push({
      hooks: [
        {
          type: "command",
          command: installPath,
          timeout: 5,
        },
      ],
    });
  }
  return next;
}

function describeDiff(currentConfig, nextConfig, installPath) {
  const currentCommands = new Set(
    ((currentConfig?.hooks?.Stop) || []).flatMap((entry) =>
      Array.isArray(entry?.hooks) ? entry.hooks.map((hook) => hook.command) : []
    )
  );
  const diff = [];
  if (!currentCommands.has(installPath)) {
    diff.push(`+ add Stop hook command ${installPath}`);
  }
  if (diff.length === 0) {
    diff.push("No hook changes required.");
  }
  return diff;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

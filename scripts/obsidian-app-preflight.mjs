#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const action = process.argv[2] || "check";
const vaultPath = process.argv[3] || "";
const scriptDir = dirname(fileURLToPath(import.meta.url));

const isWindows = process.platform === "win32";
const command = isWindows ? "powershell.exe" : "bash";
const args = isWindows
  ? [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(scriptDir, "obsidian-app-preflight.ps1"),
      "-Action",
      action,
    ]
  : [join(scriptDir, "obsidian-app-preflight.sh"), action];

if (vaultPath) {
  if (isWindows) {
    args.push("-VaultPath", vaultPath);
  } else {
    args.push(vaultPath);
  }
}

const result = spawnSync(command, args, { stdio: "inherit" });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

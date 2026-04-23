#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { get } from "node:https";

const SCHEMA = "oh-my-obsidian/obsidian-git-setup/v1";
const PLUGIN_ID = "obsidian-git";
const RELEASE_API =
  "https://api.github.com/repos/Vinzent03/obsidian-git/releases/latest";
const DEFAULT_COMMIT_MESSAGE = "vault backup: {{date}}";

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  printJson({
    schema: SCHEMA,
    action: args.action || "unknown",
    status: "blocked",
    issues: [error.message],
  });
  process.exit(1);
});

async function main() {
  if (!["check", "apply", "validate"].includes(args.action)) {
    throw new Error(`Unknown action: ${args.action || ""}`);
  }

  const vaultPath = args.vaultPath ? resolve(args.vaultPath) : "";
  if (!vaultPath) {
    printJson(await buildState(args.action, "", ["vault path is required"]));
    process.exit(1);
  }

  if (args.action === "check" || args.action === "validate") {
    const state = await buildState(args.action, vaultPath);
    printJson(state);
    process.exit(state.status === "blocked" ? 1 : 0);
  }

  const state = await applySetup(vaultPath);
  printJson(state);
  process.exit(state.status === "blocked" ? 1 : 0);
}

function parseArgs(argv) {
  const parsed = {
    action: argv[0] || "check",
    vaultPath: argv[1] || "",
    preset: "safe",
    presetExplicit: false,
    enable: false,
    enableExplicit: false,
    reconcile: false,
    interval: 10,
    intervalExplicit: false,
    sourceZip: process.env.OH_MY_OBSIDIAN_OBSIDIAN_GIT_ZIP || "",
    version: process.env.OH_MY_OBSIDIAN_OBSIDIAN_GIT_VERSION || "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--enable") {
      parsed.enable = true;
      parsed.enableExplicit = true;
    } else if (arg === "--reconcile") {
      parsed.reconcile = true;
    } else if (arg === "--preset") {
      parsed.preset = argv[++index] || "";
      parsed.presetExplicit = true;
    } else if (arg === "--interval") {
      parsed.interval = Number(argv[++index] || "10");
      parsed.intervalExplicit = true;
    } else if (arg === "--source-zip") {
      parsed.sourceZip = argv[++index] || "";
    } else if (arg === "--version") {
      parsed.version = argv[++index] || "";
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

async function applySetup(vaultPath) {
  const issues = [];
  const preState = await buildState("apply", vaultPath);
  const setupState = await readSetupStateIfExists(vaultPath);
  const effectivePreset = args.presetExplicit
    ? args.preset
    : preState.plugin.effectivePreset || setupState?.obsidianGit?.preset || args.preset;
  const effectiveInterval =
    effectivePreset === "team-sync"
      ? args.intervalExplicit
        ? args.interval
        : Number(setupState?.obsidianGit?.interval || args.interval || 10)
      : 0;
  const effectiveEnable = args.enableExplicit
    ? args.enable
    : preState.plugin.enabledInVault;

  if (!preState.vault.exists) {
    return await buildState("apply", vaultPath, ["vault path does not exist"]);
  }

  if (effectivePreset === "team-sync") {
    if (!effectiveEnable) {
      issues.push("team-sync requires --enable");
    }
    if (!preState.git.available) {
      issues.push("team-sync requires git");
    }
    if (!preState.vault.isGitRepo) {
      issues.push("team-sync requires a git repository");
    }
    if (!preState.git.remoteConfigured) {
      issues.push("team-sync requires a git remote");
    }
    if (!preState.git.upstreamConfigured) {
      issues.push("team-sync requires an upstream tracking branch");
    }
  }

  const preset = buildPreset(effectivePreset, effectiveInterval);
  if (!preset) {
    issues.push(`unknown preset: ${effectivePreset}`);
  }

  const pluginDir = join(vaultPath, ".obsidian", "plugins", PLUGIN_ID);
  const dataPath = join(pluginDir, "data.json");
  const communityPluginsPath = join(vaultPath, ".obsidian", "community-plugins.json");

  const existingData = await readJsonObjectIfExists(dataPath, "obsidian-git data.json", issues);
  let existingCommunity = null;
  if (effectiveEnable) {
    existingCommunity = await readJsonArrayIfExists(
      communityPluginsPath,
      "community-plugins.json",
      issues
    );
  }

  const pluginAlreadyManaged =
    (await pathExists(join(pluginDir, "manifest.json"))) ||
    (await pathExists(join(pluginDir, "main.js"))) ||
    (await pathExists(join(pluginDir, "styles.css"))) ||
    (await pathExists(dataPath));
  if (pluginAlreadyManaged && !args.reconcile) {
    issues.push("existing Obsidian Git files or settings require explicit reconcile approval");
  }

  if (issues.length > 0) {
    return await buildState("apply", vaultPath, issues);
  }

  try {
    await validateSetupStateForVault(vaultPath);
    await validateVaultWriteTarget(vaultPath, ".obsidian/plugins/obsidian-git/manifest.json");
    await validateVaultWriteTarget(vaultPath, ".obsidian/plugins/obsidian-git/data.json");
    await validateVaultWriteTarget(vaultPath, ".obsidian/community-plugins.json");
  } catch (error) {
    return await buildState("apply", vaultPath, [error.message]);
  }

  const release = await resolveRelease(args.sourceZip, args.version);
  const tempDir = await mkdtemp(join(tmpdir(), "oh-my-obsidian-git-"));
  try {
    const zipPath = await materializeZip(release.zipUrl, tempDir);
    const extractedDir = await extractAndValidateZip(zipPath, tempDir, release.version);

    await mkdir(pluginDir, { recursive: true });
    await copyFile(join(extractedDir, "manifest.json"), join(pluginDir, "manifest.json"));
    await copyFile(join(extractedDir, "main.js"), join(pluginDir, "main.js"));
    await copyFile(join(extractedDir, "styles.css"), join(pluginDir, "styles.css"));

    const nextData = { ...existingData, ...preset };
    await writeJsonAtomic(dataPath, nextData);

    if (effectiveEnable) {
      const nextCommunity = Array.isArray(existingCommunity) ? [...existingCommunity] : [];
      if (!nextCommunity.includes(PLUGIN_ID)) {
        nextCommunity.push(PLUGIN_ID);
      }
      await writeJsonAtomic(communityPluginsPath, nextCommunity);
    }

    await updateSetupState(vaultPath, {
      choice: effectivePreset,
      installed: true,
      version: release.version,
      source: release.zipUrl,
      enabled: effectiveEnable ? true : preState.plugin.enabledInVault,
      preset: effectivePreset,
      status:
        effectivePreset === "team-sync"
          ? "enabled-team-sync"
          : effectivePreset === "manual"
            ? (effectiveEnable ? "enabled-manual" : "needs-user-action")
            : "installed-disabled",
      interval: effectivePreset === "team-sync" ? effectiveInterval : 0,
      installedAt: new Date().toISOString(),
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  return await buildState("apply", vaultPath);
}

function buildPreset(preset, interval) {
  if (preset === "safe" || preset === "manual") {
    return {
      differentIntervalCommitAndPush: false,
      autoSaveInterval: 0,
      autoPullInterval: 0,
      autoPushInterval: 0,
      autoPullOnBoot: false,
      disablePush: true,
      pullBeforePush: true,
      disablePopupsForNoChanges: false,
      commitMessage: DEFAULT_COMMIT_MESSAGE,
      autoCommitMessage: DEFAULT_COMMIT_MESSAGE,
    };
  }

  if (preset === "team-sync") {
    const minutes = Number.isFinite(interval) && interval > 0 ? interval : 10;
    return {
      differentIntervalCommitAndPush: true,
      autoSaveInterval: minutes,
      autoPullInterval: minutes,
      autoPushInterval: minutes,
      autoPullOnBoot: true,
      disablePush: false,
      pullBeforePush: true,
      commitMessage: DEFAULT_COMMIT_MESSAGE,
      autoCommitMessage: DEFAULT_COMMIT_MESSAGE,
      disablePopupsForNoChanges: true,
    };
  }

  return null;
}

async function resolveRelease(sourceZip, expectedVersion) {
  if (sourceZip) {
    return {
      version: expectedVersion || "fixture",
      zipUrl: sourceZip,
    };
  }

  const release = await getJson(RELEASE_API);
  const zipAsset = release.assets?.find((asset) =>
    /^obsidian-git-[0-9.]+\.zip$/.test(asset.name)
  );
  if (!zipAsset) {
    throw new Error("Could not find obsidian-git release zip asset");
  }

  return {
    version: String(release.tag_name || release.name || "").replace(/^v/, ""),
    zipUrl: zipAsset.browser_download_url,
  };
}

async function materializeZip(zipUrl, tempDir) {
  if (!/^https?:\/\//.test(zipUrl)) {
    const localPath = resolve(zipUrl);
    await access(localPath);
    return localPath;
  }

  const target = join(tempDir, basename(new URL(zipUrl).pathname) || "obsidian-git.zip");
  await download(zipUrl, target);
  return target;
}

async function extractAndValidateZip(zipPath, tempDir, expectedVersion) {
  const extractDir = join(tempDir, "extract");
  await mkdir(extractDir, { recursive: true });

  const unzip = spawnSync("unzip", ["-q", zipPath, "-d", extractDir], {
    encoding: "utf8",
  });
  if (unzip.status !== 0) {
    throw new Error(`unzip failed: ${unzip.stderr || unzip.stdout}`);
  }

  const pluginDir = join(extractDir, PLUGIN_ID);
  const manifestPath = join(pluginDir, "manifest.json");
  const mainPath = join(pluginDir, "main.js");
  const stylesPath = join(pluginDir, "styles.css");

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.id !== PLUGIN_ID) {
    throw new Error(`Unexpected plugin id: ${manifest.id || ""}`);
  }
  if (expectedVersion && expectedVersion !== "fixture" && manifest.version !== expectedVersion) {
    throw new Error(
      `Plugin version mismatch: expected ${expectedVersion}, got ${manifest.version || ""}`
    );
  }
  if (!(await fileIsNonEmpty(mainPath))) {
    throw new Error("main.js is missing or empty");
  }
  await access(stylesPath);

  return pluginDir;
}

async function buildState(action, vaultPath, extraIssues = []) {
  const issues = [...extraIssues];
  const vaultExists = vaultPath ? await pathExists(vaultPath) : false;
  if (!vaultExists) {
    issues.push("vault path does not exist");
  }
  const gitState = detectGitState();
  const gitAvailable = gitState.status === "usable";
  const gitVersion = gitState.version || "";
  const gitMeetsMinimum = gitAvailable ? compareGitVersion(gitVersion, "2.29.0") >= 0 : false;
  const isGitRepo =
    vaultExists && gitAvailable
      ? run("git", ["-C", vaultPath, "rev-parse", "--is-inside-work-tree"]).status === 0
      : false;
  const remoteConfigured =
    isGitRepo && run("git", ["-C", vaultPath, "remote"]).stdout.trim().length > 0;
  const branch = isGitRepo
    ? run("git", ["-C", vaultPath, "branch", "--show-current"]).stdout.trim()
    : "";
  const upstreamResult = isGitRepo
    ? run("git", ["-C", vaultPath, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
    : { status: 1, stdout: "" };
  const upstreamConfigured = upstreamResult.status === 0;

  const pluginDir = vaultPath ? join(vaultPath, ".obsidian", "plugins", PLUGIN_ID) : "";
  const manifestPath = join(pluginDir, "manifest.json");
  const mainPath = join(pluginDir, "main.js");
  const stylesPath = join(pluginDir, "styles.css");
  const dataPath = join(pluginDir, "data.json");
  const communityPluginsPath = vaultPath
    ? join(vaultPath, ".obsidian", "community-plugins.json")
    : "";

  const manifest = (await readJsonObjectIfExists(manifestPath, "manifest.json", issues, false)) || {};
  const dataExists = await pathExists(dataPath);
  const data = dataExists
    ? (await readJsonObjectIfExists(dataPath, "data.json", issues, false)) || null
    : null;
  const community =
    (await readJsonArrayIfExists(communityPluginsPath, "community-plugins.json", issues, false)) ||
    [];

  const installed =
    manifest.id === PLUGIN_ID &&
    (await fileIsNonEmpty(mainPath)) &&
    (await pathExists(stylesPath));

  const setupState = vaultExists ? await readSetupStateIfExists(vaultPath) : null;
  const persistedPreset =
    setupState?.obsidianGit?.preset || setupState?.obsidianGit?.choice || "";
  const effectivePreset = args.presetExplicit ? args.preset : persistedPreset || args.preset;
  const expectsEnabled = args.enableExplicit
    ? args.enable
    : effectivePreset === "manual" || effectivePreset === "team-sync";

  if (action === "validate") {
    if (!gitAvailable) issues.push(gitState.issue || "git is not available");
    if (gitAvailable && !gitMeetsMinimum) issues.push("git version is below 2.29");
    if (!installed) issues.push("obsidian-git is not installed");
  }

  const enabledInVault = community.includes(PLUGIN_ID);
  let status = "ready";
  if (issues.length > 0) {
    status = "blocked";
  } else if ((effectivePreset === "manual" || effectivePreset === "team-sync") && !enabledInVault) {
    status = "needs-user-action";
  } else if (effectivePreset === "team-sync" && (!upstreamConfigured || !remoteConfigured)) {
    status = "needs-user-action";
  }

  return {
    schema: SCHEMA,
    action,
    vault: {
      path: vaultPath,
      exists: vaultExists,
      isGitRepo,
    },
    git: {
      available: gitAvailable,
      status: gitState.status,
      version: gitVersion,
      meetsMinimumVersion: gitMeetsMinimum,
      remoteConfigured,
      branch,
      upstreamConfigured,
      upstream: upstreamConfigured ? upstreamResult.stdout.trim() : "",
      issue: gitState.issue || "",
      fixCommand: gitState.fixCommand || "",
      developerToolsPath: gitState.developerToolsPath || "",
    },
    plugin: {
      id: PLUGIN_ID,
      installed,
      installedVersion: manifest.version || "",
      enabledInVault,
      effectivePreset,
      expectsEnabled,
      files: {
        manifest: await pathExists(manifestPath),
        main: await fileIsNonEmpty(mainPath),
        styles: await pathExists(stylesPath),
        data: data !== null,
      },
    },
    status,
    issues,
    recommendations: buildRecommendations({
      installed,
      enabledInVault,
      remoteConfigured,
      upstreamConfigured,
      effectivePreset,
      expectsEnabled,
    }),
  };
}

function buildRecommendations({
  installed,
  enabledInVault,
  remoteConfigured,
  upstreamConfigured,
  effectivePreset,
  expectsEnabled,
}) {
  const recommendations = [];
  if (!installed) {
    recommendations.push("Run obsidian-git-setup apply <vault> --preset safe");
  }
  if (installed && !enabledInVault && expectsEnabled) {
    recommendations.push("Enable Obsidian Git with --enable or in Obsidian community plugin settings");
  }
  if (effectivePreset === "team-sync" && !remoteConfigured) {
    recommendations.push("Configure a git remote before enabling team-sync");
  }
  if (effectivePreset === "team-sync" && !upstreamConfigured) {
    recommendations.push("Set an upstream tracking branch before enabling team-sync");
  }
  recommendations.push("Open Obsidian and approve community plugins if prompted");
  return recommendations;
}

async function validateSetupStateForVault(vaultPath) {
  const stateDir = join(vaultPath, ".oh-my-obsidian");
  const statePath = join(stateDir, "setup-state.json");
  const issues = [];
  const existing = await readJsonObjectIfExists(statePath, "setup-state.json", issues, true);
  if (!existing || issues.length > 0 || existing.schema !== "oh-my-obsidian/setup-state/v1") {
    throw new Error("valid setup-state.json is required before Obsidian Git apply");
  }
  const vaultRealPath = await realpath(vaultPath);
  if (existing.vaultRealPath !== vaultRealPath) {
    throw new Error("setup-state vaultRealPath does not match the target vault");
  }
  return existing;
}

async function updateSetupState(vaultPath, obsidianGit) {
  const statePath = join(vaultPath, ".oh-my-obsidian", "setup-state.json");
  const existing = await validateSetupStateForVault(vaultPath);
  await writeJsonAtomic(statePath, {
    ...existing,
    updatedAt: new Date().toISOString(),
    obsidianGit: {
      ...existing.obsidianGit,
      choice: obsidianGit.choice ?? existing.obsidianGit?.choice ?? "",
      preset: obsidianGit.preset,
      status: obsidianGit.status ?? existing.obsidianGit?.status ?? "",
      installed: obsidianGit.installed,
      enabled: obsidianGit.enabled,
      version: obsidianGit.version,
      source: obsidianGit.source,
      interval: obsidianGit.interval,
      installedAt: obsidianGit.installedAt,
    },
  });
}

async function readSetupStateIfExists(vaultPath) {
  const issues = [];
  const state = await readJsonObjectIfExists(
    join(vaultPath, ".oh-my-obsidian", "setup-state.json"),
    "setup-state.json",
    issues,
    false
  );
  if (!state || issues.length > 0) return null;
  return state;
}

async function validateVaultWriteTarget(vaultPath, relativePath) {
  const vaultRealPath = await realpath(vaultPath);
  const segments = relativePath.split("/").filter(Boolean);
  let currentPath = vaultPath;
  for (let index = 0; index < segments.length - 1; index += 1) {
    currentPath = join(currentPath, segments[index]);
    if (await pathExists(currentPath)) {
      const currentRealPath = await realpath(currentPath);
      const rel = relative(vaultRealPath, currentRealPath);
      if (rel !== "" && (rel.startsWith("..") || rel.startsWith("../"))) {
        throw new Error(`write target escapes vault: ${relativePath}`);
      }
    }
  }
}

async function readJsonObjectIfExists(path, label, issues, required = false) {
  if (!(await pathExists(path))) {
    if (required) issues.push(`${label} is missing`);
    return {};
  }

  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") {
      issues.push(`${label} must be a JSON object`);
      return {};
    }
    return value;
  } catch (error) {
    issues.push(`${label} is invalid JSON: ${error.message}`);
    return {};
  }
}

async function readJsonArrayIfExists(path, label, issues, required = false) {
  if (!(await pathExists(path))) {
    if (required) issues.push(`${label} is missing`);
    return [];
  }

  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(value)) {
      issues.push(`${label} must be a JSON array`);
      return [];
    }
    return value;
  } catch (error) {
    issues.push(`${label} is invalid JSON: ${error.message}`);
    return [];
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

async function getJson(url) {
  return JSON.parse(await getText(url));
}

async function getText(url) {
  return new Promise((resolvePromise, reject) => {
    get(url, { headers: { "User-Agent": "oh-my-obsidian" } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        getText(new URL(response.headers.location, url).toString()).then(resolvePromise, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`GET ${url} failed with ${response.statusCode}`));
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolvePromise(body));
    }).on("error", reject);
  });
}

async function download(url, target) {
  await new Promise((resolvePromise, reject) => {
    const file = createWriteStream(target);
    get(url, { headers: { "User-Agent": "oh-my-obsidian" } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        download(new URL(response.headers.location, url).toString(), target).then(resolvePromise, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download ${url} failed with ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close(resolvePromise);
      });
    }).on("error", reject);
  });
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8" });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function commandExists(command) {
  if (command === "git") {
    return detectGitState().status === "usable";
  }
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

function detectGitState() {
  const versionResult = run("git", ["--version"]);
  const state = {
    status: versionResult.status === 0 ? "usable" : "missing",
    version: versionResult.status === 0 ? versionResult.stdout.trim().replace(/^git version\s+/, "") : "",
    issue: versionResult.status === 0 ? "" : "git is not available",
    fixCommand: "",
    developerToolsPath: "",
  };

  if (runtimePlatform() !== "darwin") {
    return state;
  }

  const xcodeSelectResult = run("xcode-select", ["-p"]);
  if (xcodeSelectResult.status === 0) {
    state.developerToolsPath = xcodeSelectResult.stdout.trim();
  }

  const systemGitResult = run(systemGitPath(), ["--version"]);
  const systemGitOutput = `${systemGitResult.stderr}${systemGitResult.stdout}`.trim();
  if (systemGitResult.status !== 0 && /invalid active developer path|xcrun/i.test(systemGitOutput)) {
    return {
      ...state,
      status: "broken-path",
      issue: "macOS Command Line Tools path is broken; git-related setup cannot run reliably",
      fixCommand: "xcode-select --install",
    };
  }

  if (state.status !== "usable") {
    return state;
  }

  if (systemGitResult.status !== 0) {
    return {
      ...state,
      status: "broken-path",
      issue: "macOS system git is unusable; fix Command Line Tools before git-related setup",
      fixCommand: "xcode-select --install",
    };
  }

  return state;
}

function systemGitPath() {
  return process.env.OH_MY_OBSIDIAN_SYSTEM_GIT_PATH || "/usr/bin/git";
}

function runtimePlatform() {
  return String(process.env.OH_MY_OBSIDIAN_TEST_PLATFORM || process.platform).toLowerCase();
}

function compareGitVersion(actual, minimum) {
  const actualParts = actual.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const minimumParts = minimum.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(actualParts.length, minimumParts.length); index += 1) {
    const a = actualParts[index] || 0;
    const b = minimumParts[index] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fileIsNonEmpty(path) {
  try {
    const fileStat = await stat(path);
    return fileStat.isFile() && fileStat.size > 0;
  } catch {
    return false;
  }
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

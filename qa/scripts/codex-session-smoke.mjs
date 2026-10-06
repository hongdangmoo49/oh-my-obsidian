import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { contentHash } from "../../plugins/oh-my-obsidian/scripts/vault-core.mjs";
import { verifyAutoReceipt } from "../../plugins/oh-my-obsidian/scripts/auto-session-recovery.mjs";
import { assertSafeAutoContent } from "../../plugins/oh-my-obsidian/scripts/auto-session-safety.mjs";

const cli = process.argv[2];
const model = process.argv[3];
if (!cli) throw new Error("usage: node qa/scripts/codex-session-smoke.mjs <native-codex-binary> [model]");
const repo = resolve(import.meta.dirname, "../..");
const root = await mkdtemp(join(tmpdir(), "omob-live-smoke-"));
const project = join(root, "repo");
const vault = join(root, "vault");
let child;
let timer;
try {
  await mkdir(project);
  await mkdir(join(vault, ".oh-my-obsidian"), { recursive: true });
  assert.equal(spawnSync("git", ["-C", project, "init"], { encoding: "utf8", windowsHide: true }).status, 0);
  await writeFile(join(vault, ".oh-my-obsidian/setup-state.json"), JSON.stringify({
    schema: "oh-my-obsidian/setup-state/v1", status: "complete", projectName: "Smoke Test",
    vaultRealPath: await realpath(vault), vaultPath: vault, knowledgeDomains: ["Tools", "Testing"], managedArtifacts: [],
  }));
  const install = spawnSync(process.execPath, [join(repo, "plugins/oh-my-obsidian/scripts/codex-hooks.mjs"),
    "apply", "--repo-root", project, "--vault", vault], { encoding: "utf8", windowsHide: true });
  assert.equal(install.status, 0, "fixture hook installation failed");
  const prompt = "Create smoke-result.txt in the current repository containing exactly SMOKE_OK and a newline. Do not change any other repositories. Other changes must be limited to the installed session-save instructions and the supplied temporary vault. Do not commit or push. Finish with one short Korean completion sentence.";
  const args = ["exec", "--ignore-user-config", "--ephemeral", "--json", "--color", "never",
    "--enable", "hooks", "--dangerously-bypass-hook-trust", "--add-dir", vault,
    "-c", 'default_permissions=":workspace"', "-c", 'approval_policy="never"',
    "--cd", project, "-c", 'model_reasoning_effort="low"',
    "-c", `projects.${JSON.stringify(project)}.trust_level="trusted"`, ...(model ? ["--model", model] : []), prompt];
  // Only fixture hooks installed from this repository are trusted for this invocation.
  child = spawn(cli, args, { cwd: project, windowsHide: true, env: { ...process.env, OBSIDIAN_VAULT: vault }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderrBytes = 0;
  let timedOut = false;
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderrBytes += chunk.length; });
  timer = setTimeout(() => {
    timedOut = true;
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    else child.kill("SIGTERM");
  }, 180000);
  const exitCode = await new Promise((resolveRun, reject) => { child.once("error", reject); child.once("close", resolveRun); });
  clearTimeout(timer);
  const events = stdout.split(/\r?\n/).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  const sessionId = events.find((event) => event.type === "thread.started")?.thread_id;
  if (exitCode !== 0 || timedOut) throw new Error(`Codex fresh-session smoke failed: exit=${exitCode}, timeout=${timedOut}, stderrBytes=${stderrBytes}, events=${events.map((event) => event.type).join(",")}`);
  assert.ok(sessionId, "CLI did not report a fresh thread id");
  let taskResult;
  try { taskResult = await readFile(join(project, "smoke-result.txt"), "utf8"); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    const last = events.filter((event) => event.item?.type === "agent_message").at(-1)?.item?.text || "no final message";
    let safeMessage = last.slice(0, 1500);
    try { assertSafeAutoContent([safeMessage]); } catch { safeMessage = "diagnostic message withheld by safety scan"; }
    throw new Error(`CLI did not create the requested file; final=${safeMessage}; eventTypes=${events.map((event) => event.type).join(",")}`);
  }
  assert.equal(taskResult.trim(), "SMOKE_OK");
  const key = contentHash(sessionId);
  const statePath = join(vault, ".oh-my-obsidian/auto-sessions", `${key}.json`);
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const receipt = JSON.parse(await readFile(`${statePath}.receipt`, "utf8"));
  assert.ok(["saved", "unchanged"].includes(receipt.status), "a substantive task must not be marked skipped");
  const verified = await verifyAutoReceipt(vault, sessionId, receipt.turnId);
  assert.equal(verified.verified, true);
  assert.equal((await readdir(join(vault, ".oh-my-obsidian/auto-sessions"))).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).length, 1);
  const note = await readFile(join(vault, state.relativePath), "utf8");
  assert.match(note, /## Summary/);
  assert.match(note, /## Decisions/);
  assert.match(note, /## Next Steps/);
  console.log(JSON.stringify({ status: "ok", freshThread: true, sessionId, receiptVerified: true, oneSessionNote: true, cliTaskCompleted: true }, null, 2));
} finally {
  clearTimeout(timer);
  if (child && child.exitCode === null && child.signalCode === null) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    else child.kill("SIGTERM");
  }
  const rel = relative(tmpdir(), root);
  assert.ok(rel.startsWith("omob-live-smoke-") && !rel.includes(".."));
  await rm(root, { recursive: true, force: true });
}

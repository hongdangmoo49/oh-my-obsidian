import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { contentHash } from "../../plugins/oh-my-obsidian/scripts/vault-core.mjs";
import { verifyAutoReceipt } from "../../plugins/oh-my-obsidian/scripts/auto-session-recovery.mjs";
import { assertSafeAutoContent } from "../../plugins/oh-my-obsidian/scripts/auto-session-safety.mjs";

const cli = process.argv[2];
if (!cli) throw new Error("usage: node qa/scripts/claude-session-smoke.mjs <claude-binary>");
const repo = resolve(import.meta.dirname, "../..");
const root = await mkdtemp(join(repo, ".omob-claude-smoke-"));
const project = join(root, "repo");
const home = join(root, "migration-home");
const vault = join(root, "vault");
const id = randomUUID();
let child;
let timer;
try {
  await mkdir(project);
  await mkdir(home);
  await mkdir(vault);
  assert.equal(spawnSync("git", ["-C", project, "init"], { windowsHide: true }).status, 0);
  const migrated = spawnSync(process.execPath, [join(repo, "scripts/claude-auto-save.mjs"), "apply", "--vault", vault, "--home", home, "--attach-legacy"], { encoding: "utf8", windowsHide: true });
  assert.equal(migrated.status, 0, "fixture migration failed");
  await mkdir(join(project, ".claude"));
  await copyFile(join(home, ".claude/oh-my-obsidian.local.json"), join(project, ".claude/oh-my-obsidian.local.json"));
  const prompt = "Create smoke-result.txt in the current repository containing exactly CLAUDE_SMOKE_OK and a newline. This is the only requested code change. Follow installed automatic summary instructions for the supplied temporary vault. Do not touch other repositories or commit/push. Finish with one short Korean sentence.";
  child = spawn(cli, ["--print", prompt, "--session-id", id, "--plugin-dir", repo, "--setting-sources", "",
    "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--no-session-persistence", "--no-chrome",
    "--permission-mode", "acceptEdits", "--allowedTools", "Read,Write,Edit,Bash(node *)",
    "--max-budget-usd", "1", "--output-format", "stream-json", "--verbose", "--include-hook-events"],
  { cwd: project, env: { ...process.env, OBSIDIAN_VAULT: vault }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderrBytes = 0;
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderrBytes += chunk.length; });
  timer = setTimeout(() => {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    else child.kill("SIGTERM");
  }, 180000);
  const exit = await new Promise((resolveRun, reject) => { child.once("close", resolveRun); child.once("error", reject); });
  clearTimeout(timer);
  const events = stdout.split(/\r?\n/).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  if (exit !== 0) {
    const result = events.findLast((event) => event.type === "result");
    let message = String(result?.result || result?.errors?.join("; ") || "no result diagnostic").slice(0, 1500);
    try { assertSafeAutoContent([message]); } catch { message = "diagnostic withheld by safety scan"; }
    const category = /cannot be launched inside another|nested session/i.test(stdout) ? "nested-session" :
      /invalid api key|not logged in|authentication failed|requires login|error[^\n]*401/i.test(stdout) ? "authentication" :
      /credit balance|billing|insufficient_quota/i.test(stdout) ? "billing" : /unknown option/i.test(stdout) ? "unsupported-option" : "unclassified";
    throw new Error(`Claude smoke failed: exit=${exit}, stdoutBytes=${Buffer.byteLength(stdout)}, stderrBytes=${stderrBytes}, category=${category}, events=${events.map((event) => event.type).join(",")}, subtype=${result?.subtype}, message=${message}`);
  }
  assert.equal(events.findLast((event) => event.type === "result")?.is_error, false, "Claude reported a failed result");
  assert.match(await readFile(join(project, "smoke-result.txt"), "utf8"), /^CLAUDE_SMOKE_OK\r?\n$/);
  const session = `claude:${id}`;
  const statePath = join(vault, ".oh-my-obsidian/auto-sessions", `${contentHash(session)}.json`);
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const receipt = JSON.parse(await readFile(`${statePath}.receipt`, "utf8"));
  assert.ok(["saved", "unchanged"].includes(receipt.status));
  assert.equal((await verifyAutoReceipt(vault, session, receipt.turnId)).verified, true);
  assert.match(await readFile(join(vault, state.relativePath), "utf8"), /participants: \[Claude, User\]/);
  assert.notEqual(spawnSync("git", ["-C", project, "rev-parse", "--verify", "HEAD"], { windowsHide: true }).status, 0);
  console.log(JSON.stringify({ status: "ok", claudeTaskCompleted: true, automaticSummaryVerified: true, noCommit: true }, null, 2));
} finally {
  clearTimeout(timer);
  if (child && child.exitCode === null && child.signalCode === null) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    else child.kill("SIGTERM");
  }
  const rel = relative(repo, root);
  assert.ok(rel.startsWith(".omob-claude-smoke-") && !rel.includes(".."));
  await rm(root, { recursive: true, force: true });
}

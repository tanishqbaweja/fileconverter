// Additive harness only: never changes any frozen codec/quality/memory gate.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { boundedTail, supervisorJournal } from "./lib/bounded-supervisor-journal.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { queryProcessIdentity } from "./lib/owned-process-exit-observation.mjs";

const root = path.resolve(import.meta.dirname, ".."), own = "scripts/launch-packet-largest-idle-supervisor.mjs";
const args = process.argv.slice(2), modes = ["--probe", "--prepare-only", "--full"];
const canonical = value => process.platform === "win32" ? value.toLowerCase() : value;
await mkdir(path.join(root, "work"), { recursive: true });
assert.equal(canonical(await realpath(root)), canonical(root));
assert.equal(canonical(await realpath(path.join(root, "work"))), canonical(path.join(root, "work")));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

if (args[0] !== "--worker") {
  assert.ok(args.length === 1 && modes.includes(args[0]), "Choose --probe, --prepare-only, or --full explicitly; no automatic conversion restart");
  const mode = args[0], stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const report = `${stamp}-packet-largest-idle-supervisor-${mode.slice(2)}.json`;
  await mkdir(path.join(root, "evidence"), { recursive: true });
  await assert.rejects(access(path.join(root, "evidence", report)), { code: "ENOENT" });
  const child = spawn(process.execPath, [own, "--worker", report, mode], {
    cwd: root, detached: true, windowsHide: true,
    env: { ...process.env, TEMP: path.join(root, "work"), TMP: path.join(root, "work"), TMPDIR: path.join(root, "work"),
      NODE_COMPILE_CACHE: "", WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  let ready;
  try { ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Supervisor launch observation timed out; inspect this exact report/PID, DO NOT restart")), 30000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", (code, signal) => { clearTimeout(timer); reject(new Error(`Supervisor exited before readiness: ${code}/${signal}; inspect evidence before any relaunch`)); });
    child.once("message", message => { clearTimeout(timer); resolve(message); });
  }); } finally {
    // An observation timeout does not authorize killing or duplicating the job.
    if (child.connected) child.disconnect(); child.unref();
  }
  assert.equal(ready.report, "evidence/" + report); assert.ok(ready.supervisorIdentity?.createdAt && ready.childIdentity?.createdAt);
  console.log(JSON.stringify(ready));
} else {
  assert.ok(args.length === 3 && modes.includes(args[2]));
  const [, reportName, mode] = args;
  assert.match(reportName, /^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z-packet-largest-idle-supervisor-(probe|prepare-only|full)\.json$/);
  assert.ok(reportName.endsWith(`supervisor-${mode.slice(2)}.json`));
  const report = "evidence/" + reportName, file = path.join(root, report);
  await assert.rejects(access(file), { code: "ENOENT" });
  const write = supervisorJournal(file), stdout = boundedTail(), stderr = boundedTail();
  const sources = await Promise.all([own, "scripts/lib/bounded-supervisor-journal.mjs", "scripts/run-packet-largest-idle-original-full.mjs",
    "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/owned-process-exit-observation.mjs"].map(async name => {
    const bytes = await readFile(path.join(root, name)); assert.ok(bytes.length <= 32768); return [name, bytes];
  }));
  assert.ok(sources.reduce((total, [, bytes]) => total + bytes.length, 0) <= 65536);
  const runtime = await createOwnedRuntimeScratch("packet-cache-supervised-");
  const state = { schema: 1, mode, report, status: "starting", startedAt: new Date().toISOString(), updatedAt: null,
    supervisorIdentity: null, childIdentity: null, runtimeDirectory: runtime.directory, runtimeRemoved: false,
    childExit: null, failure: null, heartbeatSeconds: 60, journalMaximumBytes: 262144,
    stdout: null, stderr: null, noProcessesKilled: true, noAutomaticRestart: true,
    conversionAcceptance: false, nativeMemorySamplesRecovered: false,
    sourcePins: Object.fromEntries(sources.map(([name, bytes]) => [name, sha(bytes)])),
    sourcePreimages: Object.fromEntries(sources.map(([name, bytes]) => [name, bytes.toString("base64")])) };
  let interval, heartbeatPending = false, heartbeatFailure = null;
  const checkpoint = async () => {
    state.updatedAt = new Date().toISOString(); state.stdout = stdout.snapshot(); state.stderr = stderr.snapshot();
    await write(state);
  };
  try {
    state.supervisorIdentity = await queryProcessIdentity(process.pid);
    assert.ok(state.supervisorIdentity, "Missing birth identity is not live evidence");
    await checkpoint();
    const command = mode === "--probe" ? ["-e", "setTimeout(()=>{process.stdout.write('a'.repeat(1048576));process.stderr.write('b'.repeat(1048576));process.exitCode=7;},15000)"] :
      ["scripts/run-packet-largest-idle-original-full.mjs", ...(mode === "--prepare-only" ? ["--prepare-only"] : [])];
    const child = spawn(process.execPath, command, { cwd: root, env: runtime.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    // Attach close/error immediately, before awaiting any OS query.
    const closed = new Promise(resolve => {
      child.once("error", error => resolve({ code: null, signal: null, error: String(error).slice(0, 2048) }));
      child.once("close", (code, signal) => resolve({ code, signal, error: null }));
    });
    child.stdout.on("data", bytes => stdout.append(bytes)); child.stderr.on("data", bytes => stderr.append(bytes));
    try {
      state.childIdentity = await queryProcessIdentity(child.pid);
      assert.ok(state.childIdentity && state.childIdentity.parentPid === process.pid);
      state.status = "running"; await checkpoint();
      if (process.send && process.connected) process.send({ report, mode, supervisorIdentity: state.supervisorIdentity, childIdentity: state.childIdentity });
      interval = setInterval(() => {
        if (heartbeatPending) return;
        heartbeatPending = true;
        checkpoint().catch(error => { heartbeatFailure = String(error).slice(0, 2048); }).finally(() => { heartbeatPending = false; });
      }, 60000);
    } catch (error) { state.failure = String(error.stack ?? error).slice(0, 4096); }
    // Never delete a runtime under a still-live child, even if readiness failed.
    state.childExit = await closed;
    state.status = state.childExit.code === 0 && !state.failure ? "command-completed-not-conversion-acceptance" : "command-failed-not-conversion-acceptance";
    if (heartbeatFailure) state.failure = `${state.failure ?? ""}\nJournal failure: ${heartbeatFailure}`;
  } catch (error) { state.status = "supervisor-failed"; state.failure = String(error.stack ?? error).slice(0, 4096); }
  finally {
    clearInterval(interval);
    try { await runtime.close(); state.runtimeRemoved = true; }
    catch (error) { state.failure = `${state.failure ?? ""}\nCleanup: ${error.stack ?? error}`.slice(0, 6144); state.status = "supervisor-cleanup-failed"; }
    state.finishedAt = new Date().toISOString(); await checkpoint();
    if (process.connected) process.disconnect();
  }
}

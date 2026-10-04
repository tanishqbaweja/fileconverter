/* OS-observer validation only. No selected media or conversion/native codec. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { startChromiumMemoryMonitor } from "./lib/persistent-chromium-memory.mjs";

const root = path.resolve(import.meta.dirname, ".."), samples = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const reportPath = `outputs/reports/${stamp}-persistent-memory-monitor-smoke.json`;
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize > 64 * 1024 ** 2);
let work, monitor, target, burst, descendantPid, failure = null, cpuStart, cpuEnd;
try {
  work = await mkdtemp(path.join(root, "work/memory-monitor-smoke-"));
  // Target is separate from Node/PowerShell observer, matching Chromium ownership.
  const targetCode = "process.on('message',code=>{const c=require('child_process').spawn(process.execPath,['-e',code],{windowsHide:true,stdio:'ignore'});process.send(c.pid)});setInterval(()=>{},1000)";
  target = spawn(process.execPath, ["-e", targetCode], { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  target.on("message", (pid) => { descendantPid = pid; });
  monitor = await startChromiumMemoryMonitor(target.pid, work);
  const collect = async (ms) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      await delay(200); const batch = await monitor.drain();
      cpuStart ??= batch.observerCpuMs; cpuEnd = batch.observerCpuMs;
      samples.push(...batch.samples); assert.ok(samples.length <= 256);
    }
  };
  await collect(1000);
  // Real committed/touched memory held briefly by an actual child process.
  // It is not a sparse media fixture or a substitute conversion acceptance.
  const childCode = "global.memory=Buffer.alloc(40*1024*1024,123);setTimeout(()=>process.exit(0),450)";
  const parentCode = `const{spawn}=require("child_process");const c=spawn(process.execPath,["-e",${JSON.stringify(childCode)}],{windowsHide:true,stdio:"ignore"});console.log(c.pid);setTimeout(()=>{},800)`;
  burst = spawn(process.execPath, ["-e", parentCode], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  target.send(childCode);
  // This burst is a sibling, deliberately not attributable to the owned tree.
  await collect(1000);
  assert.ok(samples.every((s) => s.processes?.every((p) => p.pid !== burst.pid)));
  assert.ok(Number.isSafeInteger(descendantPid));
  const transient = samples.filter((s) => s.processes?.some((p) => p.pid === descendantPid && p.privateBytes >= 40 * 1024 ** 2));
  assert.ok(transient.length >= 2, "Capture the genuine short-lived allocated child more than once");
  await new Promise((resolve, reject) => {
    target.once("exit", resolve); target.once("error", reject); target.kill();
  });
  await collect(400);
  assert.ok(samples.some((s) => s.sampleError && s.privateBytes === null && s.processes === null));
  const valid = samples.filter((s) => s.privateBytes != null);
  assert.ok(valid.length >= 15);
  assert.ok(valid.every((s) => s.processes.some((p) => p.pid === target.pid)));
  assert.ok(valid.every((s) => !s.processes.some((p) => p.pid === monitor.pid)));
} catch (error) { failure = { name: error.name, message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  await monitor?.close();
  for (const child of [burst, target]) if (child?.exitCode == null && child?.signalCode == null) child.kill();
  if (work) { assert.equal(path.dirname(work), path.join(root, "work")); await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  const sourceHashes = Object.fromEntries(await Promise.all([
    "scripts/test-persistent-memory-monitor.mjs", "scripts/lib/persistent-chromium-memory.mjs",
    "scripts/lib/windows-tree-monitor.cs", "scripts/lib/windows-tree-monitor.ps1",
  ].map(async (file) => [file, sha(await readFile(path.join(root, file)))])));
  const report = { status: failure ? "failed-observer-smoke" : "passed-observer-smoke", scope: "OS instrumentation only, no Chromium conversion/profile acceptance",
    intervalMs: 100, descendantPid, samples, observerCpuDeltaMs: cpuEnd - cpuStart, sourceHashes, failure,
    cleanup: { observerStopped: true, ownedTargetAndBurstStopped: true, repositoryLocalCompilerScratchRemoved: true, convertedMediaCreated: false } };
  await mkdir(path.dirname(path.join(root, reportPath)), { recursive: true });
  await writeFile(path.join(root, reportPath), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ reportPath, status: report.status, samples: samples.length, failure }, null, 2)}\n`);
}

// Observer-only native guard + real allocated child smoke. No user media.
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { makeBirthAwareMemoryObserver } from "./lib/birth-aware-memory-observer-source.mjs";
import { startChromiumMemoryMonitor } from "./lib/birth-aware-chromium-memory.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = value => createHash("sha256").update(value).digest("hex"), runtime = await createOwnedRuntimeScratch("birth-aware-observer-probe-");
const report = { startedAt: new Date().toISOString(), scope: "real observer/native ownership only; no browser or conversion acceptance", publicAcceptance: false, samples: [] };
let monitor, target, sibling, targetIdentity, siblingIdentity, monitorIdentity, descendantPid;
try {
  assert.equal(process.platform, "win32");
  report.sources = {};
  for (const file of ["scripts/test-birth-aware-memory-observer.mjs", "scripts/test-windows-birth-proof.ps1", "scripts/lib/birth-aware-memory-observer-source.mjs",
    "scripts/lib/windows-process-birth-proof.cs", "scripts/lib/windows-tree-monitor-birth-aware.ps1", "scripts/lib/birth-aware-chromium-memory.mjs",
    "scripts/lib/windows-tree-monitor.cs", "scripts/lib/persistent-chromium-memory.mjs"])
    report.sources[file] = sha(await readFile(path.join(root, file)));
  const candidate = makeBirthAwareMemoryObserver(await readFile(path.join(root, "scripts/lib/windows-tree-monitor.cs"), "utf8"),
    await readFile(path.join(root, "scripts/lib/windows-process-birth-proof.cs"), "utf8"));
  const source = path.join(runtime.directory, "guard-probe.cs"); await writeFile(source, candidate.generated, { flag: "wx" });
  report.generatedSourceSha256 = candidate.generatedSha256;
  report.nativeGuard = JSON.parse((await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", "scripts/test-windows-birth-proof.ps1",
    "-SourcePath", source, "-SourceSha256", candidate.generatedSha256], { cwd: root, env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 32768 })).stdout);
  const targetCode = "process.on('message',code=>{const c=require('child_process').spawn(process.execPath,['-e',code],{windowsHide:true,stdio:'ignore'});process.send(c.pid)});setInterval(()=>{},1000)";
  target = spawn(process.execPath, ["-e", targetCode], { env: runtime.env, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  target.on("message", pid => { descendantPid = pid; }); targetIdentity = await queryProcessIdentity(target.pid); assert.ok(targetIdentity);
  monitor = await startChromiumMemoryMonitor(target.pid, runtime.directory); monitorIdentity = await queryProcessIdentity(monitor.pid); assert.ok(monitorIdentity);
  let firstCpu, lastCpu;
  const collect = async milliseconds => { const deadline = Date.now() + milliseconds;
    while (Date.now() < deadline) { await pause(200); const batch = await monitor.drain();
      firstCpu ??= batch.observerCpuMs; lastCpu = batch.observerCpuMs; report.samples.push(...batch.samples); assert.ok(report.samples.length <= 128); }
  };
  await collect(1000);
  const allocation = "global.memory=Buffer.alloc(40*1024*1024,123);setTimeout(()=>process.exit(0),600)";
  sibling = spawn(process.execPath, ["-e", allocation], { env: runtime.env, windowsHide: true, stdio: "ignore" });
  siblingIdentity = await queryProcessIdentity(sibling.pid); assert.ok(siblingIdentity); target.send(allocation);
  await collect(1200); assert.ok(Number.isInteger(descendantPid)); report.descendantPid = descendantPid;
  const allocated = report.samples.filter(sample => sample.processes?.some(process => process.pid === descendantPid && process.privateBytes >= 40 * 1024 ** 2));
  assert.ok(allocated.length >= 2); report.allocatedChildSamples = allocated.length;
  assert.ok(report.samples.every(sample => sample.processes?.every(process => process.pid !== sibling.pid && process.pid !== monitor.pid) ?? sample.privateBytes === null));
  assert.deepEqual(await queryProcessIdentity(target.pid), targetIdentity);
  const exited = new Promise(resolve => target.once("exit", resolve)); target.kill(); await exited;
  await collect(400);
  assert.ok(report.samples.some(sample => sample.sampleError && sample.privateBytes === null && sample.processes === null));
  assert.ok(report.samples.filter(sample => sample.privateBytes !== null).length >= 15);
  report.observerCpuDeltaMs = lastCpu - firstCpu; report.ownership = monitor.ownershipSummary();
  report.status = "passed-birth-aware-observer-native-and-child-smoke";
} catch (error) { report.status = "failed"; report.failure = String(error.stack ?? error); process.exitCode = 1; }
finally {
  await finishOwnedCleanup([async () => { if (monitor) await monitor.close(); }, ...[[target, targetIdentity], [sibling, siblingIdentity]].map(([child, identity]) => async () => {
    if (child && child.exitCode === null && child.signalCode === null) { assert.ok(identity); assert.deepEqual(await queryProcessIdentity(child.pid), identity); child.kill(); }
  })]);
  report.processCleanup = [];
  for (const identity of [targetIdentity, siblingIdentity, monitorIdentity].filter(Boolean)) report.processCleanup.push(await observeOwnedProcessExit(identity));
  assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
  await runtime.close(); await assert.rejects(lstat(runtime.directory), { code: "ENOENT" });
  report.cleanup = { allOwnedBirthsAbsent: true, ownedScratchRemoved: true, mediaCreated: false, unrelatedApplicationsClosed: false };
  report.finishedAt = new Date().toISOString(); const file = path.join(root, "outputs/reports", report.startedAt.replaceAll(":", "-") + "-birth-aware-memory-observer.json");
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ report: file, status: report.status, nativeGuard: report.nativeGuard, allocatedChildSamples: report.allocatedChildSamples, failure: report.failure }));
}

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { summarizeMemoryInfraTrace } from "./lib/memory-infra-attribution.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const failedName = "outputs/reports/2026-10-06T13-09-33-142Z-split-initialization-attribution.json";
const passedName = "outputs/reports/2026-10-06T13-11-07-109Z-split-initialization-attribution.json";
const traceName = passedName.replace(".json", "-memory-trace.json"), traceFile = path.join(root, traceName);
const failedBytes = await readFile(path.join(root, failedName)), passedBytes = await readFile(path.join(root, passedName));
const failed = JSON.parse(failedBytes), passed = JSON.parse(passedBytes), traceBytes = await readFile(traceFile);
assert.equal(failed.status, "failed-diagnostic"); assert.equal(failed.tracing.overflow, true);
assert.equal(passed.status, "completed-diagnostic"); assert.equal(passed.tracing.dataLossOccurred, false);
assert.equal(passed.tracing.overflow, false); assert.ok(traceBytes.length <= 8388608);
for (const report of [failed, passed]) {
  assert.equal(report.originalRead, false); assert.equal(report.conversionsPerformed, 0);
  assert.equal(report.publicAcceptance, false); assert.equal(report.completeChromiumMemoryAcceptance, false);
  assert.deepEqual(report.cleanupErrors, []); assert.deepEqual(report.forbidden, []);
  assert.ok(Object.values(report.cleanup).every(value => value === true));
  await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
  const ids = Object.values(report.ownedPids);
  assert.ok(ids.every(Number.isSafeInteger));
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in @(${ids.join(",")}) }).Count`], { windowsHide: true, timeout: 5000 });
  assert.equal(Number(stdout.trim()), 0);
}
for (const [file, digest] of Object.entries(passed.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest);
for (const name of ["within-remux", "within-mpeg4", "within-direct"])
  for (const ext of ["mjs", "wasm"]) assert.equal(sha(await readFile(path.join(root, `dist/client/engines/remux/${name}.${ext}`))),
    sha(await readFile(path.join(root, `public/engines/remux/${name}.${ext}`))));
const phases = report => report.rows.filter(row => row.phase !== "blank-baseline").map(row => ({
  phase: row.phase, timestamp: row.timestamp, osPrivateBytes: row.privateBytes,
  incrementalPrivateMiBDiagnostic: row.privateBytes == null ? null : (row.privateBytes - report.baseline.privateBytes) / 1048576,
  dom: row.dom, realms: row.realms, osProcesses: row.processes, nativePhasePeak: row.nativePhasePeak, memoryDump: row.memoryDump }));
const proof = { recordedAt: new Date().toISOString(), scope: "component-only initialization/navigation diagnostic; tracing perturbs memory",
  originalRead: false, mediaIoCalls: 0, conversionsPerformed: 0, publicAcceptance: false, completeChromiumMemoryAcceptance: false,
  allocationRootCauseOfOriginalFailureProven: false,
  rejectedDetailedAttempt: { report: failedName, sha256: sha(failedBytes), bytes: failedBytes.length,
    baseline: failed.baseline, tracing: failed.tracing, sourcePins: failed.sourcePins, phases: phases(failed), cleanup: failed.cleanup },
  narrowedLightAttempt: { report: passedName, sha256: sha(passedBytes), bytes: passedBytes.length, browserVersion: passed.browserVersion,
    baseline: passed.baseline, tracing: passed.tracing, sourcePins: passed.sourcePins, phases: phases(passed), cleanup: passed.cleanup },
  trace: { path: traceName, sha256: sha(traceBytes), bytes: traceBytes.length, removedAfterCompaction: true },
  attribution: summarizeMemoryInfraTrace(JSON.parse(traceBytes), passed.rows),
  independentRuntimeAndPidAbsence: true, generatedAssetsMatchPublished: true,
  nextExperiment: "Remove redundant pre-conversion page navigation in a separately pinned original-source driver; no quality, source, process-tree, baseline or memory-limit changes." };
const target = path.join(root, "evidence/mpeg2-split-initialization-attribution-2026-10-06.json");
assert.ok(Buffer.byteLength(JSON.stringify(proof)) < 512 * 1024);
await writeFile(target, JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
const identity = await lstat(traceFile); assert.ok(identity.isFile() && !identity.isSymbolicLink());
assert.equal(await realpath(traceFile), traceFile); assert.equal(sha(await readFile(traceFile)), proof.trace.sha256);
await rm(traceFile); await assert.rejects(access(traceFile), { code: "ENOENT" });
console.log(`Frozen compact diagnostic evidence; removed ${traceBytes.length}-byte owned trace: ${target}`);

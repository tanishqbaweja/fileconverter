// Retain finite production-control evidence, including rejected attempts, not media.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
assert.equal(process.argv.length, 4);
const [relative, head] = process.argv.slice(2);
assert.match(relative, /^outputs\/reports\/[0-9TZ.-]+-mpeg2-production-runtime\.json$/);
assert.match(head, /^[a-f0-9]{40}$/);
const rawPath = path.join(root, relative), archivePath = rawPath + ".gz";
const receiptPath = path.join(root, "evidence", path.basename(relative).replace("-mpeg2-production-runtime.json", "-mpeg2-controls-result.json"));
await assert.rejects(access(receiptPath), { code: "ENOENT" }); await assert.rejects(access(archivePath), { code: "ENOENT" });
const identity = await lstat(rawPath, { bigint: true });
assert.ok(identity.isFile() && !identity.isSymbolicLink() && identity.size > 0n && identity.size <= 4n * 1048576n);
assert.equal(await realpath(rawPath), rawPath);
const raw = await readFile(rawPath), report = JSON.parse(raw), sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(report.publicAcceptance, false); assert.ok(report.controlsQualification);
assert.ok(report.status === "failed" || report.status === "passed-small-allocation-diagnostic-not-route-promotion");
assert.equal(report.protectedOriginalUnchanged, true); assert.equal(report.cleanup.allOwnedProcessesAbsent, true);
assert.equal(report.cleanup.disposableOutputDeleted, true);
const sourceEntries = Object.entries(report.sources); assert.ok(sourceEntries.length > 0 && sourceEntries.length <= 128);
for (const [file, hash] of sourceEntries) {
  assert.ok(/^(?:workers\/|lib\/|scripts\/|app\/)/.test(file) && !file.includes(".."));
  const result = await execute("git", ["show", `${head}:${file}`], { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 2 * 1048576, encoding: "buffer" });
  assert.equal(sha(result.stdout), hash, `Recorded source must match executed historical head: ${file}`);
}
for (const entry of report.native) assert.equal(sha(await readFile(path.join(root, entry.source))), entry.sha256);
const independentCleanup = [];
for (const observation of report.cleanup.processObservations) {
  const result = await observeOwnedProcessExit(observation.identity); assert.equal(result.status, "owned-identity-absent"); independentCleanup.push(result);
}
for (const directory of [report.cleanup.scratchRemoved, ...report.cleanup.generatedDirectoriesRemoved]) {
  const target = path.resolve(root, directory);
  assert.ok(target.startsWith(path.join(root, "work") + path.sep) || target.startsWith(path.join(root, "dist/client/engines") + path.sep));
  await assert.rejects(access(target), { code: "ENOENT" });
}
const completed = report.controlsQualification.cases;
assert.ok(Array.isArray(completed) && completed.length <= 2);
for (const entry of completed) {
  assert.equal(entry.conversion.type, "complete"); assert.ok(entry.output.bytes > 0);
  assert.ok(entry.output.ssim >= 0.98); assert.equal(entry.output.fullNativeDecodePassed, true);
  assert.ok(entry.output.videoClocks.maximumVideoPtsErrorSeconds < 0.001);
}
if (report.status === "failed") {
  assert.ok(report.failures.length > 0);
  // Valid files can still fail the whole-browser memory gate. Never turn a
  // content-complete/memory-failed run into either no conversion or acceptance.
  assert.equal(report.controlsQualification.completed, completed.length === 2);
}
else {
  assert.equal(report.controlsQualification.completed, true); assert.equal(completed.length, 2); assert.deepEqual(report.failures, []);
  assert.ok(report.memory.incrementalPrivateMiB <= 250); assert.equal(report.executedSourcesAndBrowserPinsVerified, true);
}
const compressed = gzipSync(raw, { level: 9 });
await writeFile(archivePath, compressed, { flag: "wx" });
assert.deepEqual(gunzipSync(await readFile(archivePath), { maxOutputLength: 4 * 1048576 }), raw);
const allocation = report.postMeasurementAllocators;
let allocationArchive = null;
if (allocation?.archive) {
  const target = path.resolve(root, allocation.archive.path);
  assert.ok(target.startsWith(path.join(root, "output/playwright") + path.sep));
  const packed = await readFile(target); assert.equal(packed.length, allocation.archive.bytes); assert.equal(sha(packed), allocation.archive.sha256);
  const restored = gunzipSync(packed, { maxOutputLength: 8 * 1048576 });
  assert.equal(restored.length, allocation.archive.restoredBytes); assert.equal(sha(restored), allocation.archive.restoredSha256);
  assert.equal(allocation.acceptanceMetric, false); assert.equal(allocation.perturbsMemory, true);
  allocationArchive = { ...allocation.archive, path: path.relative(root, target).replaceAll(path.sep, "/"), recordedAbsolutePath: allocation.archive.path };
}
const receipt = { schemaVersion: 1, head, status: report.status, startedAt: report.startedAt, finishedAt: report.finishedAt,
  scope: "Finite real production MPEG-2 controls gate, including failures; not UI-control, scale or public acceptance",
  archive: { path: relative + ".gz", bytes: compressed.length, sha256: sha(compressed), restoredBytes: raw.length, restoredSha256: sha(raw) },
  sourcePins: sourceEntries.length, recordedSourcesMatchHistoricalGitHead: true, native: report.native,
  scaledPropertiesBuild: report.scaledPropertiesBuild ?? null, fixture: report.fixture,
  observer: report.observer, diagnosticObserverOnly: report.observer.controlScope === "events-only observer comparison, not route promotion",
  postMeasurementAllocationArchive: allocationArchive,
  postMeasurementAllocationScope: allocation ? { status: allocation.status, acceptanceMetric: allocation.acceptanceMetric,
    perturbsMemory: allocation.perturbsMemory, allocationStackAttribution: allocation.allocationStackAttribution } : null,
  completedCases: completed.map(entry => ({ name: entry.name, requested: entry.requested, reference: entry.reference,
    actualNativeSettings: entry.actualNativeSettings, output: entry.output })),
  completed: report.controlsQualification.completed, overallGatePassed: report.status !== "failed", lastTerminal: { type: report.conversion?.type,
    message: report.conversion?.message ?? null, metrics: report.conversion?.metrics ?? null }, failures: report.failures,
  memory: report.memory ?? null, protectedOriginalUnchangedAtExecution: true, cleanup: report.cleanup,
  independentCleanup, publicAcceptance: false, speedComparison: false, rawLosslesslyRecoverable: true };
await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
const current = await lstat(rawPath, { bigint: true });
for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(current[key], identity[key]);
assert.equal(sha(await readFile(rawPath)), sha(raw)); await unlink(rawPath);
console.log(JSON.stringify({ receipt: path.relative(root, receiptPath), status: report.status, validatedOutputs: completed.length,
  rawBytes: raw.length, archiveBytes: compressed.length, losslessReadbackVerified: true, rawRemoved: true, publicAcceptance: false }));

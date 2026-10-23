// Record the completed production integration cycle; never run a conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";

const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--recovery"));
const recovery = process.argv[2] === "--recovery";
const input = recovery ? "outputs/reports/2026-10-23T14-39-37.327Z-mpeg2-production-runtime.json"
  : "outputs/reports/2026-10-23T14-23-24.766Z-mpeg2-production-runtime.json";
const rawPath = path.join(root, input), archivePath = rawPath + ".gz";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const identity = await lstat(rawPath, { bigint: true });
assert.ok(identity.isFile() && !identity.isSymbolicLink() && identity.size <= 4n * 1048576n);
assert.equal(await realpath(rawPath), rawPath);
const raw = await readFile(rawPath), report = JSON.parse(raw);
assert.equal(report.status, "passed-small-allocation-diagnostic-not-route-promotion");
assert.deepEqual(report.failures, []); assert.equal(report.publicAcceptance, false);
assert.equal(report.executedSourcesAndBrowserPinsVerified, true);
for (const [file, hash] of Object.entries(report.sources)) assert.equal(sha(await readFile(path.join(root, file))), hash);
assert.equal(report.cacheQualification.results.length, recovery ? 2 : 3);
assert.equal(new Set(report.cacheQualification.outputHashes).size, 1);
assert.deepEqual(report.staticRequests, { manifests: recovery ? 4 : 3, decoder: 1, encoder: 1 });
const samples = report.diagnosticMemorySamples;
const available = samples.filter(sample => sample.privateBytes !== null), unavailable = samples.filter(sample => sample.privateBytes === null);
assert.ok(available.length > 0); assert.equal(available.length, report.memory.validSamples);
assert.deepEqual(unavailable, report.memory.unavailableSamples);
if (!recovery) assert.equal(unavailable.length, 0);
else assert.ok(unavailable.every(sample => sample.phase === "loaded"), "Recovery conversions must have available native samples");
for (const sample of available) assert.equal(sample.privateBytes, sample.processes.reduce((sum, entry) => sum + entry.privateBytes, 0));
const peak = available.filter(sample => sample.phase !== "blank").reduce((a, b) => a.privateBytes > b.privateBytes ? a : b);
const incrementalPrivateMiB = (peak.privateBytes - report.blankBaseline.privateBytes) / MiB;
assert.equal(incrementalPrivateMiB, report.memory.incrementalPrivateMiB); assert.ok(incrementalPrivateMiB <= 250);
assert.equal(report.protectedOriginalUnchanged, true); assert.deepEqual(report.forbiddenRequests, []);
if (recovery) {
  const gate = report.recoveryQualification;
  for (const key of ["completed", "nativeDuringEncodingCancellation", "destinationRollback", "noStagesAfterEachTerminal"]) assert.equal(gate[key], true);
  assert.deepEqual(gate.cases.map(row => [row.name, row.result.type]), [
    ["in-flight-cancel", "cancelled"], ["recover-after-cancel", "complete"],
    ["final-write-failure", "error"], ["recover-after-write-failure", "complete"],
  ]);
  for (const row of gate.cases) {
    assert.deepEqual(row.stageNames, []); assert.equal(row.result.metrics.scratchBytes, 0);
    assert.equal(row.result.metrics.pendingOperations, 0); assert.equal(row.result.metrics.queuedBytes, 0);
    if (row.result.type !== "complete") { assert.equal(row.destinationUnchanged, true); assert.equal(row.terminalWorkerRetired, true); }
    else assert.equal(row.independentOutput.sha256, "a9ede23c2164a31f59e1d1fed9aa60ae43de2ee0928229c3e588e9865aedbb13");
  }
  const cancelled = gate.cases[0]; assert.ok(cancelled.cancellation.inputBytes > 0 && cancelled.cancellation.outputBytes > 0);
  assert.equal(cancelled.cancellation.wasmMemoryBytes, 50331648);
  assert.equal(cancelled.result.metrics.wasmMemoryBytes, 50331648, "Preserve last allocation before worker retirement; never rewrite as zero");
  assert.ok(cancelled.cancellation.finishedAt - cancelled.cancellation.requestedAt < 5000);
  assert.match(gate.cases[2].result.message, /destination rejected a bounded write/i);
}
assert.equal(report.cleanup.allOwnedProcessesAbsent, true);
const independentProcessChecks = [];
for (const observation of report.cleanup.processObservations) {
  const check = await observeOwnedProcessExit(observation.identity);
  assert.equal(check.status, "owned-identity-absent"); independentProcessChecks.push(check);
}
for (const directory of [report.cleanup.scratchRemoved, ...report.cleanup.generatedDirectoriesRemoved]) {
  const target = path.resolve(root, directory); assert.ok(target.startsWith(root + path.sep));
  await assert.rejects(access(target), { code: "ENOENT" });
}
await assert.rejects(access(archivePath), { code: "ENOENT" });
await pipeline(createReadStream(rawPath, { highWaterMark: 65536 }), createGzip({ level: 9 }), createWriteStream(archivePath, { flags: "wx", highWaterMark: 65536 }));
const restoredHash = createHash("sha256"); let restoredBytes = 0;
await pipeline(createReadStream(archivePath, { highWaterMark: 65536 }), createGunzip(), new Writable({ write(chunk, encoding, next) {
  restoredBytes += chunk.length; if (restoredBytes > 4 * MiB) return next(new Error("Archived report exceeds its bound"));
  restoredHash.update(chunk); next();
} }));
assert.equal(restoredBytes, raw.length); assert.equal(restoredHash.digest("hex"), sha(raw));
const current = await lstat(rawPath, { bigint: true });
for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(current[key], identity[key]);
assert.equal(sha(await readFile(rawPath)), sha(raw));
const archiveBytes = await readFile(archivePath); assert.ok(archiveBytes.length < raw.length);
const receipt = {
  schemaVersion: 1, head: recovery ? "5e67254902f435e5f57c0e602692ed51cc1b3171" : "bac29efcb877d920bc854e9b682b57c32d9d44f6",
  scope: recovery ? "Actual in-flight production cancellation, final-write rollback and two independently validated recoveries; small fixture, not stress/public acceptance"
    : "Three small actual production MPEG-2 conversions with immutable code reuse; not public promotion, stress, or causal speed comparison",
  startedAt: report.startedAt, finishedAt: report.finishedAt,
  archive: { file: input + ".gz", bytes: archiveBytes.length, sha256: sha(archiveBytes), restoredBytes, restoredSha256: sha(raw) },
  sourcePins: Object.keys(report.sources).length, currentSourcePinsIndependentlyRechecked: true,
  native: report.native, staticRequests: report.staticRequests, codeManifest: report.codeManifest,
  results: report.cacheQualification.results.map(row => ({ repetition: row.repetition, elapsedMs: row.conversion.metrics.elapsedMs,
    phases: row.conversion.phases, output: row.output, nativeWasmBytes: row.conversion.nativeMetrics.wasmMemoryBytes,
    nativePeakQueuedBytes: row.conversion.nativeMetrics.peakQueuedBytes, saverPeakQueuedBytes: row.conversion.metrics.peakQueuedBytes,
    nativePendingOperations: row.conversion.nativeMetrics.peakPendingOperations, saverPendingOperations: row.conversion.metrics.peakPendingOperations })),
  memory: { primaryLimitMiB: 250, blankPrivateBytes: report.blankBaseline.privateBytes, peakPrivateBytes: peak.privateBytes,
    incrementalPrivateMiB, allNonblankPhasesIncluded: true, completeProcessTreeRecomputed: true,
    samples: samples.length, validSamples: available.length, unavailableSamples: unavailable.length,
    unavailableSamplePhases: unavailable.map(sample => sample.phase),
    maximumValidSampleGapMs: available.slice(1).reduce((peak, sample, index) => Math.max(peak, Date.parse(sample.timestamp) - Date.parse(available[index].timestamp)), 0),
    loadedPeakIncrementalPrivateMiB: report.loadedPeakIncrementalPrivateMiB },
  ...(recovery ? { recoveryQualification: report.recoveryQualification } : {}),
  forbiddenRequests: 0, originalUnchanged: true, cleanup: report.cleanup, independentProcessChecks,
  convertedOutputsFixturesProfilesAndPrivateAssetsIndependentlyAbsent: true,
  rawReportLosslesslyRecoverable: true, rawOriginalRemovedAfterExactReconstruction: true,
  globalSpeedClaim: false, causalSpeedComparison: false, largeFileAcceptance: false, publicAcceptance: false, fullGoalComplete: false,
  next: "Reuse this completed small integration gate. Remaining original-source/stress/recovery, production planner/options/disclosures and broader browser gates stay open. Prior volume memory failure is unchanged."
};
const destination = path.join(root, recovery ? "evidence/2026-10-23-mpeg2-production-recovery.json" : "evidence/2026-10-23-mpeg2-compiled-runtime.json");
await writeFile(destination, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
await unlink(rawPath); await assert.rejects(access(rawPath), { code: "ENOENT" });
console.log(JSON.stringify({ receipt: path.relative(root, destination), archiveBytes: archiveBytes.length, restoredBytes, incrementalPrivateMiB, results: receipt.results.map(row => ({ repetition: row.repetition, elapsedMs: row.elapsedMs })) }));

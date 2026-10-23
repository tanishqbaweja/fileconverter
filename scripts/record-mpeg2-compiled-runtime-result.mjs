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
const input = "outputs/reports/2026-10-23T14-23-24.766Z-mpeg2-production-runtime.json";
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
assert.equal(report.cacheQualification.results.length, 3);
assert.equal(new Set(report.cacheQualification.outputHashes).size, 1);
assert.deepEqual(report.staticRequests, { manifests: 3, decoder: 1, encoder: 1 });
const samples = report.diagnosticMemorySamples;
assert.ok(samples.length > 0 && samples.every(sample => sample.privateBytes !== null));
for (const sample of samples) assert.equal(sample.privateBytes, sample.processes.reduce((sum, entry) => sum + entry.privateBytes, 0));
const peak = samples.filter(sample => sample.phase !== "blank").reduce((a, b) => a.privateBytes > b.privateBytes ? a : b);
const incrementalPrivateMiB = (peak.privateBytes - report.blankBaseline.privateBytes) / MiB;
assert.equal(incrementalPrivateMiB, report.memory.incrementalPrivateMiB); assert.ok(incrementalPrivateMiB <= 250);
assert.equal(report.protectedOriginalUnchanged, true); assert.deepEqual(report.forbiddenRequests, []);
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
  schemaVersion: 1, head: "bac29efcb877d920bc854e9b682b57c32d9d44f6",
  scope: "Three small actual production MPEG-2 conversions with immutable code reuse; not public promotion, stress, or causal speed comparison",
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
    samples: samples.length, unavailableSamples: 0, loadedPeakIncrementalPrivateMiB: report.loadedPeakIncrementalPrivateMiB },
  forbiddenRequests: 0, originalUnchanged: true, cleanup: report.cleanup, independentProcessChecks,
  convertedOutputsFixturesProfilesAndPrivateAssetsIndependentlyAbsent: true,
  rawReportLosslesslyRecoverable: true, rawOriginalRemovedAfterExactReconstruction: true,
  globalSpeedClaim: false, causalSpeedComparison: false, largeFileAcceptance: false, publicAcceptance: false, fullGoalComplete: false,
  next: "Reuse this completed small integration gate. Remaining original-source/stress/recovery, production planner/options/disclosures and broader browser gates stay open. Prior volume memory failure is unchanged."
};
const destination = path.join(root, "evidence/2026-10-23-mpeg2-compiled-runtime.json");
await writeFile(destination, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
await unlink(rawPath); await assert.rejects(access(rawPath), { code: "ENOENT" });
console.log(JSON.stringify({ receipt: path.relative(root, destination), archiveBytes: archiveBytes.length, restoredBytes, incrementalPrivateMiB, results: receipt.results.map(row => ({ repetition: row.repetition, elapsedMs: row.elapsedMs })) }));

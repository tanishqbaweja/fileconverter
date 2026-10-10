// Exact terminal diagnostic only: no new browser/conversion/retry or acceptance claim.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => readFile(path.join(root, file));
const proofPath = "evidence/2026-10-10T08-54-35-664Z-aiff-id3-direct-handle-diagnostic.json";
const proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
const restore = async entry => {
  const gzip = await read(entry.path), bytes = gunzipSync(gzip);
  assert.equal(sha(gzip), entry.sha256); assert.equal(sha(bytes), entry.restoredSha256); return bytes;
};
const diagnostic = JSON.parse(await restore(proof.diagnosticObserverEvidence));
const raw = JSON.parse(await restore(proof.retainedReports.find(row => row.path.endsWith(".json.gz"))));
const previousPath = "evidence/2026-10-10T08-31-05-604Z-aiff-id3-direct-handle-stress.json";
const previousBytes = await read(previousPath), previous = JSON.parse(previousBytes);
assert.equal(proof.diagnosticOnly, true); assert.equal(proof.publicAcceptance, false);
assert.equal(raw.runs.length, 3); assert.equal(raw.blankBaseline.stable, true);
assert.equal(diagnostic.observerClosed, true); assert.equal(diagnostic.evictedSnapshots, 0);
assert.equal(proof.fixture.sha256, previous.fixture.sha256);
for (const [file, hash] of Object.entries(previous.sourcePins)) assert.equal(proof.sourcePins[file], hash);
const types = raw.samples.flatMap(sample => sample.processes ?? []);
const label = process => types.find(row => row.pid === process.pid && row.parentPid === process.parentPid &&
  Math.abs(Date.parse(row.createdAt) - Date.parse(process.createdAt)) < 1)?.type ?? "unknown";
const runs = raw.runs.map(run => {
  assert.equal(run.mediaProbe.withinValidation.passed, true);
  assert.equal(run.mediaProbe.withinArtworkValidation.passed, true);
  assert.equal(run.sha256, previous.reportSummary.runs[0].sha256);
  assert.equal(run.peakWasmMemoryBytes, 16777216);
  assert.equal(run.nativePeaks.peak.privateBytes, run.nativePeaks.peak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  const workers = diagnostic.snapshots.filter(row => row.phase === `conversion-${run.run}`)
    .flatMap(row => row.targets ?? []).filter(row => row.type.includes("worker"));
  const uniqueTargets = [...new Map(workers.map(row => [row.targetId, { targetId: row.targetId, type: row.type, url: row.url }])).values()];
  return { run: run.run, elapsedMs: run.elapsedMs, peakPrivateBytes: run.peakPrivateBytes,
    incrementalPrivateMiB: run.incrementalPrivateMiB, cleanupDeltaFromLoadedMiB: run.cleanupDeltaFromLoadedMiB,
    nativePeakTimestamp: run.nativePeaks.peak.timestamp,
    nativePeakProcesses: run.nativePeaks.peak.processes.map(row => ({ pid: row.pid, parentPid: row.parentPid, createdAt: row.createdAt,
      nativeType: row.type, cimBirthMatchedType: label(row), privateBytes: row.privateBytes })),
    observedWorkerTargets: uniqueTargets, writerWorkerObserved: uniqueTargets.some(row => row.url.includes("/assets/direct-file-writer.worker-")),
    conversionRealmSummary: diagnostic.phases.find(row => row.phase === `conversion-${run.run}`),
    cleanupRealmSummary: diagnostic.phases.find(row => row.phase === `cleanup-${run.run}`) };
});
const analysis = { recordedAt: new Date().toISOString(), sourceSha256: sha(await readFile(new URL(import.meta.url))),
  status: "actual-direct-diagnostic-observed-small-worker-js-heaps-no-allocation-cause-or-production-fix-proven",
  proof: { path: proofPath, sha256: sha(proofBytes) }, previousFailedStress: { path: previousPath, sha256: sha(previousBytes) },
  observerArchive: proof.diagnosticObserverEvidence, diagnosticOnly: true, productionAcceptance: false,
  blankBaseline: raw.blankBaseline, loadedIdle: raw.loadedIdle,
  peakPrivateBytes: raw.peakPrivateBytes, incrementalPrivateMiB: raw.incrementalPrivateMiB,
  formula: raw.formula, allObservedProcessesCounted: true, processExclusions: [],
  sampleCount: diagnostic.sequence, samplerLimits: diagnostic.limits, snapshotsEvicted: diagnostic.evictedSnapshots,
  workerHeapMeasurementsAvailable: diagnostic.phases.reduce((sum, phase) => sum + phase.workerObservations - phase.unavailableWorkerHeaps, 0),
  unavailableWorkerHeapMeasurements: diagnostic.phases.reduce((sum, phase) => sum + phase.unavailableWorkerHeaps, 0),
  gpuRelatedStderr: diagnostic.gpuLogs, stderrScope: "This instrumented session only; absence of captured GPU errors is not evidence about the earlier failure",
  runs, cancellationPassed: raw.cancellationCheck.passed,
  sameFixtureAndExistingSourcePins: true, sourceOrCodecOrQualityFixImplemented: false,
  allocationCauseEstablished: false, speedImprovementProven: false, protectedOriginalRead: false,
  interpretation: "Sampled individual worker JS heaps peak below2MiB and return below0.6MiB after cleanup; nested direct-writer targets were observed. These partial isolate measurements neither replace complete-tree private memory nor establish where renderer-native/GPU bytes were allocated. Earlier260.72265625MiB failure remains failed.",
  next: "Reuse bounded-renderer-attribution and memory-infra-attribution for bounded native allocator dumps at loaded idle, active conversion and cleanup in an explicitly changed diagnostic. Locate renderer/GPU allocation sources before any production fix or unchanged acceptance rerun.",
  ownedRuntimeRemoved: proof.ownedRuntimeRemoved, assetsRestored: proof.assetsRestored,
  newBrowserLaunchedByAnalysis: false, noDocker: true };
await writeFile(path.join(root, "evidence/aiff-id3-direct-diagnostic-analysis-2026-10-10.json"), JSON.stringify(analysis, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: analysis.status, sampleCount: analysis.sampleCount,
  workerHeapMeasurementsAvailable: analysis.workerHeapMeasurementsAvailable, unavailableWorkerHeapMeasurements: analysis.unavailableWorkerHeapMeasurements,
  individualWorkerPeakUsedBytes: runs.map(run => run.conversionRealmSummary.peakWorkerUsedJSHeapBytes),
  writerWorkersObserved: runs.every(run => run.writerWorkerObserved), productionAcceptance: false }));

// Read-only attribution of terminal evidence. No browser, converter, retry or exclusions.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { stableWindow } from "./lib/chromium-private-memory.mjs";

const root = path.resolve(import.meta.dirname, "..");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => readFile(path.join(root, file));
const names = [
  "evidence/2026-10-10T08-18-49-643Z-aiff-id3-sync-opfs-stress.json",
  "evidence/2026-10-10T08-31-05-604Z-aiff-id3-direct-handle-stress.json",
];
const records = [];
for (const file of names) {
  const bytes = await read(file), proof = JSON.parse(bytes);
  const entry = proof.retainedReports.find(row => row.path.endsWith(".json.gz"));
  const compressed = await read(entry.path), restored = gunzipSync(compressed);
  assert.equal(sha(compressed), entry.sha256);
  assert.equal(sha(restored), entry.restoredSha256);
  const raw = JSON.parse(restored);
  assert.equal(raw.blankBaseline.stable, true);
  assert.equal(raw.loadedIdle.stable, true);
  assert.equal(raw.runs.length, 3);
  assert.equal(raw.limitMiB, 250);
  assert.equal(raw.incrementalPrivateMiB, (raw.peakPrivateBytes - raw.blankBaseline.privateBytes) / 1048576);
  // Native observer deliberately counts unknown process types. CIM supplies a
  // label only when PID, parent and birth match; labels never select the total.
  const cimRows = raw.samples.flatMap(sample => sample.processes ?? []);
  const label = process => cimRows.find(row => row.pid === process.pid && row.parentPid === process.parentPid &&
    Math.abs(Date.parse(row.createdAt) - Date.parse(process.createdAt)) < 1)?.type ?? "unknown";
  const blankGpuBirths = raw.samples.filter(sample => sample.phase === "blank-baseline")
    .flatMap(sample => (sample.processes ?? []).filter(row => row.type === "gpu-process"));
  const runs = raw.runs.map(run => {
    const peak = run.nativePeaks.peak;
    assert.equal(peak.privateBytes, peak.processes.reduce((sum, process) => sum + process.privateBytes, 0));
    assert.equal(run.peakPrivateBytes, Math.max(peak.privateBytes, run.cimPeakPrivateBytes));
    const processes = peak.processes.map(process => ({ pid: process.pid, parentPid: process.parentPid,
      createdAt: process.createdAt, nativeType: process.type, cimBirthMatchedType: label(process),
      privateBytes: process.privateBytes, rssBytes: process.rssBytes }));
    const cleanupSamples = raw.samples.filter(sample => sample.phase === `cleanup-${run.run}`);
    const cleanupStable = stableWindow(cleanupSamples);
    assert.equal(cleanupStable?.stable, true);
    assert.equal(cleanupStable.privateBytes, run.cleanupPrivateBytes);
    const endpoint = cleanupSamples.slice(-5).find(sample => sample.privateBytes === cleanupStable.privateBytes);
    assert.ok(endpoint, "The exact stable median must have a matching per-process sample");
    assert.equal(run.mediaProbe.withinValidation.passed, true);
    assert.equal(run.mediaProbe.withinArtworkValidation.passed, true);
    return { run: run.run, elapsedMs: run.elapsedMs, sourceBytes: run.sourceBytes, outputBytes: run.outputBytes,
      outputSha256: run.sha256, fullPcmSha256: run.mediaProbe.withinValidation.sha256,
      artworkSha256: run.mediaProbe.withinArtworkValidation.sha256, peakPrivateBytes: run.peakPrivateBytes,
      incrementalPrivateMiB: run.incrementalPrivateMiB, maxReadChunkBytes: run.maxReadChunkBytes,
      maxWriteChunkBytes: run.maxWriteChunkBytes, peakQueuedBytes: run.peakQueuedBytes,
      peakPendingOperations: run.peakPendingOperations, peakWasmMemoryBytes: run.peakWasmMemoryBytes,
      sharedArrayBufferBytes: run.sharedArrayBufferBytes, peakTimestamp: peak.timestamp,
      peakProcesses: processes, peakGpuProcesses: processes.filter(process => process.cimBirthMatchedType === "gpu-process"),
      newGpuBirthsAtPeak: processes.filter(process => process.cimBirthMatchedType === "gpu-process" &&
        !blankGpuBirths.some(row => row.pid === process.pid && row.parentPid === process.parentPid &&
          Math.abs(Date.parse(row.createdAt) - Date.parse(process.createdAt)) < 1)),
      cleanupPrivateBytes: run.cleanupPrivateBytes, cleanupDeltaFromLoadedMiB: run.cleanupDeltaFromLoadedMiB,
      cleanupStable, cleanupRepresentativeTimestamp: endpoint.timestamp,
      cleanupProcesses: endpoint.processes, cleanupRealms: endpoint.realms };
  });
  const elapsed = runs.map(run => run.elapsedMs).sort((a, b) => a - b);
  records.push({ proof: file, proofSha256: sha(bytes), rawReport: entry, mode: proof.mode,
    fixtureSha256: proof.fixture.sha256, buildProof: proof.buildProof, sourcePins: proof.sourcePins,
    passed: raw.passed, checks: raw.checks, browser: raw.browser,
    blankBaseline: raw.blankBaseline, loadedIdle: raw.loadedIdle, peakPrivateBytes: raw.peakPrivateBytes,
    incrementalPrivateMiB: raw.incrementalPrivateMiB, cleanupRecoveryLimitMiB: raw.cleanupRecoveryLimitMiB,
    observedMedianElapsedMs: elapsed[1], runs,
    conversionNativeSamples: raw.nativeMemory.phases.filter(phase => /^conversion-[123]$/.test(phase.phase))
      .map(phase => ({ phase: phase.phase, validSamples: phase.validSamples, unavailableSamples: phase.unavailableSamples })),
    cancellation: raw.cancellationCheck, helpersAbsent: proof.helperProof.launches.every(row => row.absence.status === "owned-identity-absent"),
    assetsRestored: proof.assetsRestored, ownedRuntimeRemoved: proof.ownedRuntimeRemoved });
}
const [opfs, direct] = records;
assert.equal(opfs.passed, true);
assert.equal(direct.passed, false);
assert.equal(direct.checks.processTreePrivateMemory, false);
assert.ok(Object.entries(direct.checks).filter(([key]) => key !== "processTreePrivateMemory").every(([, value]) => value === true));
assert.deepEqual(direct.sourcePins, opfs.sourcePins);
assert.deepEqual(direct.buildProof, opfs.buildProof);
assert.equal(direct.fixtureSha256, opfs.fixtureSha256);
assert.ok([...opfs.runs, ...direct.runs].every(run => run.outputSha256 === opfs.runs[0].outputSha256 &&
  run.fullPcmSha256 === opfs.runs[0].fullPcmSha256 && run.artworkSha256 === opfs.runs[0].artworkSha256));
const analysis = {
  recordedAt: new Date().toISOString(), sourceSha256: sha(await readFile(new URL(import.meta.url))),
  status: "direct-three-valid-outputs-fail-full-tree-memory-no-allocation-cause-claimed",
  formula: "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory",
  limitMiB: 250, excessBytes: direct.peakPrivateBytes - direct.blankBaseline.privateBytes - 250 * 1048576,
  records, allObservedProcessesCounted: true, processExclusions: [],
  observedDirectMedianElapsedRatio: direct.observedMedianElapsedMs / opfs.observedMedianElapsedMs,
  speedComparisonCaveat: "Same fixture/build/settings; different writer and sequential clean sessions, not a randomized controlled speedup benchmark or fastest-possible proof.",
  allocationCauseEstablished: false,
  findings: [
    "All six outputs independently match full PCM, artwork and repeated AIFF bytes; direct memory failure cannot be relabelled a pass.",
    "Both observed GPU processes remain included at direct run3 peak; same-birth CIM labels enrich, never filter native process rows.",
    "Direct cleanup private memory is higher; sampled worker heaps are null, so renderer private bytes cannot be attributed to a particular JS/native allocation.",
    "Direct writer source terminates its helper on close/abort; no retained-worker leak or GPU restart cause is proven by these reports.",
  ],
  next: "No unchanged replay. Reuse existing bounded cdp-realm-memory sampler plus owned GPU/process event evidence for one explicitly diagnostic changed run; identify allocations before changing production behavior. Preserve all processes, exact stable baseline/formula, quality, full input, 250MiB and fidelity gates.",
  publicAcceptance: false, multiGigabyteScalingAcceptance: false, speedImprovementProven: false,
  protectedOriginalRead: false, newBrowserLaunched: false, processesKilled: false, noDocker: true,
};
await writeFile(path.join(root, "evidence/aiff-id3-direct-stress-analysis-2026-10-10.json"), JSON.stringify(analysis, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: analysis.status, excessBytes: analysis.excessBytes,
  incrementalPrivateMiB: direct.incrementalPrivateMiB, medianElapsedMs: records.map(record => ({ mode: record.mode, milliseconds: record.observedMedianElapsedMs })),
  extraGpuBirths: direct.runs[2].newGpuBirthsAtPeak, allocationCauseEstablished: false }));

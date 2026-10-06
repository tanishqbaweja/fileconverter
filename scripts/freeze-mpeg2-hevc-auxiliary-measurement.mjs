// Read-only reduction of actual retained browser reports. Never retry conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { summarizePlaneAuxiliaryBoundary } from "./lib/mpeg2-plane-auxiliary-boundary.mjs";
import { hevcAuxiliaryPoolBytes } from "./lib/hevc-auxiliary-pool-bytes.mjs";

const root = new URL("../", import.meta.url);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pins = {
  small: ["output/playwright/2026-10-06T00-46-09.671Z-mpeg2-artwork-metadata-37395126119-artwork.json",
    343600, "351d777345781a6112d133f9ef41489a689b7a50fe278fb43defe69007416253"],
  full: ["outputs/reports/2026-10-06T00-46-50-649Z-private-mpeg2-protected-direct-native-100ms.json",
    426566, "574966deb03a5910d2e4381b81f68f90f5a52e308a905d75b60f54a62622862e"],
};
const reports = {}, rawReports = {};
for (const [name, [file, bytes, hash]] of Object.entries(pins)) {
  const data = await readFile(new URL(file, root)); assert.equal(data.length, bytes); assert.equal(sha(data), hash);
  reports[name] = JSON.parse(data); rawReports[name] = { file, bytes, sha256: hash };
}
const { small, full } = reports, run = full.runs[0], manifest = full.manifest;
assert.deepEqual(small.manifest, manifest);
assert.equal(full.status, "failed"); assert.equal(full.diagnosticOnly, true);
assert.equal(full.requestedRuns, 1); assert.equal(full.runs.length, 1);
assert.equal(Object.keys(manifest.sources).length, 24); assert.equal(Object.keys(manifest.artifacts).length, 3);
assert.equal(manifest.nativeAllocator, "dlmalloc"); assert.equal(manifest.allocatorLifecycleSmokeAllocator, "dlmalloc");
assert.equal(manifest.frameAllocationDiagnostic, true); assert.equal(manifest.hevcAuxiliaryDiagnostic, true);
assert.equal(manifest.allocatorDiagnostic, false); assert.equal(manifest.refstructPoolDiagnosticSmoke.checkedTransitions, 9);
assert.equal(manifest.hevcAuxiliarySourceSha256, "19568e3953d4da6a5c233f717f6c6d3ad6d66c7d8a890ba3eb42e7ad0d46d691");
assert.deepEqual(full.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
assert.equal(run.state.metrics.inputBytes, 222785); assert.equal(run.state.metrics.outputBytes, 0);
assert.match(run.state.error, /size 33771520 bytes \(OOM\)/); assert.equal(run.independentValidation, null);
assert.ok(Object.values(full.cleanup).every((value) => value === true)); assert.deepEqual(full.forbiddenRequests, []);
const boundary = summarizePlaneAuxiliaryBoundary(full.allocatorSamples,
  { error: run.state.error, eventsEvicted: full.allocatorSamplesEvicted });
assert.equal(boundary.events, 89); assert.equal(boundary.auxiliaryEvents, 6);
assert.equal(boundary.sameEncoderSend, true); assert.equal(boundary.boundaryAvailable, true);
assert.equal(boundary.planeTrace.events, 83); assert.equal(boundary.planeTrace.successfulPlaneRequests, 41);
assert.equal(boundary.planeTrace.failedAllocation.plane, 2);
assert.equal(boundary.planeTrace.failedAllocation.requestedBytes, 421655);
assert.equal(boundary.actualInactiveHevcBackingBytes, 1316432);
assert.equal(boundary.actualLiveHevcBackingBytes, 6582160);
assert.deepEqual(boundary.lastBoundary.pools.map((row) =>
  [row.name, row.payloadBytes, row.backingBytesPerEntry, row.liveEntries, row.cachedEntries]),
[["tab_mvf", 1163520, 1163536, 5, 1], ["rpl_tab", 152880, 152896, 5, 1]]);
const auxiliary = full.allocatorSamples.filter((row) => row.kind === "hevc-auxiliary-pools");
for (const row of auxiliary) assert.equal(hevcAuxiliaryPoolBytes(row).available, true);
assert.deepEqual(auxiliary.map((row) => [row.sequence, row.activeDpbFrames,
  row.pools[0].liveEntries, row.pools[0].cachedEntries, row.pools[1].liveEntries, row.pools[1].cachedEntries]),
[[1, 3, 3, 0, 3, 0], [2, 4, 4, 0, 4, 0], [3, 4, 4, 1, 4, 1], [4, 4, 4, 1, 4, 1],
  [5, 5, 5, 0, 5, 0], [6, 5, 5, 1, 5, 1]]);
const cases = small.rows.filter((row) => row.outputCodec);
assert.deepEqual(cases.map((row) => [row.sourceCodec, row.frames, row.outputBytes, row.outputSha256, row.ssim]),
[["mpeg4", "48", 321692, "d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94", 0.992146],
  ["hevc", "96", 652521, "6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32", 0.985963]]);
for (const row of cases) {
  assert.equal(row.status, "passed"); assert.equal(row.metrics.peakWasmMemoryBytes, 33554432);
  for (const field of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"]) assert.equal(row.metrics[field], 65536);
  assert.equal(row.metrics.peakPendingOperations, 1);
  assert.equal(row.sourceFrameTimes.length, row.outputFrameTimes.length);
  row.outputFrameTimes.forEach((value, index) => assert.ok(Math.abs(value - row.sourceFrameTimes[index]) <= 0.001));
}
const adverse = small.rows.filter((row) => ["direct-write-failure", "cancel-after-direct-output"].includes(row.kind));
assert.equal(adverse.length, 2);
for (const row of adverse) {
  assert.equal(row.status, "passed"); assert.deepEqual(row.partialBytes, []);
  assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.queuedBytes, 0);
}
assert.equal(adverse[1].beforeCancel.outputBytes, 232344); assert.equal(adverse[1].metrics.outputBytes, 471427);
const decodedAudio = small.rows.filter((row) => row.kind === "independent-decoded-audio");
assert.equal(decodedAudio.length, 2);
for (const row of decodedAudio) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
const peak = run.nativePeaks.peak;
assert.equal(peak.privateBytes, peak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
assert.equal(run.incrementalPrivateMiB,
  (Math.max(peak.privateBytes, run.cimPeakPrivateBytes) - full.blankBaseline.privateBytes) / 1024 ** 2);
assert.equal(run.incrementalPrivateMiB, 179.3671875);
const sources = {};
for (const file of ["scripts/freeze-mpeg2-hevc-auxiliary-measurement.mjs", "scripts/lib/mpeg2-plane-auxiliary-boundary.mjs",
  "scripts/lib/hevc-auxiliary-pool-bytes.mjs", "scripts/lib/mpeg2-frame-plane-trace.mjs"])
  sources[file] = sha(await readFile(new URL(file, root)));
const proof = {
  status: "actual-idle-hevc-auxiliary-backing-at-encoder-plane-failure-not-acceptance",
  diagnosticOnly: true, publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null,
  rawReports, sources, manifest, harnessSources: full.sourceHashes,
  run: { databaseId: 37395126119, jobId: 112049169870,
    headSha: "4ca98223dec821dae04e3c4da3cab3487967a0d4", conclusion: "success",
    buildSeconds: 283, jobSeconds: 328, scope: "native build, not conversion speed" },
  actualWasmMemoryLimits: full.actualWasmMemoryLimits,
  boundary, actualScalarEvents: full.allocatorSamples,
  limits: "Measured idle backing in two pools of layer0 at THIS instrumented boundary is not contiguous free capacity or a proven saving/fit/speed gain. Five live entries in each pool must remain. Instrumented and normal allocator placement differ. DPB flag categories overlap; do not add them. Other allocations and layers are not included in this inventory.",
  small: { passedCases: 4, suiteSeconds: 17.5, cases, adverse, decodedAudio,
    actualStackReserves: small.rows.filter((row) => row.kind === "actual-native-stack-reserve"),
    outputsByteIdenticalToNormalCandidate: true, completeProcessMemoryAcceptance: false, sameInputSpeedAB: false },
  protected: { source: { bytes: full.source.bytes, sha256: full.source.sha256, width: 1920, height: 804, inputChanged: false },
    browserVersion: full.browserVersion, requestedRuns: 1, attemptedRuns: 1, completedConversions: 0,
    failedRequestedHeapEndBytes: 33771520, metrics: run.state.metrics, error: run.state.error,
    independentValidation: null, unchangedRetryUseful: false },
  memory: { formula: full.formula, limitMiB: 250, blankBaseline: full.blankBaseline, loadedIdle: full.loadedIdle,
    nativePeak: peak, cimPeakPrivateBytes: run.cimPeakPrivateBytes, incrementalPrivateMiB: run.incrementalPrivateMiB,
    validSamples: run.nativePeaks.validSamples, unavailableSamples: run.nativePeaks.unavailableSamples,
    instrumentedIncompleteConversion: true, acceptance: false, unknownProcessTypesRetained: true },
  cleanup: { ...full.cleanup, ownedPids: full.ownedPids, observedIdentities: full.nativeMemory.identities,
    runtimeDirectory: full.runtimeDirectory, independentlyVerifiedFullObservedAndOwnedPidsAbsent: 20,
    independentlyVerifiedSmallObservedPidsAbsent: 21, independentlyVerifiedSixAssetsRestored: true,
    independentlyVerifiedAdaptersAndRuntimeAbsent: true, independentlyVerifiedSmallFixturesAndRuntimeAbsent: true,
    independentlyVerifiedOriginalSha256: full.source.sha256, unrelatedProcessesKilled: false,
    deletedHostedArtifactIds: [11382702760, 11382447921], hostedArtifactsRemaining: 0,
    sourceBundleDownloaded: false, retainedLocalStaticToolFiles: 8, downloadTemporaryZipAbsent: true },
  next: "Measured1316432 idle HEVC auxiliary backing bytes justify a private single-thread final-unref cache-admission trial, not live-reference release or assured fit. Reuse the already verified generic uncached lifecycle policy only for these two HEVC pools, preserve sizes/reset/free/init/zeroing/DPB/pixels/quality/source/fixed memory, then one changed native build/small fidelity and original normal acceptance gate. No unchanged failed retry or diagnostic speed/public promotion. Full goal remains incomplete.",
};
process.stdout.write(`${JSON.stringify(proof)}\n`);

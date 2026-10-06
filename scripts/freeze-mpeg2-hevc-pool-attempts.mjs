// Read-only reduction of executed reports. Never compile or retry a conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { summarizeHevcPoolAttempts } from "./lib/hevc-pool-attempt-trace.mjs";

const root = new URL("../", import.meta.url);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const pins = {
  small: ["output/playwright/2026-10-06T01-35-36.225Z-mpeg2-artwork-metadata-37399371287-artwork.json",
    345236, "ea9953998663e5130d6ac93416913d23cca05ff50d3f55703c68cc40cd02766e"],
  full: ["outputs/reports/2026-10-06T01-36-04-553Z-private-mpeg2-protected-direct-native-100ms.json",
    475863, "19676354fdf410ade644f47fc336adca403d0f9697853e7e387e195e63270cbf"],
};
const reports = {}, rawReports = {};
for (const [name, [file, bytes, hash]] of Object.entries(pins)) {
  const data = await readFile(new URL(file, root));
  assert.equal(data.length, bytes); assert.equal(sha(data), hash);
  reports[name] = JSON.parse(data); rawReports[name] = { file, bytes, sha256: hash };
}
const { small, full } = reports, manifest = full.manifest, run = full.runs[0];
assert.deepEqual(small.manifest, manifest);
assert.equal(full.status, "failed"); assert.equal(full.diagnosticOnly, true);
assert.equal(full.requestedRuns, 1); assert.equal(full.runs.length, 1);
assert.equal(Object.keys(manifest.sources).length, 29); assert.equal(Object.keys(manifest.artifacts).length, 3);
for (const [file, hash] of Object.entries(manifest.sources))
  assert.equal(sha(await readFile(new URL(`media/ffmpeg/${file}`, root))), hash, file);
for (const [file, hash] of Object.entries(manifest.artifacts))
  assert.equal(sha(await readFile(new URL(`work/mpeg2-artwork-metadata-37399371287/${file}`, root))), hash, file);
assert.equal(manifest.nativeAllocator, "dlmalloc"); assert.equal(manifest.allocatorLifecycleSmokeAllocator, "dlmalloc");
assert.equal(manifest.allocatorDiagnostic, false); assert.equal(manifest.hevcPoolAttemptDiagnostic, true);
assert.equal(manifest.hevcAuxiliarySourceSha256, "c7c5d94d904a23d1e77cd8b78d3fdcc2d44ebfd49be4ee03d465157c32c23244");
assert.equal(manifest.hevcDecoderPatchedSourceSha256, "0c91a1622add9eaf483f6fdcf3f9eddb59d5f4540d8a526b97d60b7889de67c5");
assert.equal(manifest.refstructPoolDiagnosticSmoke.checkedTransitions, 9);
assert.equal(manifest.hevcAuxiliarySelectorSmoke.checkedConfigurations, 60);
assert.equal(manifest.encoderAccessoryLifecycleSmoke.onlyFinalReferenceReleased, true);
assert.deepEqual(full.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
assert.equal(run.state.metrics.inputBytes, 222785); assert.equal(run.state.metrics.outputBytes, 0);
assert.match(run.state.error, /size 34582528 bytes \(OOM\)/); assert.equal(run.independentValidation, null);
assert.ok(Object.values(full.cleanup).every((value) => value === true)); assert.deepEqual(full.forbiddenRequests, []);
const boundary = summarizeHevcPoolAttempts(full.allocatorSamples,
  { error: run.state.error, eventsEvicted: full.allocatorSamplesEvicted });
assert.equal(boundary.events, 146); assert.equal(boundary.poolEvents, 44);
assert.equal(boundary.completedRequests, 18); assert.equal(boundary.successfulRequests, 18);
assert.equal(boundary.completePrefix, true); assert.equal(boundary.capReached, false);
assert.equal(boundary.planeTrace.successfulPlaneRequests, 51); assert.equal(boundary.planeTrace.failedAllocation, null);
assert.equal(boundary.exactFailedPool, "tab_mvf"); assert.equal(boundary.statisticsAvailable, true);
assert.equal(boundary.actualLiveBackingBytes, 6582160); assert.equal(boundary.actualInactiveBackingBytes, 0);
assert.equal(boundary.requestedEntryBackingBytes, 1163536);
assert.deepEqual(boundary.failedAttempt.pools.map((row) =>
  [row.name, row.payloadBytes, row.backingBytesPerEntry, row.liveEntries, row.cachedEntries]),
[["tab_mvf", 1163520, 1163536, 5, 0], ["rpl_tab", 152880, 152896, 5, 0]]);
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
assert.equal(adverse[1].beforeCancel.outputBytes, 349012); assert.equal(adverse[1].metrics.outputBytes, 599048);
const decodedAudio = small.rows.filter((row) => row.kind === "independent-decoded-audio");
assert.equal(decodedAudio.length, 2);
for (const row of decodedAudio) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
const peak = run.nativePeaks.peak;
assert.equal(peak.privateBytes, peak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
assert.equal(run.incrementalPrivateMiB,
  (Math.max(peak.privateBytes, run.cimPeakPrivateBytes) - full.blankBaseline.privateBytes) / 1024 ** 2);
assert.equal(run.incrementalPrivateMiB, 187.04296875);
assert.equal(run.nativePeaks.validSamples, 29); assert.equal(run.nativePeaks.unavailableSamples, 0);
const sources = {};
for (const file of ["scripts/freeze-mpeg2-hevc-pool-attempts.mjs", "scripts/lib/hevc-pool-attempt-trace.mjs",
  "scripts/lib/hevc-auxiliary-pool-bytes.mjs", "scripts/lib/mpeg2-frame-plane-trace.mjs"])
  sources[file] = sha(await readFile(new URL(file, root)));
const proof = {
  status: "actual-hevc-motion-vector-pool-failure-zero-idle-backing-not-acceptance",
  diagnosticOnly: true, publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null,
  rawReports, sources, manifest, harnessSources: full.sourceHashes,
  run: { databaseId: 37399371287, jobId: 112062866531,
    headSha: "21cf48044962bddc2aebb0e5f4f49a9e93f53d12", conclusion: "success",
    buildSeconds: 282, jobSeconds: 329, scope: "native build, not conversion speed" },
  actualWasmMemoryLimits: full.actualWasmMemoryLimits,
  boundary, actualScalarEvents: full.allocatorSamples,
  limits: "Exactly this instrumented layer0 pre-get: five live entries in each auxiliary pool, zero cached entries. Required live references must remain. No all-layer inventory, free-block capacity, runtime saving, normal-core placement or speed claim; DPB flag categories overlap and omit newly allocated unflagged frames.",
  small: { passedCases: 4, suiteSeconds: 17.6, cases, adverse, decodedAudio,
    actualStackReserves: small.rows.filter((row) => row.kind === "actual-native-stack-reserve"),
    outputsByteIdenticalToNormalCandidate: true, sameInputSpeedAB: false, completeProcessMemoryAcceptance: false },
  protected: { source: { bytes: full.source.bytes, sha256: full.source.sha256, width: 1920, height: 804, inputChanged: false },
    browserVersion: full.browserVersion, requestedRuns: 1, attemptedRuns: 1, completedConversions: 0,
    extendedBoundedStackDiagnostic: true, failedRequestedHeapEndBytes: 34582528,
    metrics: run.state.metrics, error: run.state.error, independentValidation: null, unchangedRetryUseful: false },
  memory: { formula: full.formula, limitMiB: 250, blankBaseline: full.blankBaseline, loadedIdle: full.loadedIdle,
    nativePeak: peak, cimPeakPrivateBytes: run.cimPeakPrivateBytes, incrementalPrivateMiB: run.incrementalPrivateMiB,
    validSamples: run.nativePeaks.validSamples, unavailableSamples: run.nativePeaks.unavailableSamples,
    instrumentedIncompleteConversion: true, acceptance: false, unknownProcessTypesRetained: true },
  cleanup: { ...full.cleanup, ownedPids: full.ownedPids, observedIdentities: full.nativeMemory.identities,
    runtimeDirectory: full.runtimeDirectory, independentlyVerifiedFullObservedAndOwnedPidsAbsent: 20,
    independentlyVerifiedSmallPidsAbsentAfterFullCleanup: 21,
    smallPidReusedByDifferentFullRunHelper: { pid: 26936, originalType: "Chrome renderer", laterType: "node wrangler helper", killedAsSmallProcess: false },
    independentlyVerifiedSixAssetsRestored: true, independentlyVerifiedAdaptersAndRuntimeAbsent: true,
    independentlyVerifiedSmallFixturesAndRuntimeAbsent: true, independentlyVerifiedOriginalSha256: full.source.sha256,
    unrelatedProcessesKilled: false, deletedHostedArtifactIds: [11385110461, 11384805868], hostedArtifactsRemaining: 0,
    sourceBundleDownloaded: false, retainedLocalStaticToolFiles: 8, downloadTemporaryZipAbsent: true,
    retainedCompactFailureTraceBytes: 14592 },
  next: "Do not retry this unchanged combined32MiB module or trim empty caches/drop live HEVC references. Investigate bounded decoder/encoder separation with a single reusable frame bridge and preserved 1920x804 source, timing, audio/artwork/metadata, fixed module limits, privacy and full-tree250MiB gate. Source audit and a working small split prototype precede any changed native build/original run. Separation is not implemented or proven to fit; no uniform heap increase or lowered quality. Full goal remains incomplete.",
};
process.stdout.write(`${JSON.stringify(proof)}\n`);

// Read-only reduction of executed reports; no compile or conversion retry.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url), sha = (value) => createHash("sha256").update(value).digest("hex");
const pins = {
  small: ["output/playwright/2026-10-06T01-07-30.039Z-mpeg2-artwork-metadata-37397131884-artwork.json",
    346273, "d501dc17240ebfc4acf414cfa0fc3d39b1eec476d311ac2628d8de646c5e742e"],
  full: ["outputs/reports/2026-10-06T01-08-34-132Z-private-mpeg2-protected-direct-native-100ms.json",
    277480, "ce193ab31a8c3eb6185c33ed0d646659f529de331454befe4e7fba07587b7ad5"],
};
const reports = {}, rawReports = {};
for (const [name, [file, bytes, hash]] of Object.entries(pins)) {
  const data = await readFile(new URL(file, root)); assert.equal(data.length, bytes); assert.equal(sha(data), hash);
  reports[name] = JSON.parse(data); rawReports[name] = { file, bytes, sha256: hash };
}
const { small, full } = reports, manifest = full.manifest, run = full.runs[0];
assert.deepEqual(small.manifest, manifest);
assert.equal(full.status, "failed"); assert.equal(full.diagnosticOnly, false);
assert.equal(full.requestedRuns, 3); assert.equal(full.runs.length, 1);
assert.equal(Object.keys(manifest.sources).length, 27); assert.equal(Object.keys(manifest.artifacts).length, 3);
for (const [file, hash] of Object.entries(manifest.sources))
  assert.equal(sha(await readFile(new URL(`media/ffmpeg/${file}`, root))), hash, file);
for (const [file, hash] of Object.entries(manifest.artifacts))
  assert.equal(sha(await readFile(new URL(`work/mpeg2-artwork-metadata-37397131884/${file}`, root))), hash, file);
assert.equal(manifest.nativeAllocator, "dlmalloc"); assert.equal(manifest.allocatorLifecycleSmokeAllocator, "dlmalloc");
assert.equal(manifest.allocatorDiagnostic, false); assert.equal(manifest.frameAllocationDiagnostic, false);
assert.equal(manifest.hevcAuxiliaryDiagnostic, false);
assert.equal(manifest.hevcDecoderPatchedSourceSha256, "0c91a1622add9eaf483f6fdcf3f9eddb59d5f4540d8a526b97d60b7889de67c5");
assert.equal(manifest.hevcAuxiliarySelectorSmoke.checkedConfigurations, 60);
assert.equal(manifest.encoderAccessoryLifecycleSmoke.onlyFinalReferenceReleased, true);
assert.equal(manifest.generatedWrapperSourceSha256, "5650af19401766cf941bc95c221ff6b03c87192476bc10eacd7e6e47d1e0c88d");
assert.deepEqual(full.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
assert.equal(run.state.metrics.inputBytes, 222785); assert.equal(run.state.metrics.outputBytes, 0);
assert.equal(run.independentValidation, null);
assert.match(run.state.error, /size 34426880 bytes \(OOM\)/);
assert.match(run.state.error, /av_refstruct_pool_get/); assert.match(run.state.error, /alloc_frame/);
assert.ok(Object.values(full.cleanup).every((value) => value === true)); assert.deepEqual(full.forbiddenRequests, []);
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
  assert.equal(row.metrics.queuedBytes, 0); assert.equal(row.metrics.pendingOperations, 0);
}
assert.equal(adverse[1].beforeCancel.outputBytes, 232344); assert.equal(adverse[1].metrics.outputBytes, 599048);
const decodedAudio = small.rows.filter((row) => row.kind === "independent-decoded-audio");
assert.equal(decodedAudio.length, 2);
for (const row of decodedAudio) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
const peak = run.nativePeaks.peak;
assert.equal(peak.privateBytes, peak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
assert.equal(run.incrementalPrivateMiB,
  (Math.max(peak.privateBytes, run.cimPeakPrivateBytes) - full.blankBaseline.privateBytes) / 1024 ** 2);
assert.equal(run.incrementalPrivateMiB, 188.96875);
assert.equal(run.nativePeaks.validSamples, 26); assert.equal(run.nativePeaks.unavailableSamples, 0);
const proof = {
  status: "actual-two-hevc-pool-admission-trial-small-pass-protected-allocation-failure",
  diagnosticOnly: false, publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null,
  rawReports, sources: { "scripts/freeze-mpeg2-hevc-auxiliary-trial.mjs": sha(await readFile(new URL("scripts/freeze-mpeg2-hevc-auxiliary-trial.mjs", root))) },
  manifest, harnessSources: full.sourceHashes,
  run: { databaseId: 37397131884, jobId: 112055657628,
    headSha: "cb9ec7654e6c42985a5155ec5c5d97fd803966b0", conclusion: "success",
    buildSeconds: 194, jobSeconds: 218, scope: "native build, not conversion speed" },
  actualWasmMemoryLimits: full.actualWasmMemoryLimits,
  small: { passedCases: 4, suiteSeconds: 18.0, cases, adverse, decodedAudio,
    actualStackReserves: small.rows.filter((row) => row.kind === "actual-native-stack-reserve"),
    outputsByteIdenticalToNormalCandidate: true, sameInputSpeedAB: false, completeProcessMemoryAcceptance: false },
  protected: { source: { bytes: full.source.bytes, sha256: full.source.sha256, width: 1920, height: 804, inputChanged: false },
    browserVersion: full.browserVersion, requestedRuns: 3, attemptedRuns: 1, completedConversions: 0,
    failedRequestedHeapEndBytes: 34426880, metrics: run.state.metrics, error: run.state.error,
    independentValidation: null, unchangedRetryUseful: false },
  allocation: { actualStack: "av_malloc -> av_refstruct_pool_get -> HEVC alloc_frame",
    exactFailedPool: null, simultaneousLiveEntries: null, simultaneousCachedEntries: null,
    inactiveBackingBytesAtFailure: null, contiguousFreeBlockCapacity: null, measuredRuntimeSavingsBytes: null,
    safeLiveReferenceRemoval: false,
    limits: "This normal build has no allocation observer. Pinned HEVC refs.c has tab_mvf and rpl_tab pool gets; this stack does not distinguish them. Earlier layer0 cached backing belongs to a different instrumented build and cannot be transferred here. Requested heap end is not a contiguous-capacity or savings measurement." },
  memory: { formula: full.formula, limitMiB: 250, blankBaseline: full.blankBaseline, loadedIdle: full.loadedIdle,
    nativePeak: peak, cimPeakPrivateBytes: run.cimPeakPrivateBytes, incrementalPrivateMiB: run.incrementalPrivateMiB,
    validSamples: run.nativePeaks.validSamples, unavailableSamples: run.nativePeaks.unavailableSamples,
    incompleteConversion: true, acceptance: false, unknownProcessTypesRetained: true },
  cleanup: { ...full.cleanup, ownedPids: full.ownedPids, observedIdentities: full.nativeMemory.identities,
    runtimeDirectory: full.runtimeDirectory, independentlyVerifiedFullObservedAndOwnedPidsAbsent: 19,
    independentlyVerifiedSmallObservedPidsAbsent: 21, independentlyVerifiedSixAssetsRestored: true,
    independentlyVerifiedAdaptersAndRuntimeAbsent: true, independentlyVerifiedSmallFixturesAndRuntimeAbsent: true,
    independentlyVerifiedOriginalSha256: full.source.sha256, unrelatedProcessesKilled: false,
    deletedHostedArtifactIds: [11384415314, 11384440294], hostedArtifactsRemaining: 0,
    sourceBundleDownloaded: false, retainedLocalStaticToolFiles: 7, downloadTemporaryZipAbsent: true },
  next: "No unchanged normal retry or further assumed cache savings. Bound read-only pre/post measurement at the two actual HEVC pool-get call sites, retaining the shared diagnostic event cap and original heap/source/quality/live refs; distinguish failed pool and live versus inactive at allocation. Consider bounded decoder/encoder separation if required live working sets cannot overlap within the current module. Full goal remains incomplete.",
};
process.stdout.write(`${JSON.stringify(proof)}\n`);

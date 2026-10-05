// Freeze executed normal-core evidence before any next allocation/I/O edit.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url), sha = (b) => createHash("sha256").update(b).digest("hex");
const smallFile = "output/playwright/2026-10-05T18-22-34.923Z-mpeg2-artwork-metadata-37354667903-artwork.json";
const fullFile = "outputs/reports/2026-10-05T18-23-28-963Z-private-mpeg2-protected-direct-native-100ms.json";
const [smallRaw, fullRaw] = await Promise.all([smallFile, fullFile].map((f) => readFile(new URL(f, root))));
assert.equal(smallRaw.length, 334577); assert.equal(fullRaw.length, 266142);
assert.equal(sha(smallRaw), "c6e1e7cc90c17e33425cdeb6476e7cbcd45b26f289228c52851dd3c7638c6eae");
assert.equal(sha(fullRaw), "e3109d98a3d140088c16385e0805783b3323eb3e8eb48b1469ca1bbe094ccdad");
const small = JSON.parse(smallRaw), full = JSON.parse(fullRaw), run = full.runs[0];
assert.equal(full.status, "failed"); assert.equal(full.diagnosticOnly, false);
assert.equal(full.requestedRuns, 3); assert.equal(full.runs.length, 1);
assert.match(run.state.error, /size 33902168 bytes \(OOM\)/);
assert.match(run.state.error, /av_refstruct_pool_get[\s\S]*alloc_frame/);
assert.equal(run.state.metrics.inputBytes, 353857); assert.equal(run.state.metrics.outputBytes, 0);
assert.equal(run.independentValidation, null); assert.equal(full.allocatorSamples.length, 0);
assert.deepEqual(small.manifest, full.manifest);
assert.equal(full.manifest.encoderAccessoryLifecycleSmoke.status, "passed");
assert.equal(full.manifest.refstructSourceSha256, "e31af1df1e6e7b60b9112e2fcd22917664bc365d65db6c1d2b7038f5d532e084");
const cases = small.rows.filter((r) => r.outputCodec);
assert.equal(cases.length, 2);
assert.deepEqual(cases.map((x) => [x.sourceCodec, x.frames, x.outputBytes, x.outputSha256, x.ssim]), [
  ["mpeg4", "48", 321692, "d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94", 0.992146],
  ["hevc", "96", 652521, "6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32", 0.985963],
]);
for (const c of cases) {
  assert.equal(c.status, "passed"); assert.equal(c.metrics.peakWasmMemoryBytes, 33554432);
  assert.ok(c.metrics.maxReadChunkBytes <= 262144 && c.metrics.maxWriteChunkBytes <= 262144);
  assert.equal(c.metrics.peakPendingOperations, 1); assert.equal(c.sourceFrameTimes.length, c.outputFrameTimes.length);
  c.outputFrameTimes.forEach((time, i) => assert.ok(Math.abs(time - c.sourceFrameTimes[i]) <= 0.001));
}
const adverse = small.rows.filter((x) => ["direct-write-failure", "cancel-after-direct-output"].includes(x.kind));
assert.equal(adverse.length, 2);
for (const a of adverse) {
  assert.equal(a.status, "passed"); assert.deepEqual(a.partialBytes, []);
  assert.equal(a.metrics.queuedBytes, 0); assert.equal(a.metrics.pendingOperations, 0);
}
assert.equal(adverse[1].beforeCancel.outputBytes, 349012); assert.equal(adverse[1].terminalState, "cancelled");
assert.equal(adverse[1].metrics.outputBytes, 732122);
const decodedAudio = small.rows.filter((x) => x.kind === "independent-decoded-audio");
assert.equal(decodedAudio.length, 2);
for (const row of decodedAudio) assert.deepEqual(row.outputDecodedAudioHashes, row.sourceDecodedAudioHashes);
assert.ok(Object.values(full.cleanup).every((x) => x === true)); assert.deepEqual(full.forbiddenRequests, []);
const peak = run.nativePeaks.peak;
assert.equal(peak.privateBytes, peak.processes.reduce((n, p) => n + p.privateBytes, 0));
assert.equal(run.incrementalPrivateMiB, (Math.max(peak.privateBytes, run.cimPeakPrivateBytes) - full.blankBaseline.privateBytes) / 1024 ** 2);
assert.equal(run.incrementalPrivateMiB, 196.25390625);
const proof = {
  status: "uncached-encoder-accessories-small-fidelity-passes-original-heap-still-fails",
  publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null,
  run: { databaseId: 37354667903, jobId: 111913922329, headSha: "6715eab12e48a9a8b4fd2a23c481559ae822f11b",
    conclusion: "success", buildSeconds: 246, jobSeconds: 295, scope: "build time, not conversion speed" },
  rawReports: { small: { file: smallFile, bytes: smallRaw.length, sha256: sha(smallRaw) },
    full: { file: fullFile, bytes: fullRaw.length, sha256: sha(fullRaw) } },
  manifest: full.manifest, actualWasmMemoryLimits: full.actualWasmMemoryLimits, harnessSources: full.sourceHashes,
  reducerSources: Object.fromEntries(await Promise.all(["scripts/freeze-mpeg2-accessory-candidate.mjs"].map(async (f) =>
    [f, sha(await readFile(new URL(f, root)))]))),
  small: { passedCases: 4, suiteSeconds: 27.7, cases, adverse,
    independent: small.rows.filter((x) => x.nativeFullDecodePassed !== undefined
      || ["attached-picture-preservation", "independent-decoded-audio", "copied-audio-timing-passed", "independent-presentation-timeline-passed"].includes(x.kind))
      .map(({ sourceProbe, outputProbe, ...rest }) => ({ ...rest,
        ...(sourceProbe ? { sourceStreamCount: sourceProbe.streams.length, outputStreamCount: outputProbe.streams.length } : {}) })),
    actualStackReserves: small.rows.filter((x) => x.kind === "actual-native-stack-reserve"),
    completeProcessMemoryAcceptance: false, sameInputSpeedAB: false, outputsByteIdenticalToPriorCandidate: true },
  protected: { source: { bytes: full.source.bytes, sha256: full.source.sha256, width: 1920, height: 804, inputChanged: false },
    browserVersion: full.browserVersion, requestedRuns: 3, attemptedRuns: 1, completedConversions: 0,
    metrics: run.state.metrics, independentValidation: null, error: run.state.error,
    failedRequestedHeapEndBytes: 33902168, actualEncoderCacheRetentionAfterPatch: null,
    exactFailedAuxiliaryPoolIdentity: null, unchangedRetryUseful: false },
  memory: { formula: full.formula, limitMiB: 250, blankBaseline: full.blankBaseline, loadedIdle: full.loadedIdle,
    nativePeak: peak, cimPeakPrivateBytes: run.cimPeakPrivateBytes, incrementalPrivateMiB: run.incrementalPrivateMiB,
    validSamples: run.nativePeaks.validSamples, unavailableSamples: run.nativePeaks.unavailableSamples,
    incompleteConversion: true, acceptance: false, unknownProcessTypesRetained: true },
  cleanup: { ...full.cleanup, ownedPids: full.ownedPids, observedIdentities: full.nativeMemory.identities,
    runtimeDirectory: full.runtimeDirectory, independentlyVerifiedAll20FullObservedAndOwnedPidsAbsent: true,
    independentlyVerifiedAll21SmallObservedPidsAbsent: true, smallHelperFinallyReportedStoppedAndRemoved: true,
    independentlyVerifiedSixAssetsRestored: true, independentlyVerifiedAdaptersAndRuntimeAbsent: true,
    independentlyVerifiedOriginalSha256: full.source.sha256, sourceBundleDownloaded: false,
    deletedHostedArtifactIds: [11362984911, 11363808426], hostedArtifactsRemaining: 0 },
  next: "Smaller private AVIO buffers are the next scoped allocation experiment, not live-reference/codec/quality/heap/source changes. Current 256KiB input plus output reserve524288 bytes; 64KiB each would reserve131072 (393216 fewer requested bytes), but contiguous fit, later allocations and I/O-crossing performance require actual tests. Do not rerun this unchanged core. Goal remains incomplete; public assets and registry unchanged.",
};
process.stdout.write(`${JSON.stringify(proof)}\n`);

// Read-only reduction of executed 64KiB AVIO evidence. Never reruns conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = {
  small: "output/playwright/2026-10-05T18-39-50.031Z-mpeg2-artwork-metadata-37356848855-artwork.json",
  full: "outputs/reports/2026-10-05T18-45-09-615Z-private-mpeg2-protected-direct-native-100ms.json",
};
const expected = {
  small: [336844, "15bde4ac060559be28133c51f88fea7a498b8a6778d965b0ced896fb47804a0b"],
  full: [341423, "0af8ed2a8e55dbf4b1a63ed72241e76d447bf5ec25339da8a93b61fca437b164"],
};
const reports = {}, rawReports = {};
for (const [name, file] of Object.entries(files)) {
  const bytes = await readFile(new URL(file, root));
  assert.equal(bytes.length, expected[name][0]); assert.equal(sha(bytes), expected[name][1]);
  reports[name] = JSON.parse(bytes);
  rawReports[name] = { file, bytes: bytes.length, sha256: sha(bytes) };
}
const { small, full } = reports, run = full.runs[0];
assert.deepEqual(small.manifest, full.manifest);
assert.equal(full.status, "failed"); assert.equal(full.diagnosticOnly, false);
assert.equal(full.requestedRuns, 3); assert.equal(full.runs.length, 1);
assert.equal(full.manifest.allocatorDiagnostic, false);
assert.equal(full.manifest.avioInputBufferBytes, 65536); assert.equal(full.manifest.avioOutputBufferBytes, 65536);
assert.equal(full.manifest.encoderAccessoryLifecycleSmoke.status, "passed");
assert.equal(Object.keys(full.manifest.sources).length, 17);
assert.deepEqual(full.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
assert.match(run.state.error, /size 33945192 bytes \(OOM\)/);
assert.match(run.state.error, /av_buffer_allocz[\s\S]*avcodec_default_get_buffer2/);
assert.equal(run.state.metrics.inputBytes, 222785); assert.equal(run.state.metrics.outputBytes, 0);
assert.equal(run.state.metrics.maxReadChunkBytes, 65536);
assert.equal(run.independentValidation, null); assert.deepEqual(full.allocatorSamples, []);
assert.ok(Object.values(full.cleanup).every((value) => value === true));
assert.deepEqual(full.forbiddenRequests, []);
const cases = small.rows.filter((row) => row.outputCodec);
assert.deepEqual(cases.map((row) => [row.sourceCodec, row.frames, row.outputBytes, row.outputSha256, row.ssim]), [
  ["mpeg4", "48", 321692, "d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94", 0.992146],
  ["hevc", "96", 652521, "6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32", 0.985963],
]);
for (const row of cases) {
  assert.equal(row.status, "passed"); assert.equal(row.metrics.peakWasmMemoryBytes, 33554432);
  assert.equal(row.metrics.maxReadChunkBytes, 65536); assert.equal(row.metrics.maxWriteChunkBytes, 65536);
  assert.equal(row.metrics.peakQueuedBytes, 65536); assert.equal(row.metrics.peakPendingOperations, 1);
  assert.equal(row.outputFrameTimes.length, row.sourceFrameTimes.length);
  row.outputFrameTimes.forEach((time, i) => assert.ok(Math.abs(time - row.sourceFrameTimes[i]) <= 0.001));
}
const adverse = small.rows.filter((row) => ["direct-write-failure", "cancel-after-direct-output"].includes(row.kind));
assert.equal(adverse.length, 2);
for (const row of adverse) {
  assert.equal(row.status, "passed"); assert.deepEqual(row.partialBytes, []);
  assert.equal(row.metrics.queuedBytes, 0); assert.equal(row.metrics.pendingOperations, 0);
  assert.ok(row.metrics.maxReadChunkBytes <= 65536 && row.metrics.maxWriteChunkBytes <= 65536);
}
assert.equal(adverse[1].beforeCancel.outputBytes, 232344);
assert.equal(adverse[1].terminalState, "cancelled"); assert.equal(adverse[1].metrics.outputBytes, 471427);
const decoded = small.rows.filter((row) => row.kind === "independent-decoded-audio");
assert.equal(decoded.length, 2);
for (const row of decoded) assert.deepEqual(row.outputDecodedAudioHashes, row.sourceDecodedAudioHashes);
const stacks = small.rows.filter((row) => row.kind === "actual-native-stack-reserve");
assert.equal(stacks.length, 4);
for (const row of stacks) assert.deepEqual(row.samples, [{ nativeStackBytes: 262144,
  asyncifyStackBytes: 262144, stackOverflowCheck: 2, scope: "reserved-not-high-water-not-acceptance" }]);
const peak = run.nativePeaks.peak;
assert.equal(peak.privateBytes, peak.processes.reduce((sum, process) => sum + process.privateBytes, 0));
assert.equal(run.incrementalPrivateMiB,
  (Math.max(peak.privateBytes, run.cimPeakPrivateBytes) - full.blankBaseline.privateBytes) / 1024 ** 2);
assert.equal(run.incrementalPrivateMiB, 188.87890625);
const proof = {
  status: "64KiB-AVIO-small-fidelity-passes-original-frame-buffer-heap-failure",
  publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null,
  requestedReserveReductionBytes: 393216, measuredHeapSavingsBytes: null,
  run: { databaseId: 37356848855, jobId: 111921324148,
    headSha: "41cc6841f0fa57c70ec7be41f9641fed48f5f4fb", conclusion: "success",
    buildSeconds: 248, jobSeconds: 297, scope: "build time, not conversion speed" },
  rawReports, manifest: full.manifest, actualWasmMemoryLimits: full.actualWasmMemoryLimits,
  harnessSources: full.sourceHashes,
  reducerSources: { "scripts/freeze-mpeg2-avio-candidate.mjs": sha(await readFile(new URL("scripts/freeze-mpeg2-avio-candidate.mjs", root))) },
  small: { passedCases: 4, suiteSeconds: 21.7, cases, adverse,
    independent: small.rows.filter((row) => row.nativeFullDecodePassed !== undefined
      || ["attached-picture-preservation", "independent-decoded-audio", "copied-audio-timing-passed",
        "independent-presentation-timeline-passed"].includes(row.kind))
      .map(({ sourceProbe, outputProbe, ...rest }) => ({ ...rest,
        ...(sourceProbe ? { sourceStreamCount: sourceProbe.streams.length, outputStreamCount: outputProbe.streams.length } : {}) })),
    actualStackReserves: stacks, outputsByteIdenticalToPriorCandidate: true,
    sameInputSpeedAB: false, completeProcessMemoryAcceptance: false },
  protected: { source: { bytes: full.source.bytes, sha256: full.source.sha256,
    width: 1920, height: 804, inputChanged: false }, browserVersion: full.browserVersion,
    requestedRuns: 3, attemptedRuns: 1, completedConversions: 0, metrics: run.state.metrics,
    error: run.state.error, independentValidation: null, failedRequestedHeapEndBytes: 33945192,
    exactFailedPlaneOrCodecContext: null, actualEncoderCacheRetention: null,
    unchangedRetryUseful: false },
  memory: { formula: full.formula, limitMiB: 250, blankBaseline: full.blankBaseline,
    loadedIdle: full.loadedIdle, nativePeak: peak, cimPeakPrivateBytes: run.cimPeakPrivateBytes,
    incrementalPrivateMiB: run.incrementalPrivateMiB, validSamples: run.nativePeaks.validSamples,
    unavailableSamples: run.nativePeaks.unavailableSamples,
    incompleteConversion: true, acceptance: false, unknownProcessTypesRetained: true },
  cleanup: { ...full.cleanup, ownedPids: full.ownedPids, observedIdentities: full.nativeMemory.identities,
    runtimeDirectory: full.runtimeDirectory,
    independentlyVerifiedFullObservedAndOwnedPidsAbsent: 22,
    independentlyVerifiedSmallObservedPidsAbsent: 21,
    independentlyVerifiedSixAssetsRestored: true, independentlyVerifiedAdaptersAndRuntimeAbsent: true,
    independentlyVerifiedSmallFixturesAndRuntimeAbsent: true,
    independentlyVerifiedOriginalSha256: full.source.sha256, sourceBundleDownloaded: false,
    deletedHostedArtifactIds: [11365825131, 11364957204], hostedArtifactsRemaining: 0 },
  next: "One read-only allocator-diagnostic build of this changed64KiB core can identify the context/frame allocation boundary and measure accessory retention after the policy. Do not infer the failing codec or plane from truncated normal stack, reduce live references, raise heap, alter protected source/settings/quality, claim timing A/B, or retry unchanged normal core. Goal remains incomplete; no public promotion.",
};
process.stdout.write(`${JSON.stringify(proof)}\n`);

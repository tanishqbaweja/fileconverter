// Reduce executed reports only; never perform or retry a conversion.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const root = new URL("../", import.meta.url);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expected = {
  small: ["output/playwright/2026-10-05T23-50-38.165Z-mpeg2-artwork-metadata-37367996146-artwork.json",
    341942, "486a6344cd50eb5bc5d1c0f5bcdfb1f80d25d90197a16c450651bc515ca81344"],
  full: ["outputs/reports/2026-10-05T23-51-08-722Z-private-mpeg2-protected-direct-native-100ms.json",
    345112, "bc4e6316984ca5266fd6bcbfcc4b62f9e5c2947e22867f5d5c26fdf5df3cceb2"],
};
const reports = {}, rawReports = {};
for (const [key, [file, bytes, hash]] of Object.entries(expected)) {
  const data = await readFile(new URL(file, root));
  assert.equal(data.length, bytes); assert.equal(sha(data), hash);
  reports[key] = JSON.parse(data); rawReports[key] = { file, bytes, sha256: hash };
}
const { small, full } = reports, run = full.runs[0];
assert.deepEqual(small.manifest, full.manifest);
assert.equal(full.status, "failed"); assert.equal(full.diagnosticOnly, false);
assert.equal(full.requestedRuns, 3); assert.equal(full.runs.length, 1);
assert.equal(full.manifest.decoderSet, "hevc-mpeg4");
assert.deepEqual(full.manifest.enabledDecoders, ["h263", "hevc", "mpeg4"]);
assert.equal(full.manifest.nativeAllocator, "dlmalloc");
assert.equal(full.manifest.allocatorDiagnostic, false);
assert.equal(full.manifest.allocatorLifecycleSmokeAllocator, "dlmalloc");
assert.equal(Object.keys(full.manifest.sources).length, 19);
assert.equal(Object.keys(full.manifest.artifacts).length, 3);
for (const [file, hash] of Object.entries(full.manifest.sources))
  assert.equal(sha(await readFile(new URL(`media/ffmpeg/${file}`, root))), hash);
assert.equal(full.manifest.initialWasmMemoryBytes, 33554432);
assert.equal(full.manifest.maximumWasmMemoryBytes, 33554432);
assert.equal(full.manifest.allowMemoryGrowth, false);
assert.deepEqual(full.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
assert.match(run.state.error, /size 33783808 bytes \(OOM\)/);
assert.match(run.state.error, /emscripten_builtin_malloc[\s\S]*dlposix_memalign[\s\S]*av_buffer_allocz[\s\S]*avcodec_default_get_buffer2/);
assert.equal(run.state.metrics.inputBytes, 222785); assert.equal(run.state.metrics.outputBytes, 0);
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
  for (const key of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"]) assert.equal(row.metrics[key], 65536);
  assert.equal(row.metrics.peakPendingOperations, 1);
  assert.equal(row.sourceFrameTimes.length, row.outputFrameTimes.length);
  row.outputFrameTimes.forEach((time, i) => assert.ok(Math.abs(time - row.sourceFrameTimes[i]) <= 0.001));
}
const adverse = small.rows.filter((row) => ["direct-write-failure", "cancel-after-direct-output"].includes(row.kind));
assert.equal(adverse.length, 2);
for (const row of adverse) {
  assert.equal(row.status, "passed"); assert.deepEqual(row.partialBytes, []);
  assert.equal(row.metrics.queuedBytes, 0); assert.equal(row.metrics.pendingOperations, 0);
}
assert.equal(adverse[1].beforeCancel.outputBytes, 232344);
assert.equal(adverse[1].metrics.outputBytes, 471427); assert.equal(adverse[1].terminalState, "cancelled");
const decoded = small.rows.filter((row) => row.kind === "independent-decoded-audio");
assert.equal(decoded.length, 2);
for (const row of decoded) assert.deepEqual(row.outputDecodedAudioHashes, row.sourceDecodedAudioHashes);
const stacks = small.rows.filter((row) => row.kind === "actual-native-stack-reserve");
assert.equal(stacks.length, 4);
for (const row of stacks) assert.deepEqual(row.samples, [{ nativeStackBytes: 262144,
  asyncifyStackBytes: 262144, stackOverflowCheck: 2, scope: "reserved-not-high-water-not-acceptance" }]);
const { stdout } = await promisify(execFile)(process.execPath, ["scripts/audit-mpeg2-static-layout.mjs",
  "mpeg2-artwork-metadata-37364583311", "mpeg2-artwork-metadata-37367996146"],
{ cwd: root, windowsHide: true, maxBuffer: 64 * 1024 });
const staticLayout = JSON.parse(stdout);
assert.deepEqual(staticLayout.rows.map((row) => [row.fileBytes, row.passivePayloadBytes, row.stackEnd, row.stackBase]),
  [[7228748, 400158, 1979984, 2242128], [4856513, 336065, 1822912, 2085056]]);
const peak = run.nativePeaks.peak;
assert.equal(peak.privateBytes, peak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
assert.equal(run.incrementalPrivateMiB,
  (Math.max(peak.privateBytes, run.cimPeakPrivateBytes) - full.blankBaseline.privateBytes) / 1024 ** 2);
assert.equal(run.incrementalPrivateMiB, 186.0390625);
const fullPids = new Set([...full.nativeMemory.identities.map((row) => row.pid),
  ...full.samples.flatMap((sample) => (sample.processes ?? []).map((row) => row.pid)), ...Object.values(full.ownedPids)]);
const smallPids = new Set(small.rows.flatMap((row) => (row.samples ?? []).flatMap((sample) => (sample.processes ?? []).map((p) => p.pid))));
assert.equal(fullPids.size, 21); assert.equal(smallPids.size, 22);
const sources = {};
for (const file of ["scripts/freeze-mpeg2-decoder-module.mjs", "scripts/audit-mpeg2-static-layout.mjs",
  "media/ffmpeg/mpeg2-decoder-selection.mjs"])
  sources[file] = sha(await readFile(new URL(file, root)));
const proof = {
  status: "specialist-small-fidelity-passes-original-frame-buffer-heap-failure",
  publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null, measuredHeapSavingsBytes: null,
  run: { databaseId: 37367996146, jobId: 111957771738,
    headSha: "41e0384b1ad815a30487946b6d70fa587dbbe08b", conclusion: "success",
    buildSeconds: 279, jobSeconds: 329, scope: "build time, not conversion speed" },
  rawReports, sources, manifest: full.manifest, harnessSources: full.sourceHashes,
  staticLayout, boundaryReductionBytes: 157072,
  staticLimitations: "Smaller file/code and lower linker bounds are not measured runtime heap savings, free-block capacity, conversion speed or complete-browser acceptance. Heap base and exact failed plane/context remain null. Broad/default nine-decoder module retained.",
  small: { passedCases: 4, suiteSeconds: 19.7, cases, adverse, decodedAudio: decoded,
    independent: small.rows.filter((row) => row.nativeFullDecodePassed !== undefined
      || ["attached-picture-preservation", "copied-audio-timing-passed", "independent-presentation-timeline-passed"].includes(row.kind))
      .map(({ sourceProbe, outputProbe, ...rest }) => ({ ...rest,
        ...(sourceProbe ? { sourceStreamCount: sourceProbe.streams.length, outputStreamCount: outputProbe.streams.length } : {}) })),
    actualStackReserves: stacks, outputsByteIdenticalToWideCandidate: true,
    sameInputSpeedAB: false, completeProcessMemoryAcceptance: false },
  protected: { source: { bytes: full.source.bytes, sha256: full.source.sha256, width: 1920, height: 804, inputChanged: false },
    browserVersion: full.browserVersion, requestedRuns: 3, attemptedRuns: 1, completedConversions: 0,
    metrics: run.state.metrics, error: run.state.error, failedRequestedHeapEndBytes: 33783808,
    independentValidation: null, exactFailedPlaneOrCodecContext: null, actualEncoderCacheRetention: null,
    contiguousFreeBlockCapacity: null, unchangedRetryUseful: false },
  memory: { formula: full.formula, limitMiB: 250, blankBaseline: full.blankBaseline, loadedIdle: full.loadedIdle,
    nativePeak: peak, cimPeakPrivateBytes: run.cimPeakPrivateBytes, incrementalPrivateMiB: run.incrementalPrivateMiB,
    validSamples: run.nativePeaks.validSamples, unavailableSamples: run.nativePeaks.unavailableSamples,
    incompleteConversion: true, acceptance: false, unknownProcessTypesRetained: true },
  cleanup: { ...full.cleanup, ownedPids: full.ownedPids, observedIdentities: full.nativeMemory.identities,
    runtimeDirectory: full.runtimeDirectory, independentlyVerifiedFullObservedAndOwnedPidsAbsent: 21,
    independentlyVerifiedSmallObservedPidsAbsent: 22, independentlyVerifiedSixAssetsRestored: true,
    independentlyVerifiedAdaptersAndRuntimeAbsent: true, independentlyVerifiedSmallFixturesAndRuntimeAbsent: true,
    independentlyVerifiedOriginalSha256: full.source.sha256, sourceBundleDownloaded: false,
    deletedHostedArtifactIds: [11368414042, 11368384228], hostedArtifactsRemaining: 0,
    retainedLocalStaticToolFiles: 7, downloadTemporaryZipAbsent: true },
  next: "Actual specialist static footprint is smaller but the unchanged original source still fails at a frame-buffer allocation. No unchanged retry or decoder-only fit assumption. Identify the exact failed allocation/codec context with bounded read-only instrumentation before another allocator/codec-policy change; preserve all live references, source/settings/quality/fixed heap and complete-process gate. Broad module/public engines retained. Full goal remains incomplete.",
};
process.stdout.write(`${JSON.stringify(proof)}\n`);

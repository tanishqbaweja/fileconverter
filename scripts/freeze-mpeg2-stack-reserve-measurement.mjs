// Read-only report reduction: stdout only; never creates or converts media.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const report = async (file) => {
  const bytes = await readFile(new URL(file, root));
  assert.ok(bytes.length < 1024 * 1024);
  return { raw: { file, bytes: bytes.length, sha256: sha(bytes) }, data: JSON.parse(bytes) };
};
const small = await report("output/playwright/2026-10-05T15-53-08.135Z-mpeg2-artwork-metadata-37334670866-artwork.json");
const large = await report("outputs/reports/2026-10-05T15-54-05-806Z-private-mpeg2-protected-direct-native-100ms.json");
const s = small.data, r = large.data, run = r.runs[0];
assert.equal(r.status, "failed"); assert.equal(r.diagnosticOnly, false);
assert.equal(r.requestedRuns, 3); assert.equal(r.runs.length, 1);
assert.equal(r.publicAcceptance, false); assert.equal(run.independentValidation, null);
assert.equal(run.state.jobState, "error"); assert.equal(run.state.metrics.outputBytes, 0);
assert.equal(run.state.metrics.inputBytes, 288321);
assert.match(run.state.error, /size 33902168 bytes \(OOM\)/);
assert.match(run.state.error, /av_refstruct_pool_get/); assert.match(run.state.error, /alloc_frame/);
assert.ok(Object.values(r.cleanup).every((v) => v === true));
assert.deepEqual(r.forbiddenRequests, []); assert.deepEqual(r.allocatorSamples, []);
assert.equal(r.source.bytes, 2958573265);
assert.equal(r.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.deepEqual(s.manifest, r.manifest);
assert.equal(r.manifest.nativeStackBytes, 262144); assert.equal(r.manifest.asyncifyStackBytes, 262144);
assert.equal(r.manifest.stackOverflowCheck, 2); assert.equal(r.manifest.allocatorDiagnostic, false);
assert.equal(r.manifest.sources["mpeg2-candidate.c"], "67d3b8299a9e695ea68f96fdcc51d3f5ba5a694547b3f8288e740990c5f7eac0");
assert.deepEqual(r.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
const reserves = s.rows.filter((x) => x.kind === "actual-native-stack-reserve");
assert.equal(reserves.length, 4);
for (const row of reserves) {
  assert.ok(row.samples.length > 0 && row.samples.length <= 16);
  for (const sample of row.samples) assert.deepEqual(sample, {
    nativeStackBytes: 262144, asyncifyStackBytes: 262144, stackOverflowCheck: 2,
    scope: "reserved-not-high-water-not-acceptance",
  });
}
assert.ok(r.logs.some((line) => line.startsWith("WITHIN_MPEG2_STACK_RESERVE ")));
const encoded = s.rows.filter((x) => x.container && x.status === "passed");
assert.equal(encoded.length, 2);
const previous = JSON.parse(await readFile(new URL("output/playwright/2026-10-05T11-50-19.300Z-mpeg2-artwork-metadata-37302858907-artwork.json", root)));
for (const row of encoded) {
  const before = previous.rows.find((x) => x.status === "passed" && x.sourceCodec === row.sourceCodec);
  assert.equal(row.outputSha256, before.outputSha256); assert.equal(row.outputBytes, before.outputBytes);
  assert.equal(row.outputCodec, "mpeg2video"); assert.ok(row.ssim >= 0.98);
  assert.equal(row.metrics.peakWasmMemoryBytes, 33554432);
  const decode = s.rows.find((x) => x.kind === "independent-frame-diagnostic" && x.sourceBytes === row.sourceBytes);
  assert.equal(decode.nativeFullDecodePassed, true);
  const pcm = s.rows.find((x) => x.kind === "independent-decoded-audio" && x.sourceCodec === row.sourceCodec);
  assert.deepEqual(pcm.sourceDecodedAudioHashes, pcm.outputDecodedAudioHashes);
  assert.ok(s.rows.some((x) => x.kind === "independent-presentation-timeline-passed" && x.sourceCodec === row.sourceCodec));
}
const adverse = s.rows.filter((x) => ["direct-write-failure", "cancel-after-direct-output"].includes(x.kind));
assert.equal(adverse.length, 2);
for (const row of adverse) {
  assert.equal(row.status, "passed"); assert.deepEqual(row.partialBytes, []);
  assert.equal(row.metrics.queuedBytes, 0); assert.equal(row.metrics.pendingOperations, 0);
}
const peak = run.nativePeaks.peak;
assert.equal(peak.processes.reduce((sum, p) => sum + p.privateBytes, 0), peak.privateBytes);
assert.equal(run.incrementalPrivateMiB, (Math.max(run.cimPeakPrivateBytes, peak.privateBytes) - r.blankBaseline.privateBytes) / 1024 ** 2);
assert.equal(run.incrementalPrivateMiB, 187.6875);
const executionFiles = ["scripts/freeze-mpeg2-stack-reserve-measurement.mjs",
  "scripts/validate-mpeg2-artwork.mjs", "scripts/stage-mpeg2-artwork-candidate.mjs",
  "tests/browser/mpeg2-artwork-candidate.spec.ts", "scripts/lib/small-matroska-mp4-timeline.mjs"];
const proof = {
  status: "guarded-reserves-small-fidelity-passed-full-original-heap-failed-not-accepted",
  publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null,
  run: { databaseId: 37334670866, jobId: 111846316277,
    headSha: "7a9a1f05fa381cfdce4b51b9e39478e44877b0b0", conclusion: "success",
    buildSeconds: 194, jobSeconds: 246, scope: "build time, not conversion speed",
    url: "https://github.com/tanishqbaweja/fileconverter/actions/runs/37334670866" },
  manifest: r.manifest, actualWasmMemoryLimits: r.actualWasmMemoryLimits,
  source: { bytes: r.source.bytes, sha256: r.source.sha256, width: 1920, height: 804,
    codec: "hevc", inputChanged: false },
  harnessSources: r.sourceHashes,
  reductionSources: Object.fromEntries(await Promise.all(executionFiles.map(async (file) =>
    [file, sha(await readFile(new URL(file, root)))]))),
  small: { rawReport: small.raw, passed: 4, suiteSeconds: 20.2,
    scope: "Small fixture fidelity/adverse checks; NOT large-source or stable-baseline memory acceptance",
    encoded: encoded.map((x) => ({ sourceCodec: x.sourceCodec, outputCodec: x.outputCodec,
      sourceBytes: x.sourceBytes, outputBytes: x.outputBytes, outputSha256: x.outputSha256,
      frames: Number(x.frames), audioTracks: x.audioTracks, ssim: x.ssim, metrics: x.metrics,
      identicalToPreviousOutput: true, completeDecodedAudioHashesEqual: true, fullDecode: true })),
    presentationTimelines: s.rows.filter((x) => x.kind === "independent-presentation-timeline-passed"),
    audioTiming: s.rows.filter((x) => x.kind === "copied-audio-timing-passed"),
    reserves, adverse,
    observedPids: [...new Set(s.rows.flatMap((x) => (x.samples ?? []).flatMap((y) => (y.processes ?? []).map((p) => p.pid))))] },
  protected: { rawReport: large.raw, browserVersion: r.browserVersion,
    requestedRuns: 3, attemptedRuns: 1, completedConversions: 0,
    failedRequestedHeapEndBytes: 33902168,
    allocatorCaller: "av_refstruct_pool_get -> alloc_frame",
    exactPool: null, liveBytes: null, cachedBytes: null,
    attributionScope: "Normal stack identifies HEVC auxiliary pool caller, not exact pool or concurrent live/cached allocations",
    error: run.state.error, metrics: run.state.metrics,
    actualReserves: r.logs.filter((line) => line.startsWith("WITHIN_MPEG2_STACK_RESERVE ")),
    independentValidation: null,
    memory: { formula: r.formula, limitMiB: 250, blankBaseline: r.blankBaseline, loadedIdle: r.loadedIdle,
      nativePeak: peak, cimPeakPrivateBytes: run.cimPeakPrivateBytes,
      incrementalPrivateMiB: run.incrementalPrivateMiB,
      validSamples: run.nativePeaks.validSamples, unavailableSamples: run.nativePeaks.unavailableSamples,
      incompleteConversion: true, acceptance: false, unknownProcessTypesRetained: true },
    cleanup: r.cleanup, ownedPids: r.ownedPids, runtimeDirectory: r.runtimeDirectory,
    observedPids: [...new Set(r.nativeMemory.identities.map((p) => p.pid))], forbiddenRequests: r.forbiddenRequests },
  cleanupAudit: { independentlyVerifiedOriginalSha256: r.source.sha256,
    independentlyVerifiedAllSmallAndProtectedObservedPidsAbsent: true,
    independentlyVerifiedSixAssetsRestored: true,
    independentlyVerifiedPrivateAdaptersAndRuntimeAbsent: true,
    smallFixturesAndConvertedOutputsRemoved: true,
    sourceBundleDownloaded: false, deletedHostedArtifactIds: [11355607602, 11355827172], hostedArtifactsRemaining: 0,
    scope: "Independent shell/hash checks after this cycle; reusable six-file static candidate retained, not converted media" },
  next: "Do not repeat this unchanged normal conversion or further shrink stacks blindly. Measure the changed-layout exact auxiliary pool and live/cache demand before another optimization. Goal remains incomplete; public assets and registry unchanged.",
};
process.stdout.write(`${JSON.stringify(proof)}\n`);

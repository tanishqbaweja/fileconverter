// Read-only reduction of one actual original-file diagnostic; never converts.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { mpeg2EncoderReleaseBytes } from "./lib/mpeg2-encoder-release-bytes.mjs";
import { refstructSampleBytes } from "./lib/refstruct-sample-bytes.mjs";

const root = new URL("../", import.meta.url);
const file = "outputs/reports/2026-10-05T16-33-02-516Z-private-mpeg2-protected-direct-native-100ms.json";
const raw = await readFile(new URL(file, root)), r = JSON.parse(raw);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(raw.length, 481335);
assert.equal(sha(raw), "1212856b76f374219ff5f402248f8a846bc544d8b8857593489f01972c8fd1b5");
const run = r.runs[0], events = r.allocatorSamples;
assert.equal(r.status, "failed"); assert.equal(r.diagnosticOnly, true); assert.equal(r.publicAcceptance, false);
assert.equal(r.requestedRuns, 1); assert.equal(r.runs.length, 1); assert.equal(run.independentValidation, null);
assert.equal(run.state.metrics.outputBytes, 0); assert.equal(run.state.metrics.inputBytes, 353857);
assert.match(run.state.error, /size 33904664 bytes \(OOM\)/);
assert.equal(r.manifest.nativeStackBytes, 262144); assert.equal(r.manifest.asyncifyStackBytes, 262144);
assert.equal(r.manifest.stackOverflowCheck, 2); assert.equal(r.manifest.allocatorDiagnostic, true);
assert.equal(r.manifest.refstructPoolDiagnosticSmoke.checkedTransitions, 9);
assert.equal(events.length, 196); assert.equal(r.allocatorSamplesEvicted, 0);
const heap = events.filter((x) => !x.kind), pools = events.filter((x) => x.kind === "refstruct-pool");
const releases = events.filter((x) => x.kind === "mpeg2-encoder-pool-release");
assert.equal(heap.length, 66); assert.equal(pools.length, 125); assert.equal(releases.length, 5);
for (const group of [heap, pools, releases]) group.forEach((x, i) => assert.equal(x.sequence, i + 1));
for (const pool of pools) assert.equal(refstructSampleBytes(pool).available, true);
const releaseBytes = releases.map(mpeg2EncoderReleaseBytes);
assert.ok(releaseBytes.every((x) => x.available));
assert.deepEqual(releaseBytes.map((x) => x.requestedLiveBytes), [278222, 556444, 556444, 556444, 556444]);
assert.deepEqual(releaseBytes.map((x) => x.requestedCachedBytes), [0, 0, 278222, 278222, 278222]);
const lastReleaseIndex = events.findLastIndex((x) => x.kind === "mpeg2-encoder-pool-release");
assert.equal(lastReleaseIndex, 188);
const encoderPoolIdentities = new Set(releases.at(-1).pools.filter((x) => x.configured).map((x) => x.poolIdentity));
const following = events.slice(lastReleaseIndex + 1);
assert.equal(following.length, 7);
assert.ok(!following.some((x) => x.kind === "refstruct-pool" && encoderPoolIdentities.has(x.poolIdentity)));
assert.ok(!following.some((x) => !x.kind && x.codecId === 2 && x.phase !== 16));
const fatal = events.at(-1), previous = events.at(-2);
assert.equal(previous.phase, 18); assert.equal(previous.codecId, 173); assert.equal(previous.encoder, false);
assert.equal(fatal.phase, 19); assert.equal(fatal.poolIdentity, 3224672);
assert.equal(fatal.entryRequestedAllocationBytes, 1163536); assert.equal(fatal.entryPayloadBytes, 1163520);
assert.equal(fatal.checkedOutEntries, 5); assert.equal(fatal.cachedEntries, 0);
assert.equal(fatal.freeDynamicBytes, 295380); assert.equal(fatal.unclaimedHeapBytes, 813368);
const availableUpperBound = fatal.freeDynamicBytes + fatal.unclaimedHeapBytes;
assert.equal(fatal.entryRequestedAllocationBytes - availableUpperBound, 54788);
assert.ok(Object.values(r.cleanup).every((x) => x === true)); assert.deepEqual(r.forbiddenRequests, []);
const peak = run.nativePeaks.peak;
assert.equal(peak.processes.reduce((sum, p) => sum + p.privateBytes, 0), peak.privateBytes);
assert.equal(run.incrementalPrivateMiB, (Math.max(run.cimPeakPrivateBytes, peak.privateBytes) - r.blankBaseline.privateBytes) / 1024 ** 2);
assert.equal(run.incrementalPrivateMiB, 218.16015625);
const proof = {
  status: "inactive-encoder-accessory-retention-measured-original-conversion-still-fails",
  publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null,
  run: { databaseId: 37340665849, jobId: 111866643277,
    headSha: "47a942a6e9ab85381d8f36e5596e6d36001170ed", conclusion: "success",
    buildSeconds: 232, jobSeconds: 298, scope: "build time, not conversion speed",
    url: "https://github.com/tanishqbaweja/fileconverter/actions/runs/37340665849" },
  rawReport: { file, bytes: raw.length, sha256: sha(raw) },
  manifest: r.manifest, actualWasmMemoryLimits: r.actualWasmMemoryLimits,
  harnessSources: r.sourceHashes,
  reductionSources: Object.fromEntries(await Promise.all([
    "scripts/freeze-mpeg2-encoder-release-measurement.mjs", "scripts/lib/refstruct-sample-bytes.mjs",
    "scripts/lib/mpeg2-encoder-release-bytes.mjs",
  ].map(async (name) => [name, sha(await readFile(new URL(name, root)))]))),
  source: { bytes: r.source.bytes, sha256: r.source.sha256, width: 1920, height: 804, codec: "hevc", inputChanged: false },
  browserVersion: r.browserVersion, metrics: run.state.metrics,
  attemptedRuns: 1, completedConversions: 0, independentValidation: null,
  encoderRelease: { scope: "five named pools at a single-thread normal picture-release boundary; not global heap inventory",
    groups: releases, reducedGroups: releaseBytes, lastGroupIndex: lastReleaseIndex,
    followingOrderedEvents: following, followingEncoderPoolGetObserved: false,
    lastRequestedLiveBytes: 556444, lastRequestedCachedBytes: 278222,
    allocatorOverheadBytes: null, liveObjectsSafeToRelease: false,
    conclusion: "Only inactive MPEG2 accessory backing is a measured recovery candidate. Live encoder and HEVC references must remain. Contiguous fit, later allocations and performance are unproven." },
  allocation: { failedRequestedHeapEndBytes: 33904664,
    pool: "HEVC tab_mvf_pool", preAbortSnapshot: fatal, ...refstructSampleBytes(fatal),
    previousFrameHeapSnapshot: previous, availableFreePlusUnclaimedUpperBoundBytes: availableUpperBound,
    minimumShortfallIgnoringFragmentationAndOverheadBytes: 54788,
    allocatorOverheadBytes: null, totalConcurrentOtherPoolsBytes: null,
    unchangedRetryUseful: false, motionVectorUncachingUsefulAtMeasuredFailure: false },
  telemetry: { capturedHeapEvents: 66, capturedPoolEvents: 125, capturedEncoderReleaseGroups: 5,
    evicted: 0, nativeHeapCap: 96, nativePoolCap: 128, nativeEncoderReleaseCap: 16,
    browserCap: 240, inactiveWalkCap: 128, incompletePoolSamples: 0, capExhausted: false,
    orderedEvents: events.map((x) => x.kind === "mpeg2-encoder-pool-release" ? ["encoder-release", x.sequence]
      : x.kind ? ["pool", x.sequence, x.phase, x.poolIdentity,
        x.statisticsComplete, x.entryPayloadBytes, x.entryRequestedAllocationBytes, x.checkedOutEntries,
        x.cachedEntries, x.dynamicHeapBytes, x.freeDynamicBytes, x.unclaimedHeapBytes]
      : ["heap", x.sequence, x.phase, x.codecId, x.encoder, x.width, x.height,
        x.frameBufferBytes, x.dynamicHeapBytes, x.freeDynamicBytes, x.unclaimedHeapBytes]) },
  memory: { formula: r.formula, limitMiB: 250, blankBaseline: r.blankBaseline, loadedIdle: r.loadedIdle,
    nativePeak: peak, cimPeakPrivateBytes: run.cimPeakPrivateBytes,
    incrementalPrivateMiB: run.incrementalPrivateMiB, validSamples: run.nativePeaks.validSamples,
    unavailableSamples: run.nativePeaks.unavailableSamples, incompleteConversion: true,
    acceptance: false, unknownProcessTypesRetained: true },
  cleanup: { ...r.cleanup, ownedPids: r.ownedPids, runtimeDirectory: r.runtimeDirectory,
    observedIdentities: r.nativeMemory.identities,
    independentObservedAndOwnedPidCheck: "All 19 observed identities and 3 owned roots (21 distinct PIDs) absent on subsequent explicit Get-Process check. Earlier immediate check reported a live PID without identity output; immediate descendant absence is not claimed.",
    independentlyVerifiedAllObservedAndOwnedPidsAbsent: true,
    independentlyVerifiedSixAssetsRestored: true, independentlyVerifiedAdaptersAndRuntimeAbsent: true,
    independentlyVerifiedOriginalSha256: r.source.sha256,
    deletedHostedArtifactIds: [11358377087, 11358546684], hostedArtifactsRemaining: 0, sourceBundleDownloaded: false },
  forbiddenRequests: r.forbiddenRequests,
  next: "Test only measured inactive MPEG2 encoder accessory uncaching. No required live-reference release, HEVC auxiliary mutation, heap increase, source resizing, baseline inflation or unchanged retry. Goal remains incomplete; public engines and registry unchanged.",
};
process.stdout.write(`${JSON.stringify(proof)}\n`);

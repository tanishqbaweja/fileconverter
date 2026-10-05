// Read-only reduction of the changed-layout original-file diagnostic.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { refstructSampleBytes } from "./lib/refstruct-sample-bytes.mjs";

const root = new URL("../", import.meta.url);
const file = "outputs/reports/2026-10-05T16-08-40-097Z-private-mpeg2-protected-direct-native-100ms.json";
const raw = await readFile(new URL(file, root)), r = JSON.parse(raw);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = r.runs[0], events = r.allocatorSamples;
assert.equal(r.status, "failed"); assert.equal(r.diagnosticOnly, true); assert.equal(r.publicAcceptance, false);
assert.equal(r.requestedRuns, 1); assert.equal(r.runs.length, 1); assert.equal(run.independentValidation, null);
assert.equal(run.state.metrics.outputBytes, 0); assert.equal(run.state.metrics.inputBytes, 353857);
assert.match(run.state.error, /size 33903608 bytes \(OOM\)/);
assert.equal(r.manifest.nativeStackBytes, 262144); assert.equal(r.manifest.asyncifyStackBytes, 262144);
assert.equal(r.manifest.stackOverflowCheck, 2); assert.equal(r.manifest.allocatorDiagnostic, true);
assert.equal(r.manifest.refstructPoolDiagnosticSmoke.checkedTransitions, 9);
assert.equal(events.length, 191); assert.equal(r.allocatorSamplesEvicted, 0);
const heap = events.filter((x) => !x.kind), pools = events.filter((x) => x.kind === "refstruct-pool");
assert.equal(heap.length, 66); assert.equal(pools.length, 125);
for (const group of [heap, pools]) group.forEach((x, i) => assert.equal(x.sequence, i + 1));
for (const pool of pools) assert.equal(refstructSampleBytes(pool).available, true);
const fatal = events.at(-1), previous = events.at(-2);
assert.equal(previous.phase, 18); assert.equal(previous.codecId, 173); assert.equal(previous.encoder, false);
assert.equal(fatal.phase, 19); assert.equal(fatal.poolIdentity, 3223616);
assert.equal(fatal.entryRequestedAllocationBytes, 1163536); assert.equal(fatal.entryPayloadBytes, 1163520);
assert.equal(fatal.checkedOutEntries, 5); assert.equal(fatal.cachedEntries, 0);
assert.equal(fatal.freeDynamicBytes, 295380); assert.equal(fatal.unclaimedHeapBytes, 814424);
const availableUpperBound = fatal.freeDynamicBytes + fatal.unclaimedHeapBytes;
assert.equal(fatal.entryRequestedAllocationBytes - availableUpperBound, 53732);
assert.ok(Object.values(r.cleanup).every((x) => x === true)); assert.deepEqual(r.forbiddenRequests, []);
const peak = run.nativePeaks.peak;
assert.equal(peak.processes.reduce((sum, p) => sum + p.privateBytes, 0), peak.privateBytes);
assert.equal(run.incrementalPrivateMiB, (Math.max(run.cimPeakPrivateBytes, peak.privateBytes) - r.blankBaseline.privateBytes) / 1024 ** 2);
assert.equal(run.incrementalPrivateMiB, 200.9296875);
const proof = {
  status: "guarded-layout-live-motion-vector-demand-measured-still-not-accepted",
  publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null,
  run: { databaseId: 37337524566, jobId: 111855960713,
    headSha: "ef4d1bcffec8e77b069930156abfe22c718e0e4b", conclusion: "success",
    buildSeconds: 281, jobSeconds: 332, scope: "build time, not conversion speed",
    url: "https://github.com/tanishqbaweja/fileconverter/actions/runs/37337524566" },
  rawReport: { file, bytes: raw.length, sha256: sha(raw) },
  manifest: r.manifest, actualWasmMemoryLimits: r.actualWasmMemoryLimits,
  harnessSources: r.sourceHashes,
  reductionSources: Object.fromEntries(await Promise.all([
    "scripts/freeze-mpeg2-guarded-pool-measurement.mjs", "scripts/lib/refstruct-sample-bytes.mjs",
  ].map(async (name) => [name, sha(await readFile(new URL(name, root)))]))),
  source: { bytes: r.source.bytes, sha256: r.source.sha256, width: 1920, height: 804, codec: "hevc", inputChanged: false },
  browserVersion: r.browserVersion, metrics: run.state.metrics,
  attemptedRuns: 1, completedConversions: 0, independentValidation: null,
  actualReserves: r.logs.filter((line) => line.startsWith("WITHIN_MPEG2_STACK_RESERVE ")),
  allocation: { failedRequestedHeapEndBytes: 33903608,
    pool: "HEVC tab_mvf_pool", preAbortSnapshot: fatal, ...refstructSampleBytes(fatal),
    identification: "Actual phase18 HEVC frame followed immediately by phase19; pinned refs.c alloc_frame first auxiliary get is tab_mvf_pool, before rpl_tab_pool",
    sourceSha256: "340d160758ec36928907132618c0d989a0f09869cca5fe57ab936ad54a9a3e5e",
    source: "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavcodec/hevc/refs.c",
    previousFrameHeapSnapshot: previous, availableFreePlusUnclaimedUpperBoundBytes: availableUpperBound,
    minimumShortfallIgnoringFragmentationAndOverheadBytes: 53732,
    allocatorOverheadBytes: null, totalConcurrentOtherPoolsBytes: null,
    conclusion: "Five live entries/no cached entry in the failed pool. Total free+unclaimed is insufficient even before fragmentation. Changed-layout measurement does not justify dropping required references or guessing simultaneous other-pool caches.",
    unchangedRetryUseful: false, motionVectorUncachingUsefulAtMeasuredFailure: false },
  telemetry: { capturedHeapEvents: 66, capturedPoolEvents: 125, evicted: 0,
    nativeHeapCap: 96, nativePoolCap: 128, browserCap: 224, inactiveWalkCap: 128,
    incompletePoolSamples: 0, capExhausted: false,
    heapColumns: ["kind", "sequence", "phase", "codecId", "encoder", "width", "height", "frameBufferBytes", "dynamicHeapBytes", "freeDynamicBytes", "unclaimedHeapBytes"],
    poolColumns: ["kind", "sequence", "phase", "poolIdentity", "statisticsComplete", "entryPayloadBytes", "entryRequestedAllocationBytes", "checkedOutEntries", "cachedEntries", "dynamicHeapBytes", "freeDynamicBytes", "unclaimedHeapBytes"],
    orderedEvents: events.map((x) => x.kind ? ["pool", x.sequence, x.phase, x.poolIdentity,
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
    observedPids: [...new Set(r.nativeMemory.identities.map((p) => p.pid))],
    independentlyVerifiedAllObservedPidsAbsent: true, independentlyVerifiedSixAssetsRestored: true,
    independentlyVerifiedAdaptersAndRuntimeAbsent: true,
    independentlyVerifiedOriginalSha256: r.source.sha256,
    deletedHostedArtifactIds: [11356967928, 11357002856], hostedArtifactsRemaining: 0, sourceBundleDownloaded: false },
  forbiddenRequests: r.forbiddenRequests,
  next: "Audit independently required codec auxiliary lifetimes and actual inactive encoder-pool retention at release before another mutation. Do not recompile MV uncaching, reduce required references, shrink stacks blindly, raise heap, resize source or retry this unchanged core. Goal remains incomplete; public engines and registry unchanged.",
};
process.stdout.write(`${JSON.stringify(proof)}\n`);

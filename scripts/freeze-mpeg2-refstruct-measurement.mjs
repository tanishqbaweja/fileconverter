// Read-only compact evidence generator. Writes JSON to stdout, never media.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { refstructSampleBytes } from "./lib/refstruct-sample-bytes.mjs";

const root = path.resolve(import.meta.dirname, "..");
const file = "outputs/reports/2026-10-05T15-19-25-099Z-private-mpeg2-protected-direct-native-100ms.json";
const bytes = await readFile(path.join(root, file));
assert.ok(bytes.length <= 32 * 1024 ** 2);
const r = JSON.parse(bytes), events = r.allocatorSamples;
const sha = (value) => createHash("sha256").update(value).digest("hex");
assert.equal(r.status, "failed"); assert.equal(r.diagnosticOnly, true);
assert.equal(r.publicAcceptance, false); assert.equal(r.requestedRuns, 1);
assert.equal(r.runs.length, 1); assert.equal(r.runs[0].state.metrics.outputBytes, 0);
assert.equal(r.allocatorSamplesEvicted, 0); assert.equal(events.length, 191);
const heap = events.filter((s) => !s.kind), pools = events.filter((s) => s.kind === "refstruct-pool");
assert.equal(heap.length, 66); assert.equal(pools.length, 125);
for (const group of [heap, pools]) group.forEach((s, i) => assert.equal(s.sequence, i + 1));
for (const pool of pools) assert.equal(refstructSampleBytes(pool).available, true);
assert.equal(r.manifest.allocatorDiagnostic, true);
assert.equal(r.manifest.refstructPoolDiagnosticSmoke.checkedTransitions, 9);
assert.equal(r.manifest.initialWasmMemoryBytes, 33554432);
assert.equal(r.manifest.maximumWasmMemoryBytes, 33554432);
assert.deepEqual(r.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
assert.match(r.runs[0].state.error, /size 34702496 bytes \(OOM\)/);
const fatal = events.at(-1), preceding = events.at(-2);
assert.equal(fatal.kind, "refstruct-pool"); assert.equal(fatal.phase, 19);
assert.equal(preceding.phase, 18); assert.equal(preceding.codecId, 173);
assert.equal(preceding.encoder, false);
assert.equal(fatal.entryPayloadBytes, 1163520);
assert.equal(fatal.entryRequestedAllocationBytes, 1163536);
assert.equal(fatal.checkedOutEntries, 5); assert.equal(fatal.cachedEntries, 0);
const peak = r.runs[0].nativePeaks.peak;
assert.equal(peak.processes.reduce((sum, p) => sum + p.privateBytes, 0), peak.privateBytes);
assert.equal(r.runs[0].incrementalPrivateMiB,
  (Math.max(r.runs[0].cimPeakPrivateBytes, peak.privateBytes) - r.blankBaseline.privateBytes) / 1024 ** 2);
assert.ok(Object.values(r.cleanup).every((v) => v === true));
const executedSources = Object.fromEntries(await Promise.all([
  "scripts/freeze-mpeg2-refstruct-measurement.mjs", "scripts/lib/refstruct-sample-bytes.mjs",
  ".github/workflows/reproduce-ffmpeg-nondocker.yml",
].map(async (name) => [name, sha(await readFile(path.join(root, name)))])));
const proof = {
  status: "measured-private-hevc-live-motion-vector-allocation-failure-not-accepted",
  publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null,
  run: { databaseId: 37331006755, jobId: 111833786140,
    headSha: "3a7cc2347a9e9cc7dcdeba8028856ff0e5f3b609", conclusion: "success",
    buildSeconds: 243, jobSeconds: 290, scope: "build time, not conversion speed",
    url: "https://github.com/tanishqbaweja/fileconverter/actions/runs/37331006755" },
  rawReport: { file, bytes: bytes.length, sha256: sha(bytes) },
  source: { bytes: r.source.bytes, sha256: r.source.sha256,
    width: 1920, height: 804, codec: "hevc", inputChanged: false },
  manifest: r.manifest, actualWasmMemoryLimits: r.actualWasmMemoryLimits,
  harnessSources: r.sourceHashes, analysisSources: executedSources,
  browserVersion: r.browserVersion, blankBaseline: r.blankBaseline, loadedIdle: r.loadedIdle,
  attemptedRuns: 1, outputBytes: 0, completedConversions: 0,
  metrics: r.runs[0].state.metrics,
  allocation: { failedRequestedHeapEndBytes: 34702496,
    failedPoolIdentity: fatal.poolIdentity, pool: "HEVC tab_mvf_pool",
    identification: "First refstruct get immediately after the matching HEVC default_get_buffer2 phase18; pinned refs.c alloc_frame calls tab_mvf_pool before rpl_tab_pool.",
    source: "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavcodec/hevc/refs.c",
    sourceSha256: "340d160758ec36928907132618c0d989a0f09869cca5fe57ab936ad54a9a3e5e",
    initializationSourceSha256: "d6c12610d92a8d8e27bae984172ce1d0f13f8eb16d5998eb58cc25b2fc690974",
    preAbortSnapshot: fatal, ...refstructSampleBytes(fatal),
    nextRequestedEntryBytes: fatal.entryRequestedAllocationBytes,
    allocatorOverheadBytes: null,
    conclusion: "Five checked-out entries, no cached entry in this exact pool at the abort. Uncaching this pool cannot recover memory here; other pools are not simultaneously measured.",
    unchangedRetryUseful: false,
    totalFreePlusUnclaimedBytes: fatal.freeDynamicBytes + fatal.unclaimedHeapBytes,
    minimumRequestedShortfallIgnoringFragmentationAndOverheadBytes:
      fatal.entryRequestedAllocationBytes - fatal.freeDynamicBytes - fatal.unclaimedHeapBytes },
  telemetry: { capturedHeapEvents: heap.length, capturedPoolEvents: pools.length,
    nativeHeapCap: 96, nativePoolCap: 128, browserCap: 224, evictedEvents: 0,
    poolCapExhausted: false, incompletePoolSamples: 0,
    heapColumns: ["kind", "sequence", "phase", "codecId", "encoder", "width", "height", "frameBufferBytes", "dynamicHeapBytes", "freeDynamicBytes", "unclaimedHeapBytes"],
    poolColumns: ["kind", "sequence", "phase", "poolIdentity", "statisticsComplete", "entryPayloadBytes", "entryRequestedAllocationBytes", "checkedOutEntries", "cachedEntries", "dynamicHeapBytes", "freeDynamicBytes", "unclaimedHeapBytes"],
    orderedEvents: events.map((s) => s.kind ? ["pool", s.sequence, s.phase, s.poolIdentity,
      s.statisticsComplete, s.entryPayloadBytes, s.entryRequestedAllocationBytes, s.checkedOutEntries,
      s.cachedEntries, s.dynamicHeapBytes, s.freeDynamicBytes, s.unclaimedHeapBytes]
      : ["heap", s.sequence, s.phase, s.codecId, s.encoder, s.width, s.height,
        s.frameBufferBytes, s.dynamicHeapBytes, s.freeDynamicBytes, s.unclaimedHeapBytes]) },
  memory: { formula: r.formula, limitMiB: 250,
    nativePeak: peak, cimPeakPrivateBytes: r.runs[0].cimPeakPrivateBytes,
    incrementalPrivateMiB: r.runs[0].incrementalPrivateMiB,
    validSamples: r.runs[0].nativePeaks.validSamples,
    unavailableSamples: r.runs[0].nativePeaks.unavailableSamples,
    incompleteConversion: true, acceptance: false,
    unknownProcessTypesRetained: true },
  cleanup: { ...r.cleanup, ownedPids: r.ownedPids,
    allObservedDescendantPids: r.nativeMemory.identities.map((p) => p.pid),
    runtimeDirectory: path.relative(root, r.runtimeDirectory).replaceAll("\\", "/"),
    independentlyVerifiedSourceSha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34",
    independentlyVerifiedAllObservedPidsAbsent: true, independentlyVerifiedSixAssetsRestored: true,
    independentlyVerifiedPrivateAdapterAndRuntimeAbsent: true,
    hostedArtifactIdsDeleted: [11354591463, 11355006298], hostedArtifactsRemaining: 0,
    sourceBundleDownloaded: false,
    retainedLocalCandidatePurpose: "Small static diagnostic tools for reproducing this allocation diagnosis; not converted media" },
  forbiddenRequests: r.forbiddenRequests,
  next: "Do not implement HEVC MV cache removal on this evidence. Audit stack reservations before a guarded smaller-reserve trial within the same fixed32MiB; no claim this fits until unchanged full-source correctness/process-tree gates pass. Goal remains incomplete.",
};
assert.deepEqual(proof.forbiddenRequests, []);
assert.ok(Buffer.byteLength(JSON.stringify(proof)) <= 65536);
process.stdout.write(JSON.stringify(proof));

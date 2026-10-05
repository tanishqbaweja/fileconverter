// Read-only reduction of the changed64KiB allocation diagnostic; not acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { mpeg2EncoderReleaseBytes } from "./lib/mpeg2-encoder-release-bytes.mjs";
import { refstructSampleBytes } from "./lib/refstruct-sample-bytes.mjs";

const root = new URL("../", import.meta.url), sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const file = "outputs/reports/2026-10-05T18-59-26-618Z-private-mpeg2-protected-direct-native-100ms.json";
const raw = await readFile(new URL(file, root)), report = JSON.parse(raw), run = report.runs[0];
assert.equal(raw.length, 395132);
assert.equal(sha(raw), "2131c47e029d23b7b39c6b76f83896a855bc6156d9f2478820dc412874cdfd58");
assert.equal(report.status, "failed"); assert.equal(report.diagnosticOnly, true);
assert.equal(report.requestedRuns, 1); assert.equal(report.runs.length, 1);
assert.equal(report.manifest.allocatorDiagnostic, true);
assert.equal(report.manifest.avioInputBufferBytes, 65536); assert.equal(report.manifest.avioOutputBufferBytes, 65536);
assert.equal(report.manifest.refstructPoolDiagnosticSmoke.checkedTransitions, 9);
assert.equal(report.manifest.encoderAccessoryLifecycleSmoke.status, "passed");
assert.deepEqual(report.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
assert.equal(run.state.metrics.inputBytes, 222785); assert.equal(run.state.metrics.outputBytes, 0);
assert.equal(run.independentValidation, null); assert.match(run.state.error, /size 33947688 bytes \(OOM\)/);
const events = report.allocatorSamples, heaps = events.filter((event) => !event.kind);
const pools = events.filter((event) => event.kind === "refstruct-pool");
const releases = events.filter((event) => event.kind === "mpeg2-encoder-pool-release");
assert.equal(events.length, 203); assert.equal(heaps.length, 70); assert.equal(pools.length, 128);
assert.equal(releases.length, 5); assert.equal(report.allocatorSamplesEvicted, 0);
for (const group of [heaps, pools, releases]) group.forEach((event, index) => assert.equal(event.sequence, index + 1));
assert.ok(pools.every((event) => refstructSampleBytes(event).available));
const reducedReleases = releases.map(mpeg2EncoderReleaseBytes);
assert.ok(reducedReleases.every((event) => event.available));
assert.deepEqual(reducedReleases.map((event) => event.requestedLiveBytes), [278222, 556444, 556444, 556444, 556444]);
assert.deepEqual(reducedReleases.map((event) => event.requestedCachedBytes), [0, 0, 0, 0, 0]);
const lastReleaseIndex = events.findLastIndex((event) => event.kind === "mpeg2-encoder-pool-release");
assert.equal(lastReleaseIndex, 188);
const auxiliaryBefore = pools.find((event) => event.sequence === 125);
const auxiliaryAfter = pools.find((event) => event.sequence === 126);
assert.equal(auxiliaryBefore.poolIdentity, auxiliaryAfter.poolIdentity);
assert.equal(auxiliaryBefore.entryRequestedAllocationBytes, 1163536);
assert.equal(auxiliaryBefore.checkedOutEntries, 5); assert.equal(auxiliaryAfter.checkedOutEntries, 6);
assert.equal(auxiliaryAfter.cachedEntries, 0);
const last = events.at(-1);
assert.equal(last.sequence, 70); assert.equal(last.phase, 17); assert.equal(last.codecId, 2);
assert.equal(last.encoder, true); assert.equal(last.width, 1952); assert.equal(last.height, 836);
assert.equal(last.frameBufferBytes, 0); assert.equal(last.freeDynamicBytes, 2836176);
assert.equal(last.unclaimedHeapBytes, 28464);
assert.equal(pools.at(-1).sequence, report.manifest.refstructPoolDiagnosticLimits.poolSnapshots);
// A reached per-kind cap is not a complete post-boundary pool inventory.
for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged",
  "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true);
assert.deepEqual(report.cleanup.errors, ["AggregateError: One or more owned cleanup actions failed"]);
assert.deepEqual(report.forbiddenRequests, []);
const peak = run.nativePeaks.peak;
assert.equal(peak.privateBytes, peak.processes.reduce((sum, process) => sum + process.privateBytes, 0));
assert.equal(run.incrementalPrivateMiB, (Math.max(run.cimPeakPrivateBytes, peak.privateBytes) - report.blankBaseline.privateBytes) / 1024 ** 2);
assert.equal(run.incrementalPrivateMiB, 206.16015625);
const proof = {
  status: "encoder-accessory-cache-zero-auxiliary-sixth-entry-passes-encoder-frame-allocation-fails",
  publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null,
  run: { databaseId: 37359045127, jobId: 111928714852,
    headSha: "d37fff5b9f27ac2fd9ae287bd7f6dfe140019223", conclusion: "success",
    buildSeconds: 305, jobSeconds: 356, scope: "build time, not conversion speed" },
  rawReport: { file, bytes: raw.length, sha256: sha(raw) },
  manifest: report.manifest, actualWasmMemoryLimits: report.actualWasmMemoryLimits,
  harnessSources: report.sourceHashes,
  reductionSources: Object.fromEntries(await Promise.all(["scripts/freeze-mpeg2-avio-measurement.mjs",
    "scripts/lib/mpeg2-encoder-release-bytes.mjs", "scripts/lib/refstruct-sample-bytes.mjs"].map(async (name) =>
    [name, sha(await readFile(new URL(name, root)))]))),
  source: { bytes: report.source.bytes, sha256: report.source.sha256, width: 1920, height: 804, inputChanged: false },
  browserVersion: report.browserVersion, attemptedRuns: 1, completedConversions: 0,
  independentValidation: null, metrics: run.state.metrics, error: run.state.error,
  diagnostics: { capturedEvents: 203, heapEvents: 70, poolEvents: 128, releaseEvents: 5,
    evicted: 0, heapCapReached: false, releaseCapReached: false,
    poolCapReached: true, completePostBoundaryPoolInventory: false,
    lastReleaseIndex, releaseGroups: releases, reducedReleaseGroups: reducedReleases,
    followingCapturedEvents: events.slice(lastReleaseIndex + 1), auxiliaryBefore, auxiliaryAfter,
    failedBoundary: last, failedCodec: "mpeg2video-encoder", internalFrameWidth: 1952, internalFrameHeight: 836,
    internalDimensionsAreNotProtectedSourceResize: true, exactFailedPlane: null,
    requestedFrameAllocationBytes: null, pureFragmentationProven: false,
    aggregateFreePlusUnclaimedBeforeFrameBytes: last.freeDynamicBytes + last.unclaimedHeapBytes,
    contiguousCapacityBytes: null, actualWholeHeapSavingsBytes: null },
  memory: { formula: report.formula, limitMiB: 250, blankBaseline: report.blankBaseline,
    loadedIdle: report.loadedIdle, nativePeak: peak, cimPeakPrivateBytes: run.cimPeakPrivateBytes,
    incrementalPrivateMiB: run.incrementalPrivateMiB, validSamples: run.nativePeaks.validSamples,
    unavailableSamples: run.nativePeaks.unavailableSamples, incompleteConversion: true,
    acceptance: false, instrumented: true, unknownProcessTypesRetained: true },
  cleanup: { ...report.cleanup, ownedPids: report.ownedPids, observedIdentities: report.nativeMemory.identities,
    runtimeDirectory: report.runtimeDirectory, independentlyVerifiedAllObservedAndOwnedPidsAbsent: 16,
    independentlyVerifiedSixAssetsRestored: true, independentlyVerifiedAdaptersAndRuntimeAbsent: true,
    independentlyVerifiedOriginalSha256: report.source.sha256,
    cleanupAggregateFailureCause: null, cleanupUnqualifiedSuccessClaim: false,
    blockedScratchCommandExecuted: false, blockedScratchDirectoryCreated: false,
    downloadedSmallStaticFiles: 8, downloadZipStayedInRepositoryWork: true,
    independentlyVerifiedDownloadZipAbsent: true, sourceBundleDownloaded: false,
    deletedHostedArtifactIds: [11366420557, 11366515275], hostedArtifactsRemaining: 0 },
  next: "Audit the pinned padded encoder-frame reservation and free-block fit; exact plane/request and pure fragmentation remain unproven. Investigate a changed fixed-heap allocation strategy or smaller specialist core from these measured boundaries, never release live references/raise heap/resize protected source/relax quality. Preserve pool-cap and cleanup AggregateError limitations. Do not repeat this unchanged normal or diagnostic core. Full repeats, speed A/B, public support and full goal remain open.",
};
process.stdout.write(`${JSON.stringify(proof)}\n`);

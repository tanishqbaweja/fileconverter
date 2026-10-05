import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mpeg2EncoderReleaseBytes } from "../scripts/lib/mpeg2-encoder-release-bytes.mjs";

const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-avio64-allocator-measured-2026-10-06.json", import.meta.url)));
test("Changed64KiB diagnostic proves accessory zero-cache and identifies padded encoder boundary", async () => {
  for (const [file, hash] of Object.entries(proof.reductionSources))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash);
  assert.equal(proof.run.databaseId, 37359045127); assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.manifest.allocatorDiagnostic, true); assert.equal(proof.manifest.avioInputBufferBytes, 65536);
  assert.equal(proof.manifest.refstructPoolDiagnosticSmoke.checkedTransitions, 9);
  assert.equal(proof.manifest.encoderAccessoryLifecycleSmoke.status, "passed");
  assert.deepEqual(proof.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  const d = proof.diagnostics;
  assert.deepEqual([d.capturedEvents, d.heapEvents, d.poolEvents, d.releaseEvents], [203, 70, 128, 5]);
  assert.deepEqual(d.releaseGroups.map(mpeg2EncoderReleaseBytes), d.reducedReleaseGroups);
  assert.deepEqual(d.reducedReleaseGroups.map((row) => row.requestedLiveBytes), [278222, 556444, 556444, 556444, 556444]);
  assert.deepEqual(d.reducedReleaseGroups.map((row) => row.requestedCachedBytes), [0, 0, 0, 0, 0]);
  assert.equal(d.auxiliaryBefore.poolIdentity, d.auxiliaryAfter.poolIdentity);
  assert.equal(d.auxiliaryBefore.entryRequestedAllocationBytes, 1163536);
  assert.equal(d.auxiliaryBefore.checkedOutEntries, 5); assert.equal(d.auxiliaryAfter.checkedOutEntries, 6);
  assert.equal(d.failedBoundary.phase, 17); assert.equal(d.failedBoundary.codecId, 2);
  assert.equal(d.failedBoundary.encoder, true); assert.equal(d.failedCodec, "mpeg2video-encoder");
  assert.deepEqual([d.internalFrameWidth, d.internalFrameHeight], [1952, 836]);
  assert.equal(d.internalDimensionsAreNotProtectedSourceResize, true);
  assert.deepEqual([proof.source.width, proof.source.height], [1920, 804]);
});
test("Capped pool history, unknown plane and cleanup error remain explicit, never acceptance", () => {
  const d = proof.diagnostics, m = proof.memory, c = proof.cleanup;
  assert.equal(d.evicted, 0); assert.equal(d.poolCapReached, true);
  assert.equal(d.completePostBoundaryPoolInventory, false);
  assert.equal(d.heapCapReached, false); assert.equal(d.releaseCapReached, false);
  assert.equal(d.exactFailedPlane, null); assert.equal(d.requestedFrameAllocationBytes, null);
  assert.equal(d.pureFragmentationProven, false); assert.equal(d.contiguousCapacityBytes, null);
  assert.equal(d.aggregateFreePlusUnclaimedBeforeFrameBytes, 2864640);
  assert.equal(d.actualWholeHeapSavingsBytes, null);
  assert.equal(proof.completedConversions, 0); assert.equal(proof.metrics.outputBytes, 0);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.primaryMemoryAcceptance, false);
  assert.equal(proof.speedGainClaim, null);
  assert.equal(m.incrementalPrivateMiB, 206.16015625); assert.equal(m.validSamples, 38);
  assert.equal(m.unavailableSamples, 0); assert.equal(m.acceptance, false); assert.equal(m.instrumented, true);
  assert.equal(m.nativePeak.privateBytes, m.nativePeak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  assert.equal(m.incrementalPrivateMiB,
    (Math.max(m.nativePeak.privateBytes, m.cimPeakPrivateBytes) - m.blankBaseline.privateBytes) / 1024 ** 2);
  assert.deepEqual(c.errors, ["AggregateError: One or more owned cleanup actions failed"]);
  assert.equal(c.cleanupAggregateFailureCause, null); assert.equal(c.cleanupUnqualifiedSuccessClaim, false);
  assert.equal(c.independentlyVerifiedAllObservedAndOwnedPidsAbsent, 16);
  assert.equal(c.independentlyVerifiedSixAssetsRestored, true); assert.equal(c.independentlyVerifiedAdaptersAndRuntimeAbsent, true);
  assert.equal(c.blockedScratchCommandExecuted, false); assert.equal(c.blockedScratchDirectoryCreated, false);
  assert.equal(c.independentlyVerifiedDownloadZipAbsent, true); assert.equal(c.hostedArtifactsRemaining, 0);
  assert.equal(proof.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.match(proof.next, /Do not repeat this unchanged/);
});

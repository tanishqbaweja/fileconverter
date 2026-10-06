import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { summarizePlaneAuxiliaryBoundary } from "../scripts/lib/mpeg2-plane-auxiliary-boundary.mjs";

const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-hevc-auxiliary-measured-2026-10-06.json", import.meta.url)));
test("Executed HEVC auxiliary boundary proof pins actual compiled module and complete ordered live/cache inventory", async () => {
  for (const [file, hash] of Object.entries(proof.sources))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash);
  assert.equal(proof.run.databaseId, 37395126119); assert.equal(proof.run.jobId, 112049169870);
  assert.equal(proof.run.headSha, "4ca98223dec821dae04e3c4da3cab3487967a0d4");
  assert.equal(proof.run.conclusion, "success"); assert.equal(proof.run.buildSeconds, 283);
  assert.equal(Object.keys(proof.manifest.sources).length, 24);
  assert.equal(Object.keys(proof.manifest.artifacts).length, 3);
  assert.equal(proof.manifest.hevcAuxiliaryDiagnostic, true);
  assert.equal(proof.manifest.nativeAllocator, "dlmalloc");
  assert.equal(proof.manifest.refstructPoolDiagnosticSmoke.checkedTransitions, 9);
  assert.deepEqual(summarizePlaneAuxiliaryBoundary(proof.actualScalarEvents,
    { error: proof.protected.error, eventsEvicted: 0 }), proof.boundary);
  const boundary = proof.boundary;
  assert.equal(boundary.events, 89); assert.equal(boundary.auxiliaryEvents, 6);
  assert.equal(boundary.auxiliaryCapReached, false); assert.equal(boundary.completeBoundaryPrefix, true);
  assert.equal(boundary.sameEncoderSend, true); assert.equal(boundary.boundaryLayer, 0);
  assert.equal(boundary.planeTrace.events, 83); assert.equal(boundary.planeTrace.successfulPlaneRequests, 41);
  assert.equal(boundary.planeTrace.failedAllocation.plane, 2);
  assert.equal(boundary.planeTrace.failedAllocation.requestedBytes, 421655);
  assert.equal(boundary.actualInactiveHevcBackingBytes, 1316432);
  assert.equal(boundary.actualLiveHevcBackingBytes, 6582160);
  assert.deepEqual(boundary.boundaryBytes.pools, [
    { name: "tab_mvf", requestedLiveBytes: 5817680, requestedCachedBytes: 1163536 },
    { name: "rpl_tab", requestedLiveBytes: 764480, requestedCachedBytes: 152896 }]);
  assert.equal(boundary.safeLiveReferenceRemoval, false);
  assert.equal(boundary.contiguousFreeBlockCapacity, null); assert.equal(boundary.measuredRuntimeSavingsBytes, null);
  assert.match(proof.limits, /Five live entries in each pool must remain/);
});
test("Small encode/cleanup passes and incomplete memory remain distinct from original-source acceptance", () => {
  assert.equal(proof.small.passedCases, 4); assert.equal(proof.small.suiteSeconds, 17.5);
  assert.equal(proof.small.outputsByteIdenticalToNormalCandidate, true);
  assert.equal(proof.small.sameInputSpeedAB, false);
  assert.deepEqual(proof.small.cases.map((row) => [row.sourceCodec, row.frames, row.outputBytes, row.ssim]),
    [["mpeg4", "48", 321692, 0.992146], ["hevc", "96", 652521, 0.985963]]);
  for (const row of proof.small.adverse) {
    assert.deepEqual(row.partialBytes, []); assert.equal(row.metrics.queuedBytes, 0);
    assert.equal(row.metrics.pendingOperations, 0);
  }
  assert.equal(proof.small.adverse[1].beforeCancel.outputBytes, 232344);
  assert.equal(proof.small.adverse[1].metrics.outputBytes, 471427);
  assert.equal(proof.protected.source.bytes, 2958573265);
  assert.equal(proof.protected.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.protected.source.inputChanged, false);
  assert.equal(proof.protected.completedConversions, 0); assert.equal(proof.protected.metrics.outputBytes, 0);
  assert.equal(proof.protected.failedRequestedHeapEndBytes, 33771520);
  assert.equal(proof.protected.independentValidation, null); assert.equal(proof.protected.unchangedRetryUseful, false);
  const memory = proof.memory;
  assert.equal(memory.incrementalPrivateMiB, 179.3671875);
  assert.equal(memory.validSamples, 29); assert.equal(memory.unavailableSamples, 0);
  assert.equal(memory.nativePeak.privateBytes, memory.nativePeak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  assert.equal(memory.incrementalPrivateMiB,
    (Math.max(memory.nativePeak.privateBytes, memory.cimPeakPrivateBytes) - memory.blankBaseline.privateBytes) / 1024 ** 2);
  assert.equal(memory.instrumentedIncompleteConversion, true); assert.equal(memory.acceptance, false);
  assert.equal(proof.diagnosticOnly, true); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.speedGainClaim, null);
  assert.equal(proof.cleanup.independentlyVerifiedFullObservedAndOwnedPidsAbsent, 20);
  assert.equal(proof.cleanup.independentlyVerifiedSmallObservedPidsAbsent, 21);
  assert.equal(proof.cleanup.independentlyVerifiedSixAssetsRestored, true);
  assert.equal(proof.cleanup.hostedArtifactsRemaining, 0); assert.equal(proof.cleanup.sourceBundleDownloaded, false);
  assert.equal(proof.cleanup.unrelatedProcessesKilled, false);
  assert.match(proof.next, /single-thread final-unref cache-admission trial/);
  assert.match(proof.next, /Full goal remains incomplete/);
});

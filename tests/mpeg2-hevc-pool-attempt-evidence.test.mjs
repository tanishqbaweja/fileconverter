import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { summarizeHevcPoolAttempts } from "../scripts/lib/hevc-pool-attempt-trace.mjs";

const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-hevc-pool-attempts-measured-2026-10-06.json", import.meta.url)));
test("Executed HEVC pool attempts prove the exact pending MV pool with zero idle backing, not free space", async () => {
  for (const [file, hash] of Object.entries(proof.sources))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash);
  assert.equal(proof.run.databaseId, 37399371287); assert.equal(proof.run.jobId, 112062866531);
  assert.equal(proof.run.headSha, "21cf48044962bddc2aebb0e5f4f49a9e93f53d12");
  assert.equal(proof.run.conclusion, "success"); assert.equal(proof.run.buildSeconds, 282);
  assert.equal(Object.keys(proof.manifest.sources).length, 29);
  assert.equal(Object.keys(proof.manifest.artifacts).length, 3);
  assert.equal(proof.manifest.hevcPoolAttemptDiagnostic, true);
  assert.equal(proof.manifest.nativeAllocator, "dlmalloc");
  assert.equal(proof.manifest.refstructPoolDiagnosticSmoke.checkedTransitions, 9);
  assert.deepEqual(summarizeHevcPoolAttempts(proof.actualScalarEvents,
    { error: proof.protected.error, eventsEvicted: 0 }), proof.boundary);
  const boundary = proof.boundary;
  assert.equal(boundary.events, 146); assert.equal(boundary.poolEvents, 44);
  assert.equal(boundary.completePrefix, true); assert.equal(boundary.capReached, false);
  assert.equal(boundary.completedRequests, 18); assert.equal(boundary.successfulRequests, 18);
  assert.equal(boundary.planeTrace.successfulPlaneRequests, 51);
  assert.equal(boundary.planeTrace.failedAllocation, null);
  assert.equal(boundary.exactFailedPool, "tab_mvf"); assert.equal(boundary.statisticsAvailable, true);
  assert.equal(boundary.failedAttempt.sequence, 44); assert.equal(boundary.failedAttempt.layer, 0);
  assert.equal(boundary.actualLiveBackingBytes, 6582160);
  assert.equal(boundary.actualInactiveBackingBytes, 0); assert.equal(boundary.requestedEntryBackingBytes, 1163536);
  assert.deepEqual(boundary.failedAttempt.pools.map((row) => [row.name, row.liveEntries, row.cachedEntries]),
    [["tab_mvf", 5, 0], ["rpl_tab", 5, 0]]);
  assert.equal(boundary.contiguousFreeBlockCapacity, null);
  assert.equal(boundary.measuredRuntimeSavingsBytes, null); assert.equal(boundary.safeLiveReferenceRemoval, false);
  const unavailable = summarizeHevcPoolAttempts(proof.actualScalarEvents,
    { error: proof.protected.error, eventsEvicted: 1 });
  assert.equal(unavailable.exactFailedPool, null); assert.equal(unavailable.actualInactiveBackingBytes, null);
});
test("Small fidelity and complete cleanup are retained separately from the failed original-source gate", () => {
  assert.equal(proof.small.passedCases, 4); assert.equal(proof.small.suiteSeconds, 17.6);
  assert.equal(proof.small.outputsByteIdenticalToNormalCandidate, true);
  assert.equal(proof.small.sameInputSpeedAB, false);
  assert.deepEqual(proof.small.cases.map((row) => [row.sourceCodec, row.frames, row.outputBytes, row.ssim]),
    [["mpeg4", "48", 321692, 0.992146], ["hevc", "96", 652521, 0.985963]]);
  for (const row of proof.small.adverse) {
    assert.deepEqual(row.partialBytes, []); assert.equal(row.metrics.queuedBytes, 0);
    assert.equal(row.metrics.pendingOperations, 0);
  }
  assert.equal(proof.small.adverse[1].beforeCancel.outputBytes, 349012);
  assert.equal(proof.small.adverse[1].metrics.outputBytes, 599048);
  assert.equal(proof.protected.source.bytes, 2958573265);
  assert.equal(proof.protected.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.protected.source.inputChanged, false); assert.equal(proof.protected.completedConversions, 0);
  assert.equal(proof.protected.failedRequestedHeapEndBytes, 34582528);
  assert.equal(proof.protected.metrics.outputBytes, 0); assert.equal(proof.protected.independentValidation, null);
  assert.equal(proof.protected.unchangedRetryUseful, false);
  const memory = proof.memory;
  assert.equal(memory.incrementalPrivateMiB, 187.04296875);
  assert.equal(memory.validSamples, 29); assert.equal(memory.unavailableSamples, 0);
  assert.equal(memory.nativePeak.privateBytes, memory.nativePeak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  assert.equal(memory.incrementalPrivateMiB,
    (Math.max(memory.nativePeak.privateBytes, memory.cimPeakPrivateBytes) - memory.blankBaseline.privateBytes) / 1024 ** 2);
  assert.equal(memory.instrumentedIncompleteConversion, true); assert.equal(memory.acceptance, false);
  assert.equal(proof.diagnosticOnly, true); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.speedGainClaim, null);
  assert.equal(proof.cleanup.independentlyVerifiedFullObservedAndOwnedPidsAbsent, 20);
  assert.equal(proof.cleanup.independentlyVerifiedSmallPidsAbsentAfterFullCleanup, 21);
  assert.equal(proof.cleanup.smallPidReusedByDifferentFullRunHelper.killedAsSmallProcess, false);
  assert.equal(proof.cleanup.independentlyVerifiedSixAssetsRestored, true);
  assert.equal(proof.cleanup.hostedArtifactsRemaining, 0); assert.equal(proof.cleanup.sourceBundleDownloaded, false);
  assert.equal(proof.cleanup.unrelatedProcessesKilled, false);
  assert.match(proof.next, /single reusable frame bridge/); assert.match(proof.next, /not implemented or proven/);
  assert.match(proof.next, /Full goal remains incomplete/);
});

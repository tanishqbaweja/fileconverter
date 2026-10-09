// Diagnose a failed full-input attempt; below-budget failure is NOT acceptance.
import assert from "node:assert/strict";
import { fullProgressNativeFacts } from "./progress-compositing-full-recipe.mjs";
import { splitRenderFirstFailureFacts } from "./split-render-progress-evidence.mjs";

export function progressFullTerminalFacts(raw) {
  assert.equal(raw.status, "failed"); assert.equal(raw.requestedRuns, 3); assert.equal(raw.runs.length, 1);
  const probe = raw.progressProbe;
  assert.equal(probe.fullCompletionRequired, true); assert.equal(probe.partialOutputStopEnabled, false);
  assert.equal(probe.checkpointOutputBytes, null); assert.equal(probe.checkpointReached, false);
  assert.equal(probe.maximumConversionMs, 21600000); assert.equal(probe.jsAllocationSamplingEnabled, false);
  assert.equal(raw.conversionJsReport, null); assert.deepEqual(raw.forbiddenRequests, []);
  assert.equal(raw.blankBaseline.stable, true);
  const native = fullProgressNativeFacts(raw), firstBudgetFailure = splitRenderFirstFailureFacts(raw);
  assert.equal(native.primaryLimitExceededInObservedWindow, false);
  assert.equal(firstBudgetFailure.firstFailure, null);
  const run = raw.runs[0]; assert.equal(run.state.jobState, "error"); assert.equal(run.independentValidation, null);
  assert.match(run.state.error, /Cannot enlarge memory arrays/);
  const metrics = run.state.metrics;
  assert.equal(metrics.wasmMemoryBytes, 50331648); assert.equal(metrics.peakWasmMemoryBytes, 50331648);
  for (const key of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"])
    assert.ok(metrics[key] > 0 && metrics[key] <= 65536, key);
  assert.equal(metrics.peakPendingOperations, 1); assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0);
  assert.equal(raw.splitFinalSamples.length, 1); const ownership = raw.splitFinalSamples[0];
  assert.ok(ownership.frames > 0); assert.equal(ownership.frames, ownership.packets); assert.equal(ownership.frames, ownership.completedPackets);
  assert.equal(ownership.decoderMemoryBytes, 33554432); assert.equal(ownership.encoderMemoryBytes, 16777216);
  assert.equal(ownership.aggregateWasmMemoryBytes, 50331648); assert.equal(ownership.closed, true);
  for (const key of ["activePackets", "queuedPackets", "queuedFrames", "additionalPixelBufferBytes", "additionalJsPacketBufferBytes"])
    assert.equal(ownership[key], 0, key);
  const capture = raw.abortDiagnostic;
  assert.equal(capture.records.length, 1); assert.equal(capture.captureError, null);
  assert.equal(capture.noForcedGc, true); assert.equal(capture.noDebuggerPause, true); assert.equal(capture.syntheticMallocInvoked, false);
  const abort = capture.records[0]; assert.equal(abort.role, "decoder");
  assert.equal(abort.reasonTruncated, false); assert.equal(abort.stackTruncated, false); assert.equal(abort.unavailable, null);
  assert.equal(abort.latePoolRequestUnavailable, null); assert.equal(abort.allocatorFreeBlocksUnavailable, null);
  const request = abort.latePoolRequest, free = abort.allocatorFreeBlocks;
  assert.equal(request.failedIndividualAllocationBytes, request.payloadBytes + request.refcountHeaderBytes);
  assert.equal(request.refcountHeaderBytes, 16); assert.ok(request.payloadBytes > 0);
  assert.equal(request.cachedEntriesInRequestedPoolBeforeRequest, 0); assert.ok(request.liveEntriesBeforeRequest > 0);
  assert.equal(request.poolFlags, 1073741824); assert.equal(request.maximumScalarBytesRead, 64);
  for (const key of ["heapCopied", "payloadRead", "nativeFunctionsCalled", "liveReferencesChanged"]) assert.equal(request[key], false, key);
  assert.equal(free.complete, true); assert.ok(free.freeChunks > 0 && free.freeChunks <= free.maximumChunks);
  assert.ok(free.headerWordsRead > 0 && free.headerWordsRead <= free.maximumHeaderWords);
  assert.ok(free.largestFreeChunkBytes > 0 && free.largestFreeChunkBytes <= free.totalFreeChunkBytes);
  assert.equal(free.freeChunkSizeLog2Histogram.reduce((sum, value) => sum + value, 0), free.freeChunks);
  assert.equal(free.bins.reduce((sum, bin) => sum + bin.bytes, 0) + free.designatedVictimBytes + free.topChunkBytes, free.totalFreeChunkBytes);
  // Inventory excludes top/dv bin rows, so count them separately if present.
  assert.equal(free.bins.reduce((sum, bin) => sum + bin.chunks, 0) + Number(free.designatedVictimBytes > 0) + Number(free.topChunkBytes > 0), free.freeChunks);
  for (const key of ["heapCopied", "payloadRead", "nativeFunctionsCalled", "allocatorMutated", "fragmentationCauseProven"]) assert.equal(free[key], false, key);
  assert.equal(abort.heapLiveBytes, null); assert.equal(abort.fragmentationCauseProven, false);
  const attemptedHeapExtent = Number(abort.reason.match(/to size (\d+) bytes/)?.[1]);
  assert.ok(attemptedHeapExtent > ownership.decoderMemoryBytes);
  assert.notEqual(attemptedHeapExtent, request.failedIndividualAllocationBytes);
  return { native, firstBudgetFailure, failedDecoderRequest: request, allocatorFreeHeaders: free,
    actualAllocatorRoot: abort.actualAllocatorRoot, abortObservedAt: abort.observedAt,
    attemptedHeapExtentBytes: attemptedHeapExtent, attemptedHeapExtentIsIndividualAllocation: false,
    finalOwnership: ownership, encoderOwnershipFailedFlagDoesNotProveDecoderSuccess: true,
    lastReportedMetrics: metrics, completedConversions: 0, completeOutputsIndependentlyValidated: 0,
    requestedRepeats: 3, attemptedRepeats: 1, fragmentationCauseProven: false, heapLiveBytes: null,
    lateHevcPoolOomResolved: false, conversionSpeedAcceptance: false,
    completeChromiumMemoryAcceptance: false, originalFullSourceAcceptance: false, publicAcceptance: false };
}

// Separate the real primary-memory failure from the secondary progress error.
import assert from "node:assert/strict";
export function inspectDurationFullTerminal(terminal, report) {
  assert.equal(terminal.executions, 1); assert.equal(terminal.failure, null); assert.deepEqual(terminal.cleanupErrors, []);
  assert.equal(terminal.candidate.actualExitCode, 1); assert.equal(terminal.candidate.status, "failed");
  assert.equal(terminal.candidate.completedConversions, 0); assert.equal(report.status, "failed");
  assert.equal(terminal.requestedRuns, 3); assert.equal(report.requestedRuns, 3); assert.equal(report.limitMiB, 250);
  assert.equal(report.runs.length, 1); assert.equal(report.runs[0].independentValidation, null);
  assert.equal(report.manifest.artifacts["within-mpeg2-split.wasm"], "e15ab14e6f6961c99591e2e84635d0d90f000aa5042cd134fd9812142ade4f7e");
  assert.equal(report.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.deepEqual(report.manifest, terminal.composition.manifest);
  assert.deepEqual(report.forbiddenRequests, []); assert.deepEqual(report.inputReadFailureSamples, []);
  assert.deepEqual(report.abortDiagnostic.records, []);
  const baseline = report.blankBaseline, failure = report.nativeFailureCapture.firstFailure;
  assert.equal(baseline.stable, true); assert.equal(baseline.privateBytes, 241561600);
  assert.deepEqual(failure.baseline, baseline); assert.equal(failure.phase, "conversion-1");
  const incremental = (failure.after.privateBytes - baseline.privateBytes) / 1048576;
  assert.equal(incremental, 258.16796875); assert.equal(failure.incrementalPrivateMiB, incremental); assert.ok(incremental > 250);
  const phase = report.nativeMemory.phases.find(row => row.phase === "conversion-1");
  assert.equal(phase.peak[3], failure.after.privateBytes); assert.equal(report.runs[0].incrementalPrivateMiB, incremental);
  assert.equal(report.runs[0].peakPrivateBytes, failure.after.privateBytes);
  assert.equal(failure.delta.adjacent, true); assert.equal(failure.delta.allocationSource, null);
  const rendererStep = failure.delta.processDeltas.find(row => row.pid === 33476);
  assert.equal(rendererStep.deltaPrivateBytes, 59977728); assert.equal(failure.delta.treeDeltaPrivateBytes, 59981824);
  const copy = report.progressProbe.finalDestinationCopyObservation;
  assert.equal(copy.phase, "Copying staged MP4 to selected destination"); assert.equal(copy.stagedBytes, 6414309978);
  assert.ok(copy.first.elapsedMs >= copy.encodingLast.elapsedMs); assert.ok(copy.last.outputBytes < copy.stagedBytes);
  const cancel = report.quiescedBudgetCapture;
  assert.equal(cancel.stateBefore.phase, copy.phase); assert.equal(cancel.stateBefore.metrics.scratchBytes, copy.stagedBytes);
  assert.equal(cancel.cancellation.cancellationRequested, true); assert.equal(cancel.cancellation.terminalState, "cancelled");
  assert.equal(cancel.stateAfter.jobState, "cancelled"); assert.equal(cancel.stateAfter.metrics.scratchBytes, 0);
  assert.equal(cancel.oldWorkerCloseObserved, true); assert.equal(cancel.allocationObjectOrCallsite, null);
  assert.equal(cancel.noForcedGc, true); assert.equal(cancel.noTestWorkerTermination, true);
  assert.equal(report.failure.message, "Reject return to encoding after final destination copy");
  assert.equal(report.runs[0].state.phase, "Cancelling safely");
  assert.equal(report.nativeFailureCapture.callback.status, "completed"); assert.equal(report.nativeFailureCapture.callback.error, null);
  const frame = report.splitFinalSamples[0]; assert.equal(report.splitFinalSamples.length, 1);
  assert.equal(frame.frames, 296160); assert.equal(frame.completedPackets, 296160); assert.equal(frame.packets, 296160);
  assert.equal(frame.aggregateWasmMemoryBytes, 50331648); assert.equal(frame.failed, false); assert.equal(frame.closed, true);
  for (const key of ["activePackets", "queuedPackets", "queuedFrames", "additionalPixelBufferBytes", "additionalJsPacketBufferBytes"]) assert.equal(frame[key], 0);
  const lease = report.asyncifyStorageFinalSamples[0]; assert.equal(report.asyncifyStorageFinalSamples.length, 1);
  assert.equal(lease.allocations, 1); assert.equal(lease.frees, 1); assert.equal(lease.activeLeases, 0); assert.equal(lease.retainedBytes, 0);
  const metrics = cancel.stateBefore.metrics;
  assert.equal(metrics.wasmMemoryBytes, 50331648); assert.equal(metrics.activeWorkerCount, 1);
  assert.ok(metrics.maxReadChunkBytes <= 65536); assert.ok(metrics.maxWriteChunkBytes <= 524288);
  assert.ok(metrics.maxScratchReadChunkBytes <= 524288); assert.ok(metrics.maxScratchWriteChunkBytes <= 524288);
  assert.ok(metrics.peakQueuedBytes <= 524288); assert.ok(metrics.peakPendingOperations <= 1);
  assert.equal(metrics.queuedBytes, 0); assert.equal(metrics.pendingOperations, 0);
  const fence = report.nativeMemory.receiptClockFence;
  assert.equal(fence.samplesDropped, 0); assert.equal(fence.timestampsRewritten, 0); assert.equal(fence.monitorClosed, true);
  assert.ok(report.nativeMemory.phases.every(row => row.unavailableSamples === 0));
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true);
  assert.deepEqual(terminal.protectedBefore, terminal.protectedAfter); assert.equal(terminal.productionRestored, true);
  return { status: "full-encoding-reached-copy-primary-memory-failed-not-accepted", requestedRuns: 3, completedValidatedRuns: 0,
    primaryMemory: { formula: `(${failure.after.privateBytes} - ${baseline.privateBytes}) / 1048576`,
      stableBlankPrivateBytes: baseline.privateBytes, peakTreePrivateBytes: failure.after.privateBytes,
      incrementalPrivateMiB: incremental, limitMiB: 250, passed: false, timestamp: failure.after.timestamp,
      adjacentTreeDeltaBytes: failure.delta.treeDeltaPrivateBytes, largestProcessDelta: rendererStep,
      exactAllocationObjectOrCallsite: null, processStepIsNotAllocationAttribution: true },
    frames: frame.frames, completedPackets: frame.completedPackets, stagedOutputBytes: copy.stagedBytes,
    encodingCompletionElapsedWindowMs: [copy.encodingLast.elapsedMs, copy.first.elapsedMs],
    endToEndConversionCompleted: false, independentOutputValidationPerformed: false,
    cancellation: cancel.cancellation, oldWorkerClosed: true, stageRemoved: true,
    secondaryProgressObserverError: report.failure, secondaryErrorMustNotInvalidatePrimaryMemoryFailure: true,
    copyObservation: copy, copyMetricsBeforeCancellation: metrics, splitFinal: frame, asyncifyFinal: lease,
    postCancelTraceIsNotPeakAllocationProof: true, forbiddenRequestCount: 0, nativeOomObserved: false,
    nativeSequence: report.nativeMemory.sequence, activePhaseValidSamples: phase.validSamples,
    sourceCount: 656, allGeneratedMediaRemoved: true, fullOriginalAcceptance: false, memoryAcceptance: false,
    speedGainProven: false, publicAcceptance: false, headedCoverageVerified: false, noUnchangedRetry: true };
}

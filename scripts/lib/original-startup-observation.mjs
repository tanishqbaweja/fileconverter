import assert from "node:assert/strict";

// Acceptance is intentionally impossible from a cancelled partial conversion.
export function inspectOriginalStartupObservation(terminal, report) {
  assert.equal(terminal.failure, null); assert.deepEqual(terminal.cleanupErrors, []);
  assert.equal(terminal.status, "original-startup-controls-finished-pending-audit-not-acceptance");
  assert.equal(terminal.executions, 1); assert.equal(terminal.report.completedRuns, 0);
  assert.equal(terminal.report.attemptedStartupControls, 3);
  assert.equal(terminal.productionRestored, true); assert.equal(terminal.wrapperRemoved, true);
  assert.equal(terminal.candidateRemoved, true);
  assert.equal(report.status, "three-original-startup-cancellations-observed-not-acceptance");
  assert.equal(report.diagnosticOnly, true); assert.equal(report.publicAcceptance, false);
  assert.equal(report.source.bytes, 2958573265);
  assert.equal(report.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(report.limitMiB, 250); assert.equal(report.requestedCompletedConversions, 0);
  assert.equal(report.startupSettlement.minimumMs, 300000);
  assert.ok(report.startupSettlement.actualMs >= 300000);
  assert.equal(report.startupSettlement.processesExcluded, 0);
  assert.equal(report.startupSettlement.flagsChanged, false);
  assert.equal(report.blankBaseline.stable, true);
  assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
  assert.equal(report.loadedIdle.stable, true);
  assert.deepEqual(report.forbiddenRequests, []); assert.equal(report.failure, null);
  assert.equal(report.nativeMemory.receiptClockFence.monitorClosed, true);
  assert.equal(report.nativeMemory.receiptClockFence.samplesDropped, 0);
  assert.equal(report.nativeMemory.receiptClockFence.timestampsRewritten, 0);
  assert.equal(report.runs.length, 3);
  const runs = report.runs.map((run, i) => {
    assert.equal(run.number, i + 1); assert.equal(run.independentValidation, null);
    assert.equal(run.startupControl.fullOutputValidationPerformed, false);
    assert.equal(run.startupControl.fullOriginalAcceptance, false);
    assert.equal(run.startupControl.cancellation.cancellationRequested, true);
    assert.equal(run.startupControl.cancellation.terminalState, "cancelled");
    const before = run.startupControl.beforeCancellation, after = run.startupControl.afterCancellation;
    assert.equal(before.jobState, "running"); assert.equal(after.jobState, "cancelled");
    assert.ok(before.metrics.elapsedMs >= 9000 && before.metrics.elapsedMs < 30000);
    assert.ok(before.metrics.outputBytes > 32768 && before.metrics.outputBytes < 32 * 1024 ** 2);
    assert.equal(before.metrics.wasmMemoryBytes, 50331648);
    for (const state of [before, after]) {
      assert.equal(state.metrics.peakPendingOperations, 1); assert.equal(state.metrics.pendingOperations, 0);
      assert.equal(state.metrics.queuedBytes, 0); assert.ok(state.metrics.maxReadChunkBytes <= 65536);
      assert.ok(state.metrics.maxWriteChunkBytes <= 65536);
    }
    assert.equal(after.metrics.scratchBytes, 0);
    const native = run.nativePeaks;
    assert.ok(native.validSamples >= 90); assert.equal(native.unavailableSamples, 0);
    assert.ok(native.peak.processes.length >= 8);
    assert.equal(native.peak.privateBytes, native.peak.processes.reduce((sum, process) => sum + process.privateBytes, 0));
    assert.equal(run.peakPrivateBytes, Math.max(run.cimPeakPrivateBytes, native.peak.privateBytes));
    assert.equal(run.incrementalPrivateMiB, (run.peakPrivateBytes - report.blankBaseline.privateBytes) / 1024 ** 2);
    assert.ok(run.incrementalPrivateMiB <= 250); assert.equal(run.recovery.stable, true);
    return { number: run.number, peakPrivateBytes: run.peakPrivateBytes, incrementalPrivateMiB: run.incrementalPrivateMiB,
      nativeSamples: native.validSamples, unavailableSamples: native.unavailableSamples,
      partialOutputBytesBeforeCancellation: before.metrics.outputBytes, partialOutputBytesAtCancellation: after.metrics.outputBytes,
      elapsedMsBeforeCancellation: before.metrics.elapsedMs, elapsedMsAtCancellation: after.metrics.elapsedMs,
      recoveryPrivateBytes: run.recovery.privateBytes,
      retainedAboveLoadedIdleMiB: (run.recovery.privateBytes - report.loadedIdle.privateBytes) / 1024 ** 2,
      terminalState: "cancelled", completedConversion: false, fullOutputValidationPerformed: false };
  });
  const events = report.progressProbe.handoffWorkerEvents;
  assert.equal(events.filter(event => event.role === "codec" && event.event === "closed").length, 3);
  assert.equal(events.filter(event => event.role === "save").length, 0);
  assert.equal(report.rendererAttributionResult, null);
  assert.equal(report.cleanup.protectedFixtureUnchanged, true);
  assert.equal(report.cleanup.mediaProfileRuntimeRemoved, true);
  return { status: "three-original-startup-cancellations-observed-within-budget-not-full-acceptance", runs,
    blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle, source: report.source,
    immediateWorkerRecyclingFailureReproduced: false, actualLongRunFailureResolved: false,
    allocationCause: null, completedConversions: 0, fullOriginalAcceptance: false, publicAcceptance: false,
    caveat: "Short normal cancellations do not exercise the long conversion, final-save handoff or native-validation idle interval. Retained current-Wasm counters are last worker reports, not physical post-termination allocation proof." };
}

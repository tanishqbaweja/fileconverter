import assert from "node:assert/strict";

export function inspectSaveHandoffObservation(terminal, report, nativePicker) {
  assert.equal(terminal.status, "failed-not-accepted"); assert.deepEqual(terminal.cleanupErrors, []);
  assert.equal(terminal.productionRestored, true); assert.equal(terminal.wrapperRemoved, true);
  assert.equal(terminal.candidateRemoved, true); assert.equal(report.publicAcceptance, false);
  assert.deepEqual(report.forbiddenRequests, []); assert.equal(report.limitMiB, 250);
  assert.equal(report.blankBaseline.stable, true);
  assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
  assert.ok(report.startupSettlement.actualMs >= 300000);
  assert.equal(report.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  const failure = report.nativeFailureCapture.firstFailure;
  assert.equal(failure.incrementalPrivateMiB, (failure.after.privateBytes - report.blankBaseline.privateBytes) / 1048576);
  assert.ok(failure.incrementalPrivateMiB > 250);
  assert.equal(failure.after.privateBytes, failure.after.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  assert.equal(failure.cause, null);
  assert.equal(report.quiescedBudgetCapture.cancellation.terminalState, "cancelled");
  assert.equal(report.quiescedBudgetCapture.oldWorkerCloseObserved, true);
  assert.equal(report.cleanup.completedSaveFixture.removed, true);
  assert.equal(report.cleanup.protectedFixtureUnchanged, true);
  const control = report.progressProbe.successfulSaveControl, events = report.progressProbe.handoffWorkerEvents;
  let fixture = null;
  if (nativePicker) {
    assert.equal(control.provenance.nativeDiskFilePickerBypass, true);
    assert.equal(control.provenance.validationAssertionsChanged, false);
    assert.equal(control.successfulFixtureValidations, 1);
    const outputs = control.rows.filter(row => row.container === "mp4" && row.status === "passed" && row.sourceCodec === "hevc");
    assert.equal(outputs.length, 1); const output = outputs[0];
    assert.equal(output.outputBytes, 2245626); assert.equal(Number(output.frames), 96);
    assert.equal(output.outputSha256, "8b0d4370068bfa723f7e3a5f11e15369b138fa5bd4415f7a4d7f0b85b59be35c");
    assert.equal(output.ssim, 0.983095); assert.equal(output.metrics.wasmMemoryBytes, 0);
    assert.equal(output.metrics.peakWasmMemoryBytes, 50331648);
    assert.equal(output.metrics.pendingOperations, 0); assert.equal(output.metrics.queuedBytes, 0);
    assert.equal(output.metrics.sharedArrayBufferBytes, 4); assert.equal(output.audioTracks, 2);
    assert.equal(events.filter(row => row.role === "save" && row.event === "created").length, 1);
    assert.equal(events.filter(row => row.role === "save" && row.event === "closed").length, 1);
    const cim = report.samples.filter(row => row.phase === "conversion-completed-save-control" && row.privateBytes != null);
    const native = report.progressProbe.successfulSaveNativePeaks;
    const peak = Math.max(native.peak.privateBytes, ...cim.map(row => row.privateBytes));
    assert.ok((peak - report.blankBaseline.privateBytes) / 1048576 <= 250);
    assert.equal(failure.phase, "conversion-2"); assert.equal(report.runs.length, 2);
    assert.equal(report.runs[0].startupControl.cancellation.terminalState, "cancelled");
    assert.equal(report.runs[1].independentValidation, null); assert.equal(report.runs[1].recovery, null);
    assert.equal(report.quiescedBudgetCapture.stateBefore.metrics.inputBytes, 222785);
    assert.equal(report.quiescedBudgetCapture.stateBefore.metrics.outputBytes, 84142);
    assert.equal(report.quiescedBudgetCapture.stateBefore.metrics.wasmMemoryBytes, 50331648);
    fixture = { bytes: output.outputBytes, sha256: output.outputSha256, frames: 96, ssim: output.ssim,
      nativeSamples: native.validSamples, unavailableSamples: native.unavailableSamples,
      peakPrivateBytes: peak, incrementalPrivateMiB: (peak - report.blankBaseline.privateBytes) / 1048576 };
  } else {
    assert.equal(control.successfulFixtureValidations, 0); assert.equal(report.runs.length, 0);
    assert.equal(failure.phase, "conversion-completed-save-control");
    assert.equal(report.quiescedBudgetCapture.stateBefore.metrics.inputBytes, 0);
    assert.equal(report.quiescedBudgetCapture.stateBefore.metrics.outputBytes, 0);
    assert.equal(events.filter(row => row.role === "save").length, 0);
  }
  return { scope: nativePicker ? "bounded-warm-original-startup-budget-failure-reproduced-after-small-successful-save"
    : "CDP-test-input-materialization-failed-before-fixture-conversion",
    successfulFixtureValidations: control.successfulFixtureValidations, fixture,
    firstBudgetFailureMiB: failure.incrementalPrivateMiB, failurePhase: failure.phase,
    firstFailure: failure, allocationCauseForOriginalFailure: null,
    completedOriginalConversions: 0, fullOriginalAcceptance: false, publicAcceptance: false };
}

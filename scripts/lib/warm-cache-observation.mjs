import assert from "node:assert/strict";

export function inspectWarmCacheFailure(terminal, report, previousReport, build, previousBuild) {
  assert.equal(terminal.status, "failed-not-accepted"); assert.deepEqual(terminal.cleanupErrors, []);
  for (const key of ["productionRestored", "wrapperRemoved", "candidateRemoved"]) assert.equal(terminal[key], true);
  assert.equal(report.runs.length, 0); assert.equal(report.requestedCompletedConversions, 0);
  assert.equal(report.requestedSmallCompletedConversions, 6); assert.equal(report.publicAcceptance, false);
  assert.equal(report.limitMiB, 250); assert.deepEqual(report.forbiddenRequests, []);
  assert.equal(report.blankBaseline.stable, true);
  assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
  assert.ok(report.startupSettlement.actualMs >= 300000);
  assert.deepEqual(build.assets.map(({ role, url, bytes, sha256 }) => ({ role, url, bytes, sha256 })),
    previousBuild.assets.map(({ role, url, bytes, sha256 }) => ({ role, url, bytes, sha256 })));
  assert.equal(build.stylesheet.sha256, previousBuild.stylesheet.sha256);
  assert.deepEqual(report.manifest, previousReport.manifest);
  assert.deepEqual(report.actualWasmMemoryLimits, previousReport.actualWasmMemoryLimits);
  const control = report.progressProbe.successfulSaveControl;
  assert.equal(control.successfulFixtureValidations, 3);
  assert.equal(control.provenance.validationAssertionsChanged, false);
  assert.equal(control.provenance.noPageReloadBetweenJobs, true);
  assert.equal(control.provenance.nativeDiskFilePickerBypass, true);
  const outputs = control.rows.filter(row => row.container === "mp4" && row.status === "passed" && row.sourceCodec === "hevc");
  assert.equal(outputs.length, 3);
  const oldRows = previousReport.progressProbe.successfulSaveControl.rows;
  const oldProof = oldRows.find(row => row.kind === "independent-packet-order-proof");
  const packetProofs = control.rows.filter(row => row.kind === "independent-packet-order-proof");
  assert.equal(packetProofs.length, 3); for (const proof of packetProofs) assert.deepEqual(proof, oldProof);
  for (const row of outputs) {
    assert.equal(row.outputSha256, "8b0d4370068bfa723f7e3a5f11e15369b138fa5bd4415f7a4d7f0b85b59be35c");
    assert.equal(row.outputBytes, 2245626); assert.equal(Number(row.frames), 96); assert.equal(row.ssim, 0.983095);
    assert.equal(row.metrics.peakWasmMemoryBytes, 50331648);
    assert.ok(row.metrics.peakQueuedBytes <= 524288); assert.equal(row.metrics.peakPendingOperations, 1);
    assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.queuedBytes, 0);
  }
  assert.equal(control.rows.filter(row => row.kind === "direct-write-failure" && row.status === "passed").length, 1);
  assert.equal(control.rows.filter(row => row.kind === "validated-same-page-recovery").length, 0);
  assert.equal(control.rows.filter(row => row.kind === "cancel-after-direct-output").length, 0);
  assert.equal(control.rows.filter(row => row.kind === "input-read-failure").length, 0);
  const failure = report.nativeFailureCapture.firstFailure;
  assert.equal(failure.phase, "conversion-completed-save-control"); assert.equal(failure.cause, null);
  assert.equal(failure.incrementalPrivateMiB, (failure.after.privateBytes - report.blankBaseline.privateBytes) / 1048576);
  assert.ok(failure.incrementalPrivateMiB > 250);
  assert.equal(failure.after.privateBytes, failure.after.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  const phase = report.nativeMemory.phases.find(row => row.phase === failure.phase);
  assert.equal(phase.unavailableSamples, 0); assert.ok(phase.validSamples > 0);
  const cim = report.samples.filter(row => row.phase === failure.phase && row.privateBytes != null);
  const peak = Math.max(phase.peak[3], ...cim.map(row => row.privateBytes));
  assert.equal(report.quiescedBudgetCapture.cancellation.terminalState, "cancelled");
  assert.equal(report.quiescedBudgetCapture.oldWorkerCloseObserved, true);
  const metrics = report.quiescedBudgetCapture.stateBefore.metrics;
  assert.equal(metrics.wasmMemoryBytes, 50331648); assert.equal(metrics.peakPendingOperations, 1);
  assert.ok(metrics.peakQueuedBytes <= 65536 && metrics.maxReadChunkBytes <= 65536 && metrics.maxWriteChunkBytes <= 65536);
  const events = report.progressProbe.compiledCacheEvents;
  assert.equal(events.filter(row => row.event === "compiled").length, 2);
  assert.equal(events.filter(row => row.event === "reused").length, 8);
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true);
  assert.equal(report.cleanup.completedSaveFixture.removed, true);
  const renderer = failure.delta.processDeltas.reduce((largest, row) => row.deltaPrivateBytes > largest.deltaPrivateBytes ? row : largest);
  assert.ok(report.samples.some(sample => sample.processes.some(row => row.pid === renderer.pid && row.type === "renderer")));
  return { status: "three-small-cold-warm-outputs-validated-but-post-write-failure-recovery-over-budget",
    completedSmallOutputs: 3, completedWarmOutputs: 2, requestedSmallOutputs: 6,
    outputSha256: outputs[0].outputSha256, outputBytes: outputs[0].outputBytes, frames: 96, ssim: 0.983095,
    elapsedMs: outputs.map(row => row.metrics.elapsedMs), allThreePacketProofsIdentical: true,
    writeFailureHandled: true, completeAdverseRecoveryValidated: false, cancellationFaultTested: false, inputReadFaultTested: false,
    firstNativeBreachMiB: failure.incrementalPrivateMiB, peakPrivateBytes: peak,
    peakIncrementalPrivateMiB: (peak - report.blankBaseline.privateBytes) / 1048576,
    blankPrivateBytes: report.blankBaseline.privateBytes, loadedPrivateBytes: report.loadedIdle.privateBytes,
    conversionValidSamples: phase.validSamples, conversionUnavailableSamples: phase.unavailableSamples,
    rendererAdjacentDelta: renderer, firstFailure: failure, metricsBeforeAutomaticCancellation: metrics,
    allocationCauseProven: false, compiledCacheAloneSufficient: false, repeatUnchanged: false,
    speedGainProven: false, completedOriginalConversions: 0, fullOriginalAcceptance: false, publicAcceptance: false };
}

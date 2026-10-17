import assert from "node:assert/strict";
export function inspectColdRecovery(terminal, report, previousReport, build, previousBuild) {
  assert.equal(terminal.status, "failed-not-accepted"); assert.deepEqual(terminal.cleanupErrors, []);
  for (const key of ["productionRestored", "wrapperRemoved", "candidateRemoved"]) assert.equal(terminal[key], true);
  assert.equal(report.status, "failed-cold-recovery-runtime-diagnostic"); assert.equal(report.progressProbe.successfulSaveControl.successfulFixtureValidations, 0);
  assert.equal(report.requestedSmallCompletedConversions, 6); assert.equal(report.requestedCompletedConversions, 0); assert.equal(report.runs.length, 0);
  assert.deepEqual(report.forbiddenRequests, []); assert.equal(report.limitMiB, 250);
  assert.equal(report.blankBaseline.stable, true); assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes); assert.ok(report.startupSettlement.actualMs >= 300000);
  assert.deepEqual(build.assets.map(({ role, url, bytes, sha256 }) => ({ role, url, bytes, sha256 })), previousBuild.assets.map(({ role, url, bytes, sha256 }) => ({ role, url, bytes, sha256 })));
  assert.equal(report.cssCandidate.css, previousReport.cssCandidate.css); assert.deepEqual(report.manifest, previousReport.manifest);
  const capture = report.progressProbe.coldExecution; assert.ok(capture.startedAt && capture.rawArchive); assert.equal(capture.error, null);
  assert.equal(capture.dataLossOccurred, false); assert.equal(capture.detached, true); assert.ok(capture.bufferUsageMaximum < 0.99);
  assert.equal(capture.noForcedGc, true); assert.equal(capture.browserFlagsChanged, false); assert.equal(capture.codecSettingsChanged, false);
  assert.equal(report.progressProbe.recoveryExecution, undefined);
  const failure = report.nativeFailureCapture.firstFailure; assert.ok(failure.incrementalPrivateMiB > 250);
  assert.equal(failure.after.privateBytes, failure.after.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  const largest = failure.delta.processDeltas.reduce((a, b) => a.deltaPrivateBytes > b.deltaPrivateBytes ? a : b);
  const process = report.samples.flatMap(row => row.processes).find(row => row.pid === largest.pid && Math.abs(Date.parse(row.createdAt) - Date.parse(largest.createdAt)) < 1);
  assert.equal(process.type, "renderer");
  const phase = report.nativeMemory.phases.find(row => row.phase === failure.phase); assert.equal(phase.unavailableSamples, 0);
  const peak = Math.max(phase.peak[3], ...report.samples.filter(row => row.phase === phase.phase && row.privateBytes != null).map(row => row.privateBytes));
  assert.equal(report.quiescedBudgetCapture.cancellation.terminalState, "cancelled"); assert.equal(report.quiescedBudgetCapture.oldWorkerCloseObserved, true);
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true);
  return { status: "cold-conversion-breached-with-complete-unsaturated-runtime-event-trace",
    completedSmallOutputs: 0, completedOriginalConversions: 0, recoveryAttempted: false,
    firstFailure: failure, rendererIdentity: process, adjacentRendererDelta: largest,
    peakIncrementalPrivateMiB: (peak - report.blankBaseline.privateBytes) / 1048576,
    conversionValidSamples: phase.validSamples, conversionUnavailableSamples: phase.unavailableSamples,
    metrics: report.quiescedBudgetCapture.stateBefore.metrics, diagnosticPerturbsMemory: true,
    allocationCauseProven: false, speedGainProven: false, publicAcceptance: false, fullOriginalAcceptance: false };
}

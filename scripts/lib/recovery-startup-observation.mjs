import assert from "node:assert/strict";
export function inspectUntracedStartup(terminal, report, previousReport, build, previousBuild) {
  assert.equal(terminal.status, "failed-not-accepted"); assert.deepEqual(terminal.cleanupErrors, []);
  for (const key of ["productionRestored", "wrapperRemoved", "candidateRemoved"]) assert.equal(terminal[key], true);
  assert.deepEqual(build.assets.map(({ role, url, bytes, sha256 }) => ({ role, url, bytes, sha256 })),
    previousBuild.assets.map(({ role, url, bytes, sha256 }) => ({ role, url, bytes, sha256 })));
  assert.equal(report.cssCandidate.css, previousReport.cssCandidate.css); assert.deepEqual(report.manifest, previousReport.manifest);
  assert.equal(report.progressProbe.recoveryExecution, undefined); assert.equal(report.progressProbe.successfulSaveControl.successfulFixtureValidations, 0);
  assert.equal(report.requestedCompletedConversions, 0); assert.equal(report.requestedSmallCompletedConversions, 6); assert.equal(report.runs.length, 0);
  assert.deepEqual(report.forbiddenRequests, []); assert.equal(report.limitMiB, 250);
  assert.equal(report.blankBaseline.stable, true); assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
  assert.ok(report.startupSettlement.actualMs >= 300000);
  const failure = report.nativeFailureCapture.firstFailure; assert.ok(failure.incrementalPrivateMiB > 250);
  assert.equal(failure.after.privateBytes, failure.after.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  const phase = report.nativeMemory.phases.find(row => row.phase === failure.phase); assert.equal(phase.unavailableSamples, 0);
  const metrics = report.quiescedBudgetCapture.stateBefore.metrics;
  assert.equal(metrics.wasmMemoryBytes, 50331648); assert.equal(metrics.maxReadChunkBytes, 65536);
  assert.equal(report.quiescedBudgetCapture.cancellation.terminalState, "cancelled"); assert.equal(report.quiescedBudgetCapture.oldWorkerCloseObserved, true);
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true);
  return { status: "first-conversion-breached-before-recovery-hook-no-execution-trace", completedSmallOutputs: 0,
    traceStarted: false, recoveryAttempted: false, firstNativeBreachMiB: failure.incrementalPrivateMiB,
    phaseValidSamples: phase.validSamples, metrics, completedOriginalConversions: 0,
    allocationCauseProven: false, speedGainProven: false, publicAcceptance: false, fullOriginalAcceptance: false };
}

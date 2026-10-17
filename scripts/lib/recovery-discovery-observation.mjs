import assert from "node:assert/strict";
export function inspectRecoveryDiscovery(terminal, report, previousReport, build, previousBuild) {
  assert.equal(terminal.status, "failed-not-accepted"); assert.deepEqual(terminal.cleanupErrors, []);
  for (const key of ["productionRestored", "wrapperRemoved", "candidateRemoved"]) assert.equal(terminal[key], true);
  assert.equal(report.status, "failed-recovery-runtime-diagnostic"); assert.equal(report.nativeFailureCapture.firstFailure, null);
  assert.equal(report.requestedSmallCompletedConversions, 6); assert.equal(report.requestedCompletedConversions, 0); assert.equal(report.runs.length, 0);
  assert.equal(report.blankBaseline.stable, true); assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
  assert.ok(report.startupSettlement.actualMs >= 300000); assert.equal(report.limitMiB, 250); assert.deepEqual(report.forbiddenRequests, []);
  assert.deepEqual(build.assets.map(({ role, url, bytes, sha256 }) => ({ role, url, bytes, sha256 })),
    previousBuild.assets.map(({ role, url, bytes, sha256 }) => ({ role, url, bytes, sha256 })));
  assert.equal(report.cssCandidate.css, previousReport.cssCandidate.css); assert.deepEqual(report.manifest, previousReport.manifest);
  const trace = report.progressProbe.recoveryExecution;
  assert.ok(trace.error.includes("Actual browser must expose Wasm events")); assert.equal(trace.startedAt, null); assert.equal(trace.rawArchive, null);
  assert.deepEqual(trace.selectedCategories, []); assert.deepEqual(trace.unavailableCategories, trace.requestedCategories);
  assert.equal(trace.detached, true); assert.equal(trace.budgetFailure, null);
  const control = report.progressProbe.successfulSaveControl; assert.equal(control.successfulFixtureValidations, 3);
  assert.equal(control.provenance.validationAssertionsChanged, false);
  const outputs = control.rows.filter(row => row.container === "mp4" && row.status === "passed"); assert.equal(outputs.length, 3);
  for (const row of outputs) { assert.equal(row.outputBytes, 2245626); assert.equal(row.outputSha256, "8b0d4370068bfa723f7e3a5f11e15369b138fa5bd4415f7a4d7f0b85b59be35c"); assert.equal(Number(row.frames), 96); assert.equal(row.ssim, 0.983095); }
  assert.equal(control.rows.filter(row => row.kind === "direct-write-failure" && row.status === "passed").length, 1);
  assert.equal(control.rows.filter(row => row.kind === "validated-same-page-recovery").length, 0);
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true);
  const phase = report.nativeMemory.phases.find(row => row.phase === "conversion-completed-save-control"); assert.equal(phase.unavailableSamples, 0);
  return { status: "category-discovery-precondition-failed-before-recovery-trace-not-engine-unsupported-proof",
    completedSmallOutputs: 3, writeFailureHandled: true, recoveryAttempted: false, traceStarted: false,
    missingCategoryReplyIsNotUnsupportedEngineProof: true, trace, phaseValidSamples: phase.validSamples,
    unavailableSamplesByPhase: report.nativeMemory.phases.filter(row => row.unavailableSamples).map(({ phase, unavailableSamples }) => ({ phase, unavailableSamples })),
    completedOriginalConversions: 0, speedGainProven: false, publicAcceptance: false, fullOriginalAcceptance: false };
}

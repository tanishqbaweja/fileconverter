import assert from "node:assert/strict";

export function inspectCompiledCacheObservation(terminal, report, build, baselineReport, baselineBuild) {
  assert.equal(terminal.status, "original-startup-controls-finished-pending-audit-not-acceptance");
  assert.equal(terminal.failure, null); assert.deepEqual(terminal.cleanupErrors, []);
  for (const key of ["productionRestored", "wrapperRemoved", "candidateRemoved"]) assert.equal(terminal[key], true);
  assert.equal(report.failure, null); assert.equal(report.publicAcceptance, false);
  assert.equal(report.requestedCompletedConversions, 0); assert.equal(report.runs.length, 3);
  assert.equal(report.limitMiB, 250); assert.deepEqual(report.forbiddenRequests, []);
  assert.equal(report.blankBaseline.stable, true);
  assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
  assert.ok(report.startupSettlement.actualMs >= 300000);
  assert.equal(report.startupSettlement.processesExcluded, 0);
  assert.equal(report.nativeFailureCapture.firstFailure, null);
  assert.equal(report.nativeFailureCapture.unavailableSamples, 0);
  assert.equal(report.source.bytes, 2958573265);
  assert.equal(report.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(build.compiledModuleReuse, true); assert.equal(build.maximumCompiledCodecModules, 2);
  for (const key of ["userDataCached", "instancesShared", "wasmMemoriesSharedAcrossJobs", "progressSamplingChanged",
    "nativeWasmChanged", "codecParametersChanged", "copyLoopChanged", "normalSourcesEdited"]) assert.equal(build[key], false, key);
  const asset = row => ({ role: row.role, url: row.url, bytes: row.bytes, sha256: row.sha256 });
  const saver = rows => rows.filter(row => row.role === "save-worker").map(asset);
  assert.deepEqual(saver(build.assets), saver(baselineBuild.assets));
  const application = build.assets.find(row => row.role === "application");
  assert.deepEqual(report.progressProbe.actualServedAsset, { url: application.url, bytes: application.bytes, sha256: application.sha256 });
  for (const key of ["url", "bytes", "sha256"]) assert.equal(build.stylesheet[key], baselineBuild.stylesheet[key]);
  assert.deepEqual(report.cssCandidate.staticAssets.map(row => row.afterSha256), baselineReport.cssCandidate.staticAssets.map(row => row.afterSha256));
  assert.deepEqual(report.manifest, baselineReport.manifest);
  assert.deepEqual(report.actualWasmMemoryLimits, baselineReport.actualWasmMemoryLimits);
  assert.equal(report.browserVersion, baselineReport.browserVersion);
  assert.deepEqual(report.progressProbe.viewport, baselineReport.progressProbe.viewport);
  const events = report.progressProbe.compiledCacheEvents;
  assert.ok(events.length <= 64);
  assert.equal(events.filter(row => row.event === "compiled").length, 2);
  assert.equal(events.filter(row => row.event === "reused").length, 6);
  assert.equal(events.filter(row => row.event === "retained").length, 1);
  for (const role of ["decoder", "encoder"]) {
    assert.equal(events.filter(row => row.event === "compiled" && row.role === role).length, 1);
    assert.equal(events.filter(row => row.event === "reused" && row.role === role).length, 3);
  }
  for (const row of events) { assert.ok(row.modules <= 2); assert.equal(row.physicalCodeBytes, null); }
  const control = report.progressProbe.successfulSaveControl;
  assert.equal(control.successfulFixtureValidations, 1);
  assert.equal(control.provenance.nativeDiskFilePickerBypass, true);
  assert.equal(control.provenance.validationAssertionsChanged, false);
  const output = value => value.progressProbe.successfulSaveControl.rows.filter(row => row.container === "mp4" && row.status === "passed" && row.sourceCodec === "hevc");
  const outputs = output(report); assert.equal(outputs.length, 1); const fixture = outputs[0];
  assert.equal(fixture.outputSha256, output(baselineReport)[0].outputSha256);
  assert.equal(fixture.outputBytes, 2245626); assert.equal(Number(fixture.frames), 96);
  assert.equal(fixture.outputCodec, "mpeg2video"); assert.equal(fixture.ssim, 0.983095);
  assert.equal(fixture.metrics.peakWasmMemoryBytes, 50331648);
  assert.equal(fixture.metrics.peakPendingOperations, 1); assert.ok(fixture.metrics.peakQueuedBytes <= 524288);
  assert.equal(fixture.metrics.wasmMemoryBytes, 0); assert.equal(fixture.metrics.queuedBytes, 0);
  assert.equal(fixture.metrics.pendingOperations, 0);
  const phases = ["conversion-completed-save-control", "conversion-1", "conversion-2", "conversion-3"].map(name => {
    const row = report.nativeMemory.phases.find(item => item.phase === name); assert.ok(row);
    assert.ok(row.validSamples > 0); assert.equal(row.unavailableSamples, 0);
    assert.equal(row.peak[3], row.peak[7].reduce((sum, process) => sum + process[1], 0));
    const cim = report.samples.filter(sample => sample.phase === name && sample.privateBytes != null);
    const peak = Math.max(row.peak[3], ...cim.map(sample => sample.privateBytes));
    const incrementalPrivateMiB = (peak - report.blankBaseline.privateBytes) / 1048576;
    assert.ok(incrementalPrivateMiB <= 250);
    return { phase: name, peakPrivateBytes: peak, incrementalPrivateMiB, validSamples: row.validSamples, unavailableSamples: row.unavailableSamples };
  });
  const runs = report.runs.map((run, index) => {
    assert.equal(run.number, index + 1); assert.equal(run.startupControl.cancellation.terminalState, "cancelled");
    assert.equal(run.startupControl.fullOutputValidationPerformed, false); assert.equal(run.independentValidation, null);
    const metrics = run.startupControl.beforeCancellation.metrics;
    assert.equal(metrics.wasmMemoryBytes, 50331648); assert.ok(metrics.inputBytes > 222785 && metrics.outputBytes > 84142);
    assert.equal(metrics.peakPendingOperations, 1); assert.ok(metrics.peakQueuedBytes <= 65536);
    assert.ok(metrics.maxReadChunkBytes <= 65536 && metrics.maxWriteChunkBytes <= 65536);
    assert.equal(run.recovery.stable, true);
    return { number: run.number, ...phases[index + 1], recoveryPrivateBytes: run.recovery.privateBytes,
      retainedAboveLoadedMiB: (run.recovery.privateBytes - report.loadedIdle.privateBytes) / 1048576,
      inputBytes: metrics.inputBytes, outputBytes: metrics.outputBytes, elapsedMs: metrics.elapsedMs };
  });
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true);
  assert.equal(report.cleanup.completedSaveFixture.removed, true);
  return { status: "bounded-compiled-module-reuse-startup-controls-fit-pending-full-qualification",
    blankPrivateBytes: report.blankBaseline.privateBytes, loadedPrivateBytes: report.loadedIdle.privateBytes,
    phases, runs, compiledEvents: 2, reusedEvents: 6, maximumCachedModules: 2, physicalCompiledCodeBytes: null,
    fixture: { bytes: fixture.outputBytes, sha256: fixture.outputSha256, frames: 96, ssim: fixture.ssim, elapsedMs: fixture.metrics.elapsedMs },
    baselineOriginalBreachMiB: baselineReport.nativeFailureCapture.firstFailure.incrementalPrivateMiB,
    baselineFixtureElapsedMs: output(baselineReport)[0].metrics.elapsedMs,
    speedGainProven: false, allocationCauseProven: false, warmCompleteOutputValidated: false,
    completedOriginalConversions: 0, fullOriginalAcceptance: false, publicAcceptance: false };
}

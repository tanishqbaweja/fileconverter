import assert from "node:assert/strict";
export function inspectJspiBrowserResult(terminal, report, previousReport, build, previousBuild) {
  assert.equal(terminal.status, "jspi-small-output-controls-finished-pending-audit-not-acceptance");
  assert.equal(terminal.driverExit.code, 0); assert.equal(terminal.failure, null); assert.deepEqual(terminal.cleanupErrors, []);
  for (const key of ["productionRestored", "wrapperRemoved", "candidateRemoved"]) assert.equal(terminal[key], true);
  assert.equal(report.status, "six-small-jspi-outputs-and-adverse-recovery-not-full-acceptance"); assert.equal(report.failure, null);
  assert.equal(report.requestedCompletedConversions, 0); assert.equal(report.requestedSmallCompletedConversions, 6); assert.equal(report.runs.length, 0);
  assert.equal(report.limitMiB, 250); assert.deepEqual(report.forbiddenRequests, []);
  assert.equal(report.blankBaseline.stable, true); assert.ok(report.startupSettlement.actualMs >= 300000);
  assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
  assert.deepEqual(report.nativeFailureCapture.denominator, report.blankBaseline);
  assert.equal(report.nativeFailureCapture.firstFailure, null); assert.equal(report.nativeFailureCapture.additionalOverBudgetSamples, 0);
  assert.deepEqual(report.actualWasmMemoryLimits, previousReport.actualWasmMemoryLimits);
  const binding = ({ role, url, bytes, sha256 }) => ({ role, url, bytes, sha256 });
  assert.deepEqual(build.assets.map(binding), previousBuild.assets.map(binding)); assert.equal(build.stylesheet.sha256, previousBuild.stylesheet.sha256);
  assert.equal(build.catalogueSlotsReused, true); assert.equal(build.maximumMountedCatalogueCards, 24);
  const catalogue = report.progressProbe.boundedCatalogue;
  assert.equal(catalogue.routeCount, 405); assert.equal(catalogue.everyOriginalCardIdentical, true); assert.equal(catalogue.slotReuse.testCounterRemovedBeforeConversion, true);
  assert.equal(report.manifest.jspiComposition.qualifiedPlaneEncoderSha256, "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.equal(report.manifest.artifacts["within-mpeg2-split.wasm"], "4f3954a3cbbd5012c811fa380402981d29ac298d46422d1bc0fa40a6b9368d57");
  assert.equal(report.manifest.asyncifyStorage, undefined); assert.equal(report.manifest.aggregateWasmMemoryBytes, 50331648);
  const control = report.progressProbe.successfulSaveControl; assert.equal(control.successfulFixtureValidations, 6);
  assert.equal(control.provenance.validationAssertionsChanged, false); assert.equal(control.provenance.noPageReloadBetweenJobs, true);
  const outputs = control.rows.filter(row => row.container === "mp4" && row.status === "passed" && row.sourceCodec === "hevc"); assert.equal(outputs.length, 6);
  const oldPacketProof = previousReport.progressProbe.successfulSaveControl.rows.find(row => row.kind === "independent-packet-order-proof");
  const packetProofs = control.rows.filter(row => row.kind === "independent-packet-order-proof"); assert.equal(packetProofs.length, 6);
  for (const proof of packetProofs) assert.deepEqual(proof, oldPacketProof);
  for (const row of outputs) {
    assert.equal(row.outputSha256, "8b0d4370068bfa723f7e3a5f11e15369b138fa5bd4415f7a4d7f0b85b59be35c");
    assert.equal(row.outputBytes, 2245626); assert.equal(Number(row.frames), 96); assert.equal(row.outputCodec, "mpeg2video");
    assert.equal(row.audioTracks, 2); assert.equal(row.ssim, 0.983095); assert.ok(row.ssim >= 0.98);
    assert.equal(row.timestampAlignedSsim, 0.966841); // Retained non-acceptance diagnostic, not mislabelled >=.98.
    assert.equal(row.metrics.peakWasmMemoryBytes, 50331648); assert.equal(row.metrics.maxReadChunkBytes, 65536);
    assert.ok(row.metrics.peakQueuedBytes <= 524288 && row.metrics.maxWriteChunkBytes <= 524288);
    assert.equal(row.metrics.peakPendingOperations, 1); assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.queuedBytes, 0);
  }
  for (const kind of ["direct-write-failure", "cancel-after-direct-output", "input-read-failure"])
    assert.equal(control.rows.filter(row => row.kind === kind && row.status === "passed").length, 1);
  const recoveries = control.rows.filter(row => row.kind === "validated-same-page-recovery");
  assert.deepEqual(recoveries.map(row => row.phase), ["write-failure", "cancellation", "input-read-failure"]);
  for (const row of recoveries) for (const key of ["retiredWorkerAbsent", "productionReplacementWorkerUsed", "completedWorkerRetired", "noPageReload"]) assert.equal(row[key], true);
  assert.equal(control.jspiLifecycle.samples.length, 9);
  for (const sample of control.jspiLifecycle.samples) {
    assert.equal(sample.calls, 1); assert.equal(sample.activeCalls, 0); assert.equal(sample.maximumActiveCalls, 1);
    assert.equal(sample.engineManagedStackMemoryBytes, null); assert.equal(sample.engineManagedStackIncludedInProcessTreeMeasurement, true);
  }
  const phase = report.nativeMemory.phases.find(row => row.phase === "conversion-completed-save-control");
  assert.ok(phase.validSamples > 0); assert.equal(phase.unavailableSamples, 0);
  assert.equal(report.nativeFailureCapture.evaluatedConversionSamples, phase.validSamples);
  assert.equal(phase.peak[3], phase.peak[7].reduce((sum, row) => sum + row[1], 0));
  const cim = report.samples.filter(row => row.phase === phase.phase && row.privateBytes != null);
  for (const sample of cim) assert.equal(sample.privateBytes, sample.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  assert.ok(cim.some(sample => sample.processes.some(row => row.type === "gpu-process")));
  assert.ok(cim.some(sample => sample.processes.some(row => row.type === "browser")));
  const peak = Math.max(phase.peak[3], ...cim.map(row => row.privateBytes)), incremental = (peak - report.blankBaseline.privateBytes) / 1048576;
  assert.ok(incremental <= 250); assert.equal(report.progressProbe.handoffWorkerEventSummary.firstError, null);
  assert.equal(report.progressProbe.handoffWorkerEventSummary.maximumHistoryRecords, 32);
  assert.ok(report.progressProbe.handoffWorkerEventSummary.totalEvents > 32); assert.ok(report.progressProbe.handoffWorkerEvents.length <= 32);
  assert.equal(report.progressProbe.compiledCacheEvents.filter(row => row.event === "compiled").length, 2);
  assert.equal(report.progressProbe.compiledCacheEvents.filter(row => row.event === "reused").length, 16);
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true);
  assert.equal(report.cleanup.completedSaveFixture.removed, true);
  return { status: "six-genuine-small-jspi-conversions-and-all-adverse-recoveries-verified-below-budget",
    completedSmallOutputs: 6, completedOriginalConversions: 0, allSixOutputBytesAndPacketProofsIdenticalToQualifiedParent: true,
    outputBytes: 2245626, outputSha256: outputs[0].outputSha256, sourceCodec: "hevc", outputCodec: "mpeg2video", frames: 96,
    ordinalSsim: 0.983095, timestampAlignedDiagnosticSsim: 0.966841, elapsedMs: outputs.map(row => row.metrics.elapsedMs),
    blankPrivateBytes: report.blankBaseline.privateBytes, loadedPrivateBytes: report.loadedIdle.privateBytes,
    peakPrivateBytes: peak, peakIncrementalPrivateMiB: incremental, loadedSiteOverheadMiB: (report.loadedIdle.privateBytes - report.blankBaseline.privateBytes) / 1048576,
    conversionOnlyOverheadMiB: (peak - report.loadedIdle.privateBytes) / 1048576, conversionValidSamples: phase.validSamples,
    conversionUnavailableSamples: phase.unavailableSamples, finalSaveBufferBytes: 524288, nativeReadBufferBytes: 65536,
    completeAdverseRecoveryValidated: true, fixedWasmBytes: 50331648, vmStackBytes: null,
    unpairedHistoricalComparisonOnly: true, speedGainProven: false, fullOriginalAcceptance: false, scalingAcceptance: false, publicAcceptance: false };
}

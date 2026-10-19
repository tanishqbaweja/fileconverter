import assert from "node:assert/strict";
import { validateJspiLifecycle } from "./jspi-browser-control.mjs";
export function inspectThreeFullJspiRuns(terminal, report) {
  assert.equal(terminal.status, "jspi-three-full-original-runs-finished-pending-audit-not-public-acceptance");
  assert.equal(terminal.driverExit.code, 0); assert.equal(terminal.failure, null); assert.deepEqual(terminal.cleanupErrors, []);
  assert.equal(report.status, "three-full-jspi-original-runs-completed-not-public-acceptance"); assert.equal(report.failure, null);
  assert.equal(report.runs.length, 3); assert.equal(report.requestedRuns, 3); assert.equal(report.requestedCompletedConversions, 3);
  assert.equal(report.limitMiB, 250); assert.deepEqual(report.forbiddenRequests, []); assert.equal(report.publicAcceptance, false);
  assert.equal(report.blankBaseline.stable, true); assert.ok(report.startupSettlement.actualMs >= 300000);
  assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
  assert.deepEqual(report.nativeFailureCapture.denominator, report.blankBaseline);
  assert.equal(report.nativeFailureCapture.firstFailure, null); assert.equal(report.nativeFailureCapture.additionalOverBudgetSamples, 0);
  assert.equal(report.progressProbe.jspiFullValidatedRuns.length, 3);
  const rows = report.runs.map((run, index) => {
    assert.equal(run.number, index + 1); assert.equal(run.state.jobState, "complete");
    const proof = run.independentValidation, metrics = run.state.metrics;
    assert.equal(proof.outputBytes, 6414309978); assert.equal(proof.sha256, "2b1277805033e824425ba0542de83d486c967d2755952ac30b57ce5c5d08024e");
    assert.equal(proof.frameCount, 296160); assert.equal(proof.fullDecode, true); assert.ok(proof.ssim >= 0.98);
    assert.ok(proof.maximumTimestampErrorSeconds <= 0.001); assert.deepEqual(run.preSsimOutput, { outputBytes: proof.outputBytes, sha256: proof.sha256 });
    assert.equal(run.independentSsimDiagnostic.status, "numeric-summary"); assert.equal(run.independentSsimDiagnostic.score, proof.ssim);
    assert.equal(run.recovery.stable, true); assert.ok(run.recovery.privateBytes <= report.loadedIdle.privateBytes + 96 * 1048576);
    assert.equal(metrics.maxReadChunkBytes, 65536); assert.equal(metrics.maxWriteChunkBytes, 524288);
    assert.equal(metrics.peakWasmMemoryBytes, 50331648); assert.equal(metrics.wasmMemoryBytes, 0);
    assert.ok(metrics.peakQueuedBytes <= 1048576); assert.equal(metrics.peakPendingOperations, 1);
    assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0);
    validateJspiLifecycle(run.jspiLifecycle); assert.equal(run.jspiLifecycle.failedCalls, 0);
    const phase = report.nativeMemory.phases.find(row => row.phase === `conversion-${run.number}`);
    assert.ok(phase.validSamples > 0); assert.equal(phase.unavailableSamples, 0);
    assert.equal(phase.peak[3], phase.peak[7].reduce((sum, row) => sum + row[1], 0));
    const prePhase = report.nativeMemory.phases.find(row => row.phase === `pre-conversion-${run.number}`);
    assert.equal(run.nativePeaks.peak.privateBytes, Math.max(phase.peak[3], prePhase.peak[3]));
    assert.equal(run.nativePeaks.peak.privateBytes, run.nativePeaks.peak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
    const peak = Math.max(run.cimPeakPrivateBytes, run.nativePeaks.peak.privateBytes);
    assert.equal(run.peakPrivateBytes, peak); assert.equal(run.incrementalPrivateMiB, (peak - report.blankBaseline.privateBytes) / 1048576);
    assert.ok(run.incrementalPrivateMiB <= 250);
    return { number: run.number, outputBytes: proof.outputBytes, outputSha256: proof.sha256, frames: proof.frameCount,
      ssim: proof.ssim, maximumTimestampErrorSeconds: proof.maximumTimestampErrorSeconds, elapsedMs: metrics.elapsedMs,
      incrementalPrivateMiB: run.incrementalPrivateMiB, conversionSamples: phase.validSamples,
      recoveryPrivateBytes: run.recovery.privateBytes, recoveryAboveLoadedMiB: (run.recovery.privateBytes - report.loadedIdle.privateBytes) / 1048576 };
  });
  // A long independent validation may legitimately evict conversion CIM rows
  // from the fixed1024 ring. Per-run native peak/process rows remain retained.
  const cim = report.samples.filter(row => row.privateBytes != null);
  assert.ok(cim.length > 0);
  for (const sample of cim) assert.equal(sample.privateBytes, sample.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  assert.ok(cim.some(sample => sample.processes.some(row => row.type === "gpu-process")));
  const gpuBirths = cim.flatMap(sample => sample.processes.filter(row => row.type === "gpu-process"));
  for (const run of report.runs) assert.ok(run.nativePeaks.peak.processes.some(row => gpuBirths.some(gpu =>
    gpu.pid === row.pid && Math.abs(Date.parse(gpu.createdAt) - Date.parse(row.createdAt)) < 1)), "GPU birth must be included in every native peak");
  assert.equal(report.progressProbe.compiledCacheEvents.filter(row => row.event === "compiled").length, 2);
  assert.equal(report.progressProbe.compiledCacheEvents.filter(row => row.event === "reused").length, 4);
  assert.equal(report.progressProbe.handoffWorkerEventSummary.firstError, null);
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true);
  for (const key of ["productionRestored", "wrapperRemoved", "candidateRemoved"]) assert.equal(terminal[key], true);
  return { status: "three-same-session-full-original-jspi-runs-independently-validated-below-budget", rows,
    worstIncrementalPrivateMiB: Math.max(...rows.map(row => row.incrementalPrivateMiB)),
    cleanupRecoveryPrivateBytes: rows.map(row => row.recoveryPrivateBytes),
    cleanupRecoveryDriftBytes: rows.map(row => row.recoveryPrivateBytes - rows[0].recoveryPrivateBytes),
    sameSessionThreeRunsVerified: true, newColdSessionRepeatVerified: false, scalingAcceptance: false,
    speedGainProven: false, publicAcceptance: false };
}

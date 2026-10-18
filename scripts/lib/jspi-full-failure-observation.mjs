import assert from "node:assert/strict";
import { validateJspiLifecycle } from "./jspi-browser-control.mjs";
export function inspectJspiFullFailure(terminal, report) {
  assert.equal(terminal.status, "failed-not-accepted"); assert.equal(terminal.driverExit.code, 1);
  assert.deepEqual(terminal.cleanupErrors, []); assert.equal(report.status, "failed-jspi-full-qualification");
  assert.match(report.failure.message, /SSIM parser failed/); assert.equal(report.runs.length, 1);
  assert.equal(report.requestedRuns, 3); assert.equal(report.requestedCompletedConversions, 3);
  assert.equal(report.limitMiB, 250); assert.deepEqual(report.forbiddenRequests, []);
  assert.equal(report.blankBaseline.stable, true); assert.ok(report.startupSettlement.actualMs >= 300000);
  assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
  assert.deepEqual(report.nativeFailureCapture.denominator, report.blankBaseline);
  assert.equal(report.nativeFailureCapture.firstFailure, null);
  const run = report.runs[0], metrics = run.state.metrics;
  assert.equal(run.state.jobState, "complete"); assert.equal(run.independentValidation, null); assert.equal(run.recovery, null);
  assert.equal(run.independentSsimDiagnostic.status, "missing-summary"); assert.equal(run.independentSsimDiagnostic.score, null);
  assert.equal(metrics.outputBytes, 6414309978); assert.equal(metrics.maxReadChunkBytes, 65536);
  assert.equal(metrics.peakWasmMemoryBytes, 50331648); assert.equal(metrics.wasmMemoryBytes, 0);
  assert.equal(metrics.maxWriteChunkBytes, 524288); assert.equal(metrics.peakQueuedBytes, 524288);
  assert.equal(metrics.peakPendingOperations, 1); assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0);
  const video = run.independentPreAssertionProbe.streams.find(row => row.codec_type === "video" && !row.disposition?.attached_pic);
  assert.equal(video.codec_name, "mpeg2video"); assert.equal(video.width, 1920); assert.equal(video.height, 804); assert.equal(Number(video.nb_read_frames), 296160);
  const ownership = report.splitFinalSamples[0]; assert.equal(ownership.frames, 296160); assert.equal(ownership.completedPackets, 296160);
  assert.equal(ownership.failed, false); assert.equal(ownership.closed, true); assert.equal(ownership.activePackets, 0);
  assert.equal(ownership.queuedFrames, 0); assert.equal(ownership.queuedPackets, 0);
  validateJspiLifecycle(run.jspiLifecycle); assert.equal(run.jspiLifecycle.failedCalls, 0);
  const phase = report.nativeMemory.phases.find(row => row.phase === "conversion-1");
  assert.ok(phase.validSamples > 0); assert.equal(phase.unavailableSamples, 0);
  assert.equal(phase.peak[3], phase.peak[7].reduce((sum, row) => sum + row[1], 0));
  const cim = report.samples.filter(row => row.phase === "conversion-1" && row.privateBytes != null);
  assert.ok(cim.length > 0);
  for (const sample of cim) assert.equal(sample.privateBytes, sample.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  assert.ok(cim.some(sample => sample.processes.some(row => row.type === "gpu-process")));
  const peak = Math.max(phase.peak[3], ...cim.map(row => row.privateBytes));
  assert.equal(run.peakPrivateBytes, peak); assert.equal(run.incrementalPrivateMiB, (peak - report.blankBaseline.privateBytes) / 1048576);
  assert.ok(run.incrementalPrivateMiB <= 250);
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true);
  for (const key of ["productionRestored", "wrapperRemoved", "candidateRemoved"]) assert.equal(terminal[key], true);
  return { status: "full-browser-encode-completed-below-budget-quality-parser-failed-not-accepted",
    attemptedRuns: 1, browserCompletedRuns: 1, fullyValidatedRuns: 0, outputBytes: metrics.outputBytes,
    outputSha256: null, outputCodec: video.codec_name, frames: 296160, elapsedMs: metrics.elapsedMs,
    peakPrivateBytes: peak, blankPrivateBytes: report.blankBaseline.privateBytes,
    peakIncrementalPrivateMiB: run.incrementalPrivateMiB, nativeConversionSamples: phase.validSamples,
    nativeUnavailableConversionSamples: phase.unavailableSamples, ssim: null, postValidationIdleRecovery: null,
    missingSummaryIsNotLowQuality: true, publicAcceptance: false, fullOriginalAcceptance: false, speedGainProven: false };
}

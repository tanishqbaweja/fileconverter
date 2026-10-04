import assert from "node:assert/strict";
import { startupConversionOverlap } from "./h264-stress-profile.mjs";

// This records an observed failure, never a partial-output or memory pass.
export function summarizeH264StartupFailure(report) {
  assert.equal(report.status, "failed");
  assert.equal(report.publicAcceptance, false);
  assert.equal(report.stressProfile.name, "startup-scaling");
  assert.equal(report.fixtureDurationSeconds, 600);
  assert.equal(report.cpuEnabled, false);
  assert.equal(report.requestedRunCount, 3);
  assert.equal(report.primaryLimitMiB, 250);
  assert.equal(report.formula, "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory");
  assert.ok(report.source.bytes > 1024 ** 3 / 1.1);
  assert.equal(report.source.frameTimes.length, 18000);
  assert.equal(report.source.probe.streams[0].codec_name, "mpeg4");
  assert.equal(report.source.probe.streams[0].width, 1280);
  assert.equal(report.source.probe.streams[0].height, 720);
  assert.equal(report.runs.length, 1);
  const run = report.runs[0], metrics = run.state.metrics;
  assert.equal(run.state.jobState, "error");
  assert.equal(run.independentValidation, null);
  assert.equal(run.cleanup, null, "Idle recovery was not reached; finally cleanup is separate");
  assert.match(run.state.error, /Cannot enlarge memory arrays to size 33586120 bytes/);
  assert.match(run.state.error, /Object.allocateData/);
  assert.equal(report.asBuiltManifest.initialWasmMemoryBytes, 32 * 1024 ** 2);
  assert.equal(report.asBuiltManifest.maximumWasmMemoryBytes, 32 * 1024 ** 2);
  assert.equal(report.asBuiltManifest.allowMemoryGrowth, false);
  assert.equal(report.asBuiltManifest.openh264SadSimd, true);
  assert.equal(report.asBuiltManifest.openh264VaaSimd, false);
  assert.equal(report.asBuiltManifest.libraryLinkTimeOptimization, false);
  const active = report.samples.filter((s) => ["pre-conversion-1", "conversion-1"].includes(s.phase) && s.privateBytes != null);
  assert.ok(active.length > 2);
  for (const sample of active) {
    assert.ok(sample.privateBytes > 0 && Array.isArray(sample.processes) && sample.processes.length > 0);
    assert.ok(sample.processes.every((p) => Number.isFinite(p.privateBytes) && p.privateBytes > 0));
    assert.equal(sample.privateBytes, sample.processes.reduce((sum, p) => sum + p.privateBytes, 0));
  }
  const peakPrivateBytes = Math.max(...active.map((s) => s.privateBytes));
  assert.equal(run.peakPrivateBytes, peakPrivateBytes);
  assert.equal(run.completeTreeSamples, active.length);
  assert.equal(report.blankBaseline.stable, true);
  assert.ok(report.blankBaseline.privateBytes > 0);
  const observedIncrementalPrivateMiB = (peakPrivateBytes - report.blankBaseline.privateBytes) / 1024 ** 2;
  assert.equal(run.incrementalPrivateMiB, observedIncrementalPrivateMiB);
  assert.equal(metrics.peakWasmMemoryBytes, 32 * 1024 ** 2);
  assert.ok(metrics.maxReadChunkBytes <= 262144 && metrics.maxWriteChunkBytes <= 262144);
  assert.ok(metrics.peakQueuedBytes <= 262144 && metrics.peakPendingOperations <= 1);
  assert.equal(metrics.queuedBytes, 0); assert.equal(metrics.pendingOperations, 0);
  assert.ok(metrics.inputBytes > 0 && metrics.inputBytes < report.source.bytes);
  assert.ok(metrics.outputBytes > 0);
  assert.deepEqual(report.forbiddenRequests, []);
  assert.equal(report.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved, true);
  assert.equal(report.cleanup.generatedDistRestored, true);
  const startupOverlap = startupConversionOverlap(report.samples);
  assert.deepEqual(report.startupOverlap, startupOverlap);
  assert.equal(startupOverlap.observed, false);
  assert.ok(startupOverlap.latestBrowserAgeMs < 180000);
  return {
    status: "failed-fixed-32mib-asyncify-allocation-not-accepted",
    sourceBytes: report.source.bytes, sourceSha256: report.source.sha256, sourceFrames: 18000,
    inputBytesAtFailure: metrics.inputBytes, partialOutputBytesDeleted: metrics.outputBytes,
    elapsedObservedMs: run.elapsedObservedMs, observedIncrementalPrivateMiB,
    fixedWasmBytes: metrics.peakWasmMemoryBytes, completeTreeSamples: active.length,
    startupOverlap, startupUtilityWindowReached: false,
    allocationFailureSite: "Asyncify.allocateData requesting its configured 1048576-byte stack plus header",
    underlyingRetainedAllocationOrFragmentationCauseProven: false,
    completedConversions: 0, independentlyValidatedOutputs: 0,
    memoryAcceptance: false, scalingAcceptance: false, publicAcceptance: false,
    repeatabilityAcceptance: false, idleRecoveryAcceptance: false,
    privacyViolationObserved: false, finallyCleanupCompleted: true,
  };
}

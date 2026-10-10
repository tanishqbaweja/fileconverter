// Post-terminal facts only. A below-budget error or partial output is not a pass.
import assert from "node:assert/strict";
import { fullProgressNativeFacts } from "./progress-compositing-full-recipe.mjs";
export { fullProgressNativeFacts as recomputeFullSessionNativeFacts };
export function encoderPlaneTerminalFacts(raw) {
  assert.ok(["failed", "passed-private-protected-session"].includes(raw.status));
  assert.equal(raw.diagnosticOnly, false); assert.equal(raw.requestedRuns, 3);
  assert.equal(raw.source.path, "test.mkv"); assert.equal(raw.source.bytes, 2958573265);
  assert.equal(raw.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(raw.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.equal(raw.manifest.artifacts["within-mpeg2-split.wasm"], "86704920f30ed243240614df92d05deba9f76c33e739a927903677b677f8a8ec");
  assert.equal(raw.manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(raw.manifest.allowMemoryGrowth, false);
  assert.deepEqual(raw.actualWasmMemoryLimits, {
    decoderMux: [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }],
    encoder: [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }],
  });
  const p = raw.progressProbe;
  assert.equal(p.mode, "encoder-plane-full-completion"); assert.equal(p.fullCompletionRequired, true);
  assert.equal(p.partialOutputStopEnabled, false); assert.equal(p.maximumConversionMs, 21600000);
  assert.equal(p.checkpointOutputBytes, null); assert.equal(p.checkpointReached, false);
  assert.equal(p.jsAllocationSamplingEnabled, false); assert.equal(raw.conversionJsReport, null);
  assert.deepEqual(raw.forbiddenRequests, []); assert.equal(raw.blankBaseline.stable, true);
  assert.equal(raw.startupSettlement.pageStayedBlank, true); assert.equal(raw.startupSettlement.processesExcluded, 0);
  assert.equal(raw.startupSettlement.baselineInflated, false); assert.equal(raw.startupSettlement.flagsChanged, false);
  assert.ok(Array.isArray(raw.runs) && raw.runs.length > 0 && raw.runs.length <= 3);
  assert.equal(raw.abortDiagnostic.captureError, null); assert.equal(raw.abortDiagnostic.noForcedGc, true);
  assert.equal(raw.abortDiagnostic.noDebuggerPause, true); assert.equal(raw.abortDiagnostic.syntheticMallocInvoked, false);
  const native = fullProgressNativeFacts(raw);
  const phaseCoverage = native.phaseCoverage;
  const missingSamples = phaseCoverage.reduce((sum, row) => {
    assert.ok(Number.isSafeInteger(row.unavailableSamples) && row.unavailableSamples >= 0);
    assert.ok(Number.isSafeInteger(row.validSamples) && row.validSamples > 0);
    return sum + row.unavailableSamples;
  }, 0);
  const completed = [];
  for (const [index, run] of raw.runs.entries()) {
    assert.equal(run.number, index + 1);
    if (run.state?.jobState !== "complete" || !run.independentValidation) continue;
    assert.ok(phaseCoverage.some(row => row.phase === `conversion-${run.number}`));
    const m = run.state.metrics, v = run.independentValidation;
    assert.equal(m.wasmMemoryBytes, 50331648); assert.equal(m.peakWasmMemoryBytes, 50331648);
    assert.ok(m.maxReadChunkBytes > 0 && m.maxReadChunkBytes <= 262144);
    assert.ok(m.maxWriteChunkBytes > 0 && m.maxWriteChunkBytes <= 524288);
    assert.ok(m.peakQueuedBytes <= 1048576 && m.peakPendingOperations <= 1);
    assert.equal(m.pendingOperations, 0); assert.equal(m.queuedBytes, 0); assert.equal(run.state.opfsName, null);
    assert.equal(v.fullDecode, true); assert.ok(v.ssim >= 0.98 && v.ssim <= 1);
    assert.ok(v.maximumTimestampErrorSeconds >= 0 && v.maximumTimestampErrorSeconds <= 0.001);
    assert.ok(Number.isSafeInteger(v.frameCount) && v.frameCount > 0);
    assert.equal(v.outputBytes, m.outputBytes); assert.ok(v.outputBytes > 0);
    assert.match(v.sha256, /^[a-f0-9]{64}$/);
    const video = v.probe.streams.filter(s => s.codec_type === "video" && !s.disposition?.attached_pic);
    assert.equal(video.length, 1); assert.equal(video[0].codec_name, "mpeg2video");
    assert.equal(video[0].width, 1920); assert.equal(video[0].height, 804);
    assert.equal(Number(video[0].nb_read_frames), v.frameCount);
    const ownership = raw.splitFinalSamples[index]; assert.ok(ownership);
    for (const field of ["frames", "packets", "completedPackets"]) assert.equal(ownership[field], v.frameCount);
    assert.equal(ownership.closed, true); assert.equal(ownership.aggregateWasmMemoryBytes, 50331648);
    for (const field of ["activePackets", "queuedPackets", "queuedFrames", "additionalPixelBufferBytes", "additionalJsPacketBufferBytes"])
      assert.equal(ownership[field], 0);
    assert.ok(run.recovery?.stable && run.recovery.privateBytes <= raw.loadedIdle.privateBytes + 96 * 1048576);
    completed.push({ number: run.number, outputBytes: v.outputBytes, outputSha256: v.sha256,
      frameCount: v.frameCount, ssim: v.ssim, maximumTimestampErrorSeconds: v.maximumTimestampErrorSeconds,
      elapsedMs: m.elapsedMs, recoveryPrivateBytes: run.recovery.privateBytes });
  }
  const fullyValidated = raw.status === "passed-private-protected-session" && raw.failure === null && completed.length === 3;
  if (raw.status === "passed-private-protected-session") assert.equal(fullyValidated, true, "Partial/failed validation cannot inherit passed status");
  const sessionGatePassed = fullyValidated && !native.primaryLimitExceededInObservedWindow && missingSamples === 0;
  const firstAbort = raw.abortDiagnostic.records[0] ?? null;
  const attemptedHeapExtentBytes = firstAbort ? Number(firstAbort.reason?.match(/to size (\d+) bytes/)?.[1]) || null : null;
  return { status: sessionGatePassed ? "three-full-original-runs-session-gates-passed-not-public-acceptance" : "failed-or-incomplete-full-original-session-not-acceptance",
    native, requestedRuns: 3, attemptedRuns: raw.runs.length, completedConversions: completed.length, validatedRuns: completed,
    unavailableNativeConversionSamples: missingSamples, missingSamplesNeverRecordedAsZero: true,
    observedMemoryWithinLimit: !native.primaryLimitExceededInObservedWindow,
    fullOriginalSessionGatePassed: sessionGatePassed,
    observedFirstAbort: firstAbort ? { role: firstAbort.role, reason: firstAbort.reason, stack: firstAbort.stack,
      observedAt: firstAbort.observedAt, attemptedHeapExtentBytes,
      failedIndividualAllocationBytes: firstAbort.failedIndividualAllocationBytes ?? null,
      heapLiveBytes: firstAbort.heapLiveBytes ?? null, fragmentationCauseProven: false,
      requestedHeapExtentIsIndividualAllocation: false } : null,
    independentValidationOutsideBrowser: true, additionalCleanSessionRequired: true, scalingAcceptance: false,
    conversionSpeedAcceptance: false, publicAcceptance: false, goalComplete: false };
}

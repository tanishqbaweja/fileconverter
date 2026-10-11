// Terminal-only extension. Partial work and an under-limit window never count as a pass.
import assert from "node:assert/strict";
import { encoderPlaneClockTerminalFacts } from "./encoder-plane-clock-terminal-facts.mjs";
import { validateFullBitrateAudit } from "./encoder-plane-bitrate-full-recipe.mjs";
export function encoderPlaneBitrateTerminalFacts(raw) {
  const facts = encoderPlaneClockTerminalFacts(raw);
  assert.ok(Array.isArray(raw.bitrateAuditSamples) && raw.bitrateAuditSamples.length <= 3);
  assert.ok(raw.bitrateAuditSamples.length <= raw.runs.length);
  for (const sample of raw.bitrateAuditSamples) validateFullBitrateAudit(sample);
  for (const [index, run] of raw.runs.entries()) {
    if (run.independentValidation) {
      assert.deepEqual(run.nativeBitrateConfiguration, raw.bitrateAuditSamples[index]);
      assert.equal(run.independentSsimDiagnostic.status, "numeric-summary");
      assert.equal(run.independentSsimDiagnostic.score, run.independentValidation.ssim);
      assert.ok(run.independentValidation.ssim >= 0.98);
    }
  }
  if (facts.fullOriginalSessionGatePassed) assert.equal(raw.bitrateAuditSamples.length, 3);
  const abort = raw.abortDiagnostic.records[0] ?? null;
  const frameAllocationPath = abort?.role === "decoder" &&
    ["av_buffer_allocz", "avcodec_default_get_buffer2", "alloc_frame", "hevc_receive_frame"]
      .every(symbol => abort.stack.includes("within-mpeg2-split.wasm." + symbol));
  return { ...facts, bitrateSpecificAudit: true, actualNativeBitRate: raw.bitrateAuditSamples.length ? 4000000 : null,
    actualNativeConfigurationSamples: raw.bitrateAuditSamples,
    partialFailedRuns: raw.runs.filter(run => run.state?.jobState !== "complete").map(run => ({
      number: run.number, state: run.state?.jobState ?? null, processedInputBytes: run.state?.metrics?.inputBytes ?? null,
      generatedPartialOutputBytes: run.state?.metrics?.outputBytes ?? null, elapsedMs: run.state?.metrics?.elapsedMs ?? null,
      numericSsim: run.independentSsimDiagnostic?.score ?? null, qualityAccepted: false,
      qualityValidationReached: Boolean(run.independentSsimDiagnostic), acceptedOutputBytes: 0 })),
    failedAllocationObservation: abort ? {
      observedCallPath: frameAllocationPath ? "HEVC frame allocation via avcodec_default_get_buffer2/av_buffer_allocz" : "unclassified-captured-native-abort",
      exactNativeAbortCallPathRetained: !abort.stackTruncated && abort.stackLimitRestored,
      attemptedHeapExtentBytes: facts.observedFirstAbort.attemptedHeapExtentBytes,
      requestedHeapExtentIsIndividualAllocation: false,
      failedIndividualAllocationBytes: abort.failedIndividualAllocationBytes ?? null,
      heapLiveBytes: abort.heapLiveBytes ?? null,
      poolRequest: abort.latePoolRequest ?? null, poolRequestUnavailable: abort.latePoolRequestUnavailable ?? null,
      allocatorFreeBlocks: abort.allocatorFreeBlocks ?? null, allocatorFreeBlocksUnavailable: abort.allocatorFreeBlocksUnavailable ?? null,
      fragmentationCauseProven: false, allocationRetentionRootCauseProven: false,
      sameFailedConfigurationShouldBeRepeated: false } : null,
    conversionSpeedAcceptance: false, publicAcceptance: false, goalComplete: false };
}

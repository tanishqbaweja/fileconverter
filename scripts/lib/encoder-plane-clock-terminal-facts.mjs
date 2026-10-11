// Strict post-terminal observer join, not retroactive quality acceptance.
import assert from "node:assert/strict";
import { encoderPlaneTitleTerminalFacts } from "./encoder-plane-title-terminal-facts.mjs";
import { NATIVE_RECEIPT_CLOCK_LIMITS } from "./native-receipt-clock-fence.mjs";
import { NATIVE_FAILURE_LIMITS } from "./native-budget-failure-observer.mjs";
export function encoderPlaneClockTerminalFacts(raw) {
  // ALL existing full-source/whole-tree/formula/fidelity/recovery gates first.
  const facts = encoderPlaneTitleTerminalFacts(raw);
  const history = raw.nativeMemory, tracker = raw.nativeFailureCapture, fence = history.receiptClockFence;
  assert.equal(history.error, null); assert.deepEqual(tracker.limits, NATIVE_FAILURE_LIMITS);
  assert.ok(Number.isSafeInteger(history.sequence) && history.sequence > 0);
  assert.equal(tracker.sequence, history.sequence, "Every native row reaches both original consumers");
  assert.deepEqual(tracker.denominator, raw.blankBaseline, "Unchanged stable blank denominator");
  assert.equal(tracker.acceptanceMetric, false); assert.equal(tracker.maximumPendingCallbacks, 1);
  assert.equal(tracker.callbackQueueLength, 0); assert.equal(tracker.rawNativePeaksRemainComplete, true);
  let allRows = 0, unavailable = 0, eligible = 0;
  for (const phase of history.phases) {
    for (const field of ["validSamples", "unavailableSamples"]) assert.ok(Number.isSafeInteger(phase[field]) && phase[field] >= 0);
    allRows += phase.validSamples + phase.unavailableSamples; unavailable += phase.unavailableSamples;
    if (/^(pre-conversion-|conversion-)/.test(phase.phase)) eligible += phase.validSamples;
  }
  assert.equal(allRows, history.sequence); assert.equal(unavailable, tracker.unavailableSamples);
  assert.equal(eligible, tracker.evaluatedConversionSamples);
  assert.deepEqual(fence.limits, NATIVE_RECEIPT_CLOCK_LIMITS);
  for (const field of ["originalTimestampAssertionsUnchanged", "monitorClosed"]) assert.equal(fence[field], true);
  for (const field of ["samplesDropped", "timestampsRewritten"]) assert.equal(fence[field], 0);
  assert.equal(fence.maximumRetainedBatches, 1); assert.equal(fence.fenceFailure, null);
  assert.equal(fence.failedBatch, null); assert.equal(fence.failedBatchLocation, null); assert.equal(fence.failedBatchUnavailable, false);
  assert.equal(fence.publicAcceptance, false); assert.equal(fence.historicalClockFailureCauseProven, false);
  assert.ok(Number.isSafeInteger(fence.batches) && fence.batches > 0);
  assert.ok(Number.isSafeInteger(fence.waitedBatches) && fence.waitedBatches >= 0 && fence.waitedBatches <= fence.batches);
  for (const field of ["maximumWaitMs", "maximumFirstAheadMs"])
    assert.ok(Number.isFinite(fence[field]) && fence[field] >= 0 && fence[field] <= NATIVE_RECEIPT_CLOCK_LIMITS.maximumWaitMs);
  assert.ok(Array.isArray(fence.recentWaits) && fence.recentWaits.length <= 16 && fence.recentWaits.length <= fence.waitedBatches);
  for (const wait of fence.recentWaits) {
    assert.ok(Number.isFinite(wait.observedAt)); assert.ok(Number.isFinite(wait.waitedMs) && wait.waitedMs >= 0 && wait.waitedMs <= fence.maximumWaitMs);
    assert.ok(Number.isFinite(wait.firstAheadMs) && wait.firstAheadMs > 0 && wait.firstAheadMs <= fence.maximumFirstAheadMs);
    assert.ok(Number.isSafeInteger(wait.samples) && wait.samples >= 0 && wait.samples <= NATIVE_RECEIPT_CLOCK_LIMITS.maximumSamples);
  }
  assert.deepEqual(tracker.receiptClockFence, fence);
  const nativeOverBudget = history.phases.some(phase => /^(pre-conversion-|conversion-)/.test(phase.phase) &&
    phase.peak && phase.peak[3] - raw.blankBaseline.privateBytes > NATIVE_FAILURE_LIMITS.incrementalPrivateBytes);
  if (!nativeOverBudget) {
    assert.equal(tracker.firstFailure, null); assert.equal(tracker.additionalOverBudgetSamples, 0); assert.equal(tracker.callback, null);
  } else assert.ok(tracker.firstFailure?.incrementalPrivateMiB > 250);
  return { ...facts, clockSpecificAudit: true,
    nativeRowConsumersAgree: true, rowsCountedWithoutDropping: allRows,
    evaluatedConversionSamples: eligible, observerClosedAndClockFenceValid: true,
    actualWaitedBatches: fence.waitedBatches, maximumClockFenceWaitMs: fence.maximumWaitMs,
    historicalDeletedOutputNumericSsimKnown: raw.runs.every(run => run.state?.jobState !== "complete" ||
      typeof run.independentValidation?.ssim === "number" || run.independentSsimDiagnostic?.status === "numeric-summary"),
    savedButNotValidated: raw.runs.filter(run => run.state?.jobState === "complete" && !run.independentValidation)
      .map(run => ({ number: run.number, outputBytes: run.state.metrics.outputBytes, elapsedMs: run.state.metrics.elapsedMs,
        qualityAccepted: false, numericSsim: run.independentSsimDiagnostic?.score ?? null })),
    historicalFullOutputRetroactivelyAccepted: false, publicAcceptance: false };
}

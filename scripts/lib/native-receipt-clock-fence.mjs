// Wait for the reader clock to catch the native acquisition clock. Never rewrite
// timestamps, drop snapshots or loosen the original observer's time assertions.
import assert from "node:assert/strict";
export const NATIVE_RECEIPT_CLOCK_LIMITS = Object.freeze({ maximumWaitMs: 1000,
  waitIntervalMs: 1, receiptMarginMs: 1, maximumSamples: 256 });

export async function alignNativeReceiptClock(batch, { now = Date.now,
  monotonicNow = () => performance.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  assert.ok(Array.isArray(batch.samples) && batch.samples.length <= NATIVE_RECEIPT_CLOCK_LIMITS.maximumSamples);
  assert.equal(typeof now, "function"); assert.equal(typeof monotonicNow, "function"); assert.equal(typeof wait, "function");
  if (!batch.samples.length) return { observedAt: now(), waitedMs: 0, firstAheadMs: 0, samples: 0 };
  const times = batch.samples.map(sample => {
    const acquired = Date.parse(sample.timestamp), completed = Date.parse(sample.completedAt);
    assert.ok(Number.isFinite(acquired) && Number.isFinite(completed));
    return Math.max(acquired, completed);
  });
  const latestAt = Math.max(...times), minimumReceiptAt = latestAt + NATIVE_RECEIPT_CLOCK_LIMITS.receiptMarginMs;
  const began = monotonicNow(), firstObservedAt = now();
  assert.ok(Number.isFinite(began) && Number.isFinite(firstObservedAt));
  let observedAt = firstObservedAt, waitedMs = 0;
  while (observedAt < minimumReceiptAt) {
    waitedMs = monotonicNow() - began;
    assert.ok(Number.isFinite(waitedMs) && waitedMs >= 0, "Receipt wait requires a monotonic duration clock");
    if (waitedMs >= NATIVE_RECEIPT_CLOCK_LIMITS.maximumWaitMs) {
      const error = new Error("Native acquisition/receipt clocks did not align within the bounded wait");
      error.code = "ERR_NATIVE_RECEIPT_CLOCK_FENCE";
      error.receiptClock = { latestAt, firstObservedAt, observedAt, waitedMs, samples: batch.samples.length };
      throw error;
    }
    await wait(NATIVE_RECEIPT_CLOCK_LIMITS.waitIntervalMs);
    observedAt = now(); assert.ok(Number.isFinite(observedAt));
  }
  waitedMs = monotonicNow() - began;
  assert.ok(Number.isFinite(waitedMs) && waitedMs >= 0);
  if (waitedMs > NATIVE_RECEIPT_CLOCK_LIMITS.maximumWaitMs) {
    const error = new Error("Native receipt reader exceeded its bounded clock-alignment interval");
    error.code = "ERR_NATIVE_RECEIPT_CLOCK_FENCE";
    error.receiptClock = { latestAt, firstObservedAt, observedAt, waitedMs, samples: batch.samples.length };
    throw error;
  }
  return { observedAt, waitedMs,
    firstAheadMs: Math.max(0, minimumReceiptAt - firstObservedAt), samples: batch.samples.length };
}

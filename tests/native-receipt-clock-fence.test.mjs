import assert from "node:assert/strict";
import test from "node:test";
import { alignNativeReceiptClock, NATIVE_RECEIPT_CLOCK_LIMITS } from "../scripts/lib/native-receipt-clock-fence.mjs";
import { startClockFencedNativeBudgetFailureObserver, stopNativeObserverEvenAfterPhaseFailure } from "../scripts/lib/clock-fenced-native-failure-observer.mjs";
import { createNativeBudgetFailureTracker } from "../scripts/lib/native-budget-failure-observer.mjs";
function batch(at = 1001) {
  return { overflow: false, observerCpuMs: 1, samples: [{ sequence: 1,
    timestamp: new Date(at).toISOString(), completedAt: new Date(at).toISOString(), nativeElapsedMs: 0,
    sampleError: null, privateBytes: 100, rssBytes: 200, processes: [{ pid: 10, parentPid: 1,
      privateBytes: 100, rssBytes: 200, creationFileTime: "133000000000000000", createdAt: "2026-10-11T00:00:00Z" }] }] };
}

test("bounded reader-clock catch-up preserves exact native rows and the original future-timestamp assertion", async () => {
  const original = batch(), before = structuredClone(original);
  const old = createNativeBudgetFailureTracker(10, () => ({ stable: true, privateBytes: 100 }));
  old.setPhase("conversion-1", 0);
  assert.throws(() => old.consume(structuredClone(original), 1000), /observedAt >= at/);
  let clock = 1000, elapsed = 0, waits = 0;
  const receipt = await alignNativeReceiptClock(original, { now: () => clock, monotonicNow: () => elapsed,
    wait: async ms => { assert.equal(ms, 1); waits++; elapsed++; clock++; } });
  assert.equal(waits, 2); assert.equal(receipt.observedAt, 1002); assert.equal(receipt.firstAheadMs, 2);
  assert.deepEqual(original, before);
  const fixed = createNativeBudgetFailureTracker(10, () => ({ stable: true, privateBytes: 100 }));
  fixed.setPhase("conversion-1", 0);
  assert.deepEqual(fixed.consume(original, receipt.observedAt), []);
  assert.equal(fixed.report().sequence, 1); assert.equal(fixed.report().evaluatedConversionSamples, 1);
});

test("persistent clock mismatch fails within a monotonic one-second bound, never rewrites or drops rows", async () => {
  const original = batch(2000), before = structuredClone(original); let elapsed = 0;
  await assert.rejects(alignNativeReceiptClock(original, { now: () => 1000, monotonicNow: () => elapsed,
    wait: async () => { elapsed += 100; } }), error => error.code === "ERR_NATIVE_RECEIPT_CLOCK_FENCE");
  assert.equal(elapsed, NATIVE_RECEIPT_CLOCK_LIMITS.maximumWaitMs); assert.deepEqual(original, before);
  await assert.rejects(alignNativeReceiptClock({ samples: Array(257).fill(original.samples[0]) }));
  let late = 0;
  await assert.rejects(alignNativeReceiptClock(original, { now: () => late ? 3000 : 1000,
    monotonicNow: () => late, wait: async () => { late = 1001; } }),
  error => error.code === "ERR_NATIVE_RECEIPT_CLOCK_FENCE");
});

test("closing observer always attempts stop after phase failure and preserves every failure", async () => {
  const phase = new Error("phase failure"), stop = new Error("stop failure"); let stops = 0;
  await assert.rejects(stopNativeObserverEvenAfterPhaseFailure({ setPhase() { throw phase; },
    async stop() { stops++; } }), error => error === phase);
  assert.equal(stops, 1);
  await assert.rejects(stopNativeObserverEvenAfterPhaseFailure({ setPhase() { throw phase; },
    async stop() { stops++; throw stop; } }), error => error instanceof AggregateError &&
      error.errors[0] === phase && error.errors[1] === stop);
  assert.equal(stops, 2);
});

test("fenced observer retains full root-plus-child budget and the original single failure callback", async () => {
  const MiB = 1048576, baseline = { stable: true, privateBytes: 30 * MiB };
  let sequence = 0, closed = 0, callbacks = 0, signalFailure;
  const failureArrived = new Promise(resolve => { signalFailure = resolve; });
  const observer = await startClockFencedNativeBudgetFailureObserver(10, "unused", {
    getBlankBaseline: () => baseline,
    startMonitor: async () => ({ pid: 44, async drain() {
      const row = batch(Date.now() - 2).samples[0]; row.sequence = ++sequence;
      row.privateBytes = 281 * MiB; row.rssBytes = 282 * MiB;
      row.processes[0].privateBytes = MiB; row.processes[0].rssBytes = MiB;
      row.processes.push({ ...row.processes[0], pid: 11, parentPid: 10,
        privateBytes: 280 * MiB, rssBytes: 281 * MiB });
      return { overflow: false, observerCpuMs: 1, samples: [row] };
    }, async close() { closed++; } }),
    onFailure: async failure => { callbacks++; signalFailure(failure); return { syntheticOnly: true }; },
  });
  let timeout;
  try {
    observer.setPhase("conversion-1");
    const failure = await Promise.race([failureArrived, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Unit-test callback deadline")), 3000);
    })]);
    assert.equal(failure.incrementalPrivateMiB, 251);
    assert.equal(failure.after.processes.length, 2);
    assert.equal(failure.after.privateBytes, 281 * MiB);
    assert.equal(failure.baseline.privateBytes, 30 * MiB);
    await observer.finishCapture(); await stopNativeObserverEvenAfterPhaseFailure(observer);
    assert.equal(callbacks, 1); assert.equal(closed, 1);
    assert.equal(observer.report().error, null);
    const capture = observer.failureCaptureReport();
    assert.equal(capture.limits.incrementalPrivateBytes, 250 * MiB);
    assert.equal(capture.maximumPendingCallbacks, 1);
    assert.equal(capture.receiptClockFence.timestampsRewritten, 0);
  } finally { clearTimeout(timeout); await observer.stop(); }
});

test("fatal native batch is retained once and phase failure still closes the owned monitor", async () => {
  let closed = 0;
  const invalid = batch(Date.now() - 2); invalid.samples[0].privateBytes++;
  const observer = await startClockFencedNativeBudgetFailureObserver(10, "unused", {
    getBlankBaseline: () => null, onFailure: async () => {},
    startMonitor: async () => ({ pid: 44, drain: async () => invalid, close: async () => { closed++; } }),
  });
  await new Promise(resolve => setTimeout(resolve, 150));
  await assert.rejects(stopNativeObserverEvenAfterPhaseFailure(observer));
  assert.equal(closed, 1);
  const native = observer.report(), capture = observer.failureCaptureReport();
  assert.ok(native.error); assert.deepEqual(native.receiptClockFence.failedBatch, invalid);
  assert.equal(capture.receiptClockFence.failedBatch, null);
  assert.equal(capture.receiptClockFence.failedBatchLocation, "nativeMemory.receiptClockFence.failedBatch");
  assert.equal(native.receiptClockFence.monitorClosed, true);
  assert.equal(native.receiptClockFence.publicAcceptance, false);
});

test("failed native read never mislabels a preceding batch as the offending payload", async () => {
  let drains = 0, closed = 0;
  const unavailable = new Error("native drain unavailable");
  const observer = await startClockFencedNativeBudgetFailureObserver(10, "unused", {
    getBlankBaseline: () => null, onFailure: async () => {},
    startMonitor: async () => ({ pid: 44, async drain() {
      if (++drains > 1) throw unavailable;
      return batch(Date.now() - 2);
    }, async close() { closed++; } }),
  });
  await new Promise(resolve => setTimeout(resolve, 250));
  await assert.rejects(stopNativeObserverEvenAfterPhaseFailure(observer), error => error === unavailable);
  assert.equal(closed, 1);
  assert.equal(observer.report().receiptClockFence.failedBatch, null);
  assert.equal(observer.report().receiptClockFence.failedBatchUnavailable, true);
  assert.equal(observer.report().error, "native drain unavailable");
});

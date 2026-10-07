import assert from "node:assert/strict";
import test from "node:test";
import { createNativeBudgetFailureTracker, startNativeBudgetFailureObserver, NATIVE_FAILURE_LIMITS } from "../scripts/lib/native-budget-failure-observer.mjs";
const MiB = 1048576, epoch = Date.parse("2026-10-07T00:00:00Z");
const baseline = { stable: true, privateBytes: 30 * MiB, firstTimestamp: "before", lastTimestamp: "blank", spreadBytes: 1 };
const sample = (sequence, at, total) => ({ sequence, timestamp: new Date(at).toISOString(), completedAt: new Date(at + 2).toISOString(),
  nativeElapsedMs: 2, sampleError: null, privateBytes: total, rssBytes: total,
  processes: [{ pid: 1, parentPid: 0, createdAt: "2026-10-07T00:00:00Z", creationFileTime: "134040000000000000", privateBytes: MiB, rssBytes: MiB },
    { pid: 2, parentPid: 1, createdAt: "2026-10-07T00:00:00.100Z", creationFileTime: "134040000010000000", privateBytes: total - MiB, rssBytes: total - MiB }] });
const batch = samples => ({ samples, overflow: false, observerCpuMs: 0 });
test("first full-tree250MiB failure admits exactly ONE callback, including gradual growth without a32MiB burst", () => {
  const tracker = createNativeBudgetFailureTracker(1, () => baseline); tracker.setPhase("conversion-1", epoch);
  assert.deepEqual(tracker.consume(batch([sample(1, epoch, 279 * MiB), sample(2, epoch + 100, 280 * MiB)]), epoch + 101), []);
  const [failure] = tracker.consume(batch([sample(3, epoch + 200, 281 * MiB), sample(4, epoch + 300, 282 * MiB)]), epoch + 350);
  assert.equal(failure.incrementalPrivateMiB, 251); assert.equal(failure.delta.treeDeltaPrivateBytes, MiB);
  assert.equal(failure.delta.adjacent, true); assert.equal(failure.after.processes.length, 2);
  assert.equal(tracker.report().additionalOverBudgetSamples, 1); assert.equal(NATIVE_FAILURE_LIMITS.maximumCallbacks, 1);
});
test("no tracing trigger on blank/warmup/below-limit rows and no missing baseline substitution", () => {
  let actual = null;
  const tracker = createNativeBudgetFailureTracker(1, () => actual); tracker.setPhase("blank-baseline", epoch);
  assert.deepEqual(tracker.consume(batch([sample(1, epoch, 500 * MiB)]), epoch + 10), []);
  actual = baseline; tracker.setPhase("conversion-1", epoch + 100);
  assert.deepEqual(tracker.consume(batch([sample(2, epoch + 100, 280 * MiB)]), epoch + 110), []);
  actual = { ...baseline, privateBytes: 31 * MiB };
  assert.throws(() => tracker.consume(batch([sample(3, epoch + 200, 281 * MiB)]), epoch + 210), /denominator/);
});
test("unavailable sample is null, not zero or a fabricated adjacent delta", () => {
  const tracker = createNativeBudgetFailureTracker(1, () => baseline); tracker.setPhase("conversion-1", epoch);
  const failed = { ...sample(2, epoch + 100, 279 * MiB), privateBytes: null, rssBytes: null, processes: null, sampleError: "unavailable" };
  const [failure] = tracker.consume(batch([sample(1, epoch, 279 * MiB), failed, sample(3, epoch + 200, 281 * MiB)]), epoch + 250);
  assert.equal(failure.before, null); assert.equal(failure.delta, null); assert.equal(tracker.report().unavailableSamples, 1);
  assert.throws(() => tracker.consume({ ...batch([]), overflow: true }), /overflow/);
});
test("native acquisition and complete peaks continue DURING pending failure trace finalization, no second callback/queue", async () => {
  let sequence = 0, closed = 0, calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const observer = await startNativeBudgetFailureObserver(1, "unused", { getBlankBaseline: () => baseline,
    startMonitor: async () => ({ pid: 44, drain: async () => batch([sample(++sequence, Date.now(), (279 + sequence) * MiB)]), close: async () => { closed++; } }),
    onFailure: async () => { calls++; await gate; return { success: true }; } });
  try {
    observer.setPhase("conversion-1"); const deadline = Date.now() + 3000;
    while (sequence < 5 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(sequence >= 5); assert.equal(calls, 1); assert.equal(closed, 0);
    const at = sequence; let finished = false;
    const finishing = observer.finishCapture().then(() => { finished = true; });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(finished, false); assert.ok(sequence > at, "Native monitor must remain live while owned trace drains");
    assert.equal(observer.failureCaptureReport().callbackQueueLength, 0);
    release(); await finishing; await observer.stop(); assert.equal(closed, 1);
    assert.equal(observer.failureCaptureReport().callback.status, "completed");
    assert.ok(observer.peaks(["conversion-1"]).peak.privateBytes > 283 * MiB);
  } finally { release(); await observer.stop(); }
});
test("failure callback exceptions are retained and no-capture close does not invent diagnostic success", async () => {
  let sequence = 0;
  const observer = await startNativeBudgetFailureObserver(1, "unused", { getBlankBaseline: () => baseline,
    startMonitor: async () => ({ pid: 44, drain: async () => batch([sample(++sequence, Date.now(), 281 * MiB)]), close: async () => {} }),
    onFailure: async () => { throw new Error("trace unavailable"); } });
  observer.setPhase("conversion-1"); const deadline = Date.now() + 3000;
  while (!observer.failureCaptureReport().callback && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  await observer.finishCapture(); await observer.stop();
  assert.equal(observer.failureCaptureReport().callback.status, "failed"); assert.match(observer.failureCaptureReport().callback.error, /trace unavailable/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createBoundedPeriodicRealmObserver } from "../scripts/lib/bounded-periodic-realm-observer.mjs";

const target = value => ({ targetsAvailable: true, targets: [{ targetId: "worker1", type: "worker", url: "http://localhost/worker.js",
  usedJSHeapBytes: value, allocatedJSHeapBytes: value, embedderHeapUsedBytes: null, backingStorageBytes: null }] });
test("periodic realm observer is single-flight, fixed-ring and joins phase at acquisition, not reply", async () => {
  let tick, released, calls = 0, clears = 0, phase = "conversion-9", at = 10;
  const scheduler = { setInterval(fn) { tick = fn; return 1; }, clearInterval() { clears++; } };
  const observer = createBoundedPeriodicRealmObserver({ sample: () => { calls++; return new Promise(resolve => { released = resolve; }); },
    readPhase: () => phase, clock: () => at, scheduler, capacity: 2 });
  observer.start(); observer.start(); tick(); tick();
  const first = observer.observe(), same = observer.observe(); assert.equal(first, same); assert.equal(calls, 1);
  phase = "validation"; at = 20; released(target(10));
  assert.equal((await first).phase, "conversion-9");
  const second = observer.observe(); released(target(20)); await second;
  const third = observer.observe(); released(target(null)); await third;
  const report = observer.report(); assert.equal(report.totalSamples, 3); assert.equal(report.samples.length, 2);
  assert.equal(report.droppedSamples, 1); assert.equal(report.skippedTicks, 1);
  assert.equal(report.observedPeaks[0].usedJSHeapBytes, 20); assert.equal(report.observedPeaks[0].backingStorageBytes, null);
  await observer.stop(); await observer.stop(); assert.equal(clears, 1); assert.equal(await observer.observe(), null);
});

test("unavailable, invalid and excessive realm data is bounded and never converted to zero", async () => {
  const inputs = [new Error("detached"), { targetsAvailable: false, targets: null },
    { targetsAvailable: true, targets: Array.from({ length: 17 }, () => ({})) },
    { targetsAvailable: true, targets: [{ ...target(1).targets[0], url: "x".repeat(16384) }] }];
  const observer = createBoundedPeriodicRealmObserver({ sample: async () => { const v = inputs.shift(); if (v instanceof Error) throw v; return v; }, readPhase: () => "late-job" });
  assert.equal((await observer.observe()).sample, null);
  assert.deepEqual((await observer.observe()).sample, { targetsAvailable: false, targets: null });
  assert.equal((await observer.observe()).sample, null); assert.equal((await observer.observe()).sample, null);
  assert.deepEqual(observer.report().observedPeaks, []); await observer.stop();
  const invalidTail = createBoundedPeriodicRealmObserver({ sample: async () => ({ targetsAvailable: true,
    targets: [target(999).targets[0], { targetId: 42, url: "invalid" }] }), readPhase: () => "late-job" });
  assert.equal((await invalidTail.observe()).sample, null);
  assert.deepEqual(invalidTail.report().observedPeaks, [], "Invalid tail cannot publish partial valid-looking peaks");
  await invalidTail.stop();
  assert.throws(() => createBoundedPeriodicRealmObserver({ sample() {}, readPhase() {}, intervalMs: 1 }));
  assert.throws(() => createBoundedPeriodicRealmObserver({ sample() {}, readPhase() {}, capacity: 257 }));
});

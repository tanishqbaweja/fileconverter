import assert from "node:assert/strict";
import test from "node:test";
import { MAXIMUM_JS_SAMPLING_MS, withFiniteJsSampling } from "../scripts/lib/conversion-js-allocation-duration-bound.mjs";
test("Sampling duration stops the instrument once, without stopping conversion or inventing later failure data", async () => {
  let scheduled, stops = 0, progress = 0, captures = 0, clock = 1000, resolveStop;
  const original = { async beforeConversion() {}, async progress() { progress++; },
    async failureBeforeCancellation() { captures++; }, close() { stops++; return new Promise(resolve => { resolveStop = resolve; }); },
    report: () => ({ publicAcceptance: false, records: [] }) };
  const controller = withFiniteJsSampling(original, { now: () => clock, schedule: (callback, ms) => {
    scheduled = { callback, ms }; return 1; }, clear() {} });
  await controller.beforeConversion({ jobState: "idle" }); assert.equal(scheduled.ms, 90000);
  await controller.progress({ jobState: "running" }); assert.equal(progress, 1);
  clock += MAXIMUM_JS_SAMPLING_MS; scheduled.callback();
  await controller.progress({ jobState: "running" }); assert.equal(progress, 1);
  const closing = controller.close(), failed = controller.failureBeforeCancellation({ jobState: "running" },
    { after: { timestamp: "2026-10-08T13:00:00Z", sequence: 1 } });
  resolveStop(); await closing; await failed; await controller.close();
  assert.equal(stops, 1); assert.equal(captures, 0);
  const proof = controller.report(); assert.equal(proof.maximumSamplingMs, 90000);
  assert.equal(proof.conversionStoppedByProfiler, false); assert.equal(proof.unavailableAtFailure.sample, null);
  assert.equal(proof.durationStop.error, null); assert.equal(proof.publicAcceptance, false);
});

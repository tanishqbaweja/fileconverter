// Stop the instrument independently of conversion length; never cancel/fake work.
import assert from "node:assert/strict";
import { createConversionJsAllocation as createOriginal } from "./conversion-js-allocation.mjs";
export const MAXIMUM_JS_SAMPLING_MS = 90000;
export function withFiniteJsSampling(controller, { now = Date.now, schedule = setTimeout, clear = clearTimeout } = {}) {
  let timer = null, closePromise = null, startedAt = null, durationStop = null, unavailableAtFailure = null;
  const closeOnce = () => {
    if (timer !== null) { clear(timer); timer = null; }
    closePromise ??= controller.close(); return closePromise;
  };
  return {
    async beforeConversion(state) {
      assert.equal(startedAt, null); startedAt = now();
      timer = schedule(() => {
        durationStop = { requestedAt: now(), finishedAt: null, error: null };
        void closeOnce().then(() => { durationStop.finishedAt = now(); }, error => {
          durationStop.error = String(error).slice(0, 512); durationStop.finishedAt = now();
        });
      }, MAXIMUM_JS_SAMPLING_MS);
      return controller.beforeConversion(state);
    },
    async progress(state) { if (!closePromise) return controller.progress(state); },
    async failureBeforeCancellation(state, event) {
      if (closePromise) {
        await closePromise;
        unavailableAtFailure = { status: "unavailable-after-sampling-duration-stop", acquiredAt: event.after.timestamp,
          sequence: event.after.sequence, sample: null, reason: "Do not keep collected-allocation history until a future long-run failure" };
      } else {
        if (timer !== null) { clear(timer); timer = null; }
        await controller.failureBeforeCancellation(state, event);
      }
    },
    close: closeOnce,
    report: () => ({ ...controller.report(), maximumSamplingMs: MAXIMUM_JS_SAMPLING_MS, startedAt,
      durationStop, unavailableAtFailure, samplingHistoryBoundedIndependentlyOfConversionLength: true,
      conversionStoppedByProfiler: false }),
  };
}
export async function createConversionJsAllocation(cdp, options) {
  return withFiniteJsSampling(await createOriginal(cdp, options));
}

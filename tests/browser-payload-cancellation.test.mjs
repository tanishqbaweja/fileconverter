import assert from "node:assert/strict";
import { test } from "node:test";
import { cancelAfterRealBrowserPayload } from "../scripts/lib/browser-payload-cancellation.mjs";
test("real payload trigger arms before starting and calls production cancel in the same frame after actual bytes", async () => {
  let state = null, frames = 0, cancelled = 0, started = 0;
  const trace = [];
  const r = await cancelAfterRealBrowserPayload({ now: () => frames * 16,
    start() { started++; trace.push("start"); state = { jobState: "running", metrics: { outputBytes: 0 } }; },
    async nextFrame() { frames++; trace.push("frame"); state.metrics.outputBytes = frames === 1 ? 65535 : 65536; },
    getState: () => state, cancel() { cancelled++; trace.push("cancel"); state.metrics.outputBytes = 99999; },
  });
  assert.equal(started, 1); assert.equal(cancelled, 1); assert.equal(frames, 2);
  assert.deepEqual(trace, ["start", "frame", "frame", "cancel"]);
  assert.equal(r.armedMetrics.outputBytes, 65536, "Capture pre-cancel real metrics, not a mutable later value");
});
test("fast completion is a recorded failure, never relabelled cancellation or a30s blind wait", async () => {
  let cancelled = 0, frames = 0;
  await assert.rejects(cancelAfterRealBrowserPayload({ now: () => 0, start() {},
    async nextFrame() { frames++; }, getState: () => ({ jobState: "complete", metrics: { outputBytes: 9000537 } }),
    cancel() { cancelled++; },
  }), /missed running output/);
  assert.equal(frames, 1); assert.equal(cancelled, 0);
});
test("a missing real output times out with one pending frame, not a fake successful cancellation", async () => {
  let clock = 0, cancelled = 0;
  await assert.rejects(cancelAfterRealBrowserPayload({ now: () => clock, start() {},
    async nextFrame() { clock += 10000; }, getState: () => ({ jobState: "running", metrics: { outputBytes: 0 } }),
    cancel() { cancelled++; },
  }), /timed out before real output/);
  assert.equal(cancelled, 0); assert.equal(clock, 30000);
});

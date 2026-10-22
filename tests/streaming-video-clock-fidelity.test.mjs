import assert from "node:assert/strict";
import test from "node:test";
import { compareStreamingVideoClocks } from "../scripts/lib/streaming-video-clock-fidelity.mjs";

const times = values => (async function* () { for (const value of values) yield "frame|best_effort_timestamp_time=" + value; })();
test("streaming video validator checks every clock/count with the unchanged strict1ms tolerance", async () => {
  assert.deepEqual(await compareStreamingVideoClocks(times([0, .041667, .083333]), times([0, .041668, .083334]), 3),
    { frames: 3, maximumVideoPtsErrorSeconds: Math.abs(.083334 - .083333) });
  await assert.rejects(compareStreamingVideoClocks(times([0, 1]), times([.001, 1]), 2), /clock changed/);
  await assert.rejects(compareStreamingVideoClocks(times([0, 1, 2]), times([0, 1.002, 2]), 3), /frame 1/);
  await assert.rejects(compareStreamingVideoClocks(times([0, 1, 2]), times([0, 1]), 3), /count changed/);
  await assert.rejects(compareStreamingVideoClocks(times([0, 1]), times([0, 1]), 3), /independent source probe/);
  await assert.rejects(compareStreamingVideoClocks(times([0, 1]), times([0, 1]), 1), /additional video/);
});

test("streaming video validator refuses unavailable/malformed clocks and releases both iterators on failure", async () => {
  for (const bad of ["N/A", "", ".", "--1", "1.2.3"]) await assert.rejects(compareStreamingVideoClocks(times([bad]), times([0]), 1));
  let closed = 0;
  const broken = value => (async function* () { try { yield "frame|best_effort_timestamp_time=" + value; } finally { closed++; } })();
  await assert.rejects(compareStreamingVideoClocks(broken(0), broken(.002), 1)); assert.equal(closed, 2);
  for (const count of [0, -1, 1.5, 10000001, NaN]) await assert.rejects(compareStreamingVideoClocks(times([]), times([]), count));
});

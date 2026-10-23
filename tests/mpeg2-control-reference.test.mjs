import assert from "node:assert/strict";
import test from "node:test";
import { mpeg2ControlReference, sourceMpeg2ControlClock, expectedMpeg2ControlClocks } from "../scripts/lib/mpeg2-control-reference.mjs";
import { compareStreamingVideoClocks } from "../scripts/lib/streaming-video-clock-fidelity.mjs";
const source = { width: 640, height: 360, avg_frame_rate: "24/1", nb_read_frames: "96" };
test("control reference preserves default and selects the exact native15fps cadence without an index array", async () => {
  assert.equal(mpeg2ControlReference(source).frames, 96);
  const reference = mpeg2ControlReference(source, { codec: "automatic", maxWidth: 320, bitRateBps: 1000000, frameRateFps: 15, quality: "higher" });
  assert.equal(reference.frames, 60); assert.match(reference.referenceFilter, /floor\(n\*15\/24\)/);
  const first = await sourceMpeg2ControlClock(expectedMpeg2ControlClocks(0.083, { frames: 96, frameRate: 24 }));
  const exact = await compareStreamingVideoClocks(expectedMpeg2ControlClocks(first, reference), expectedMpeg2ControlClocks(first, reference), 60);
  assert.equal(exact.maximumVideoPtsErrorSeconds, 0);
  await assert.rejects(compareStreamingVideoClocks(expectedMpeg2ControlClocks(first, reference), expectedMpeg2ControlClocks(first + 0.002, reference), 60), /clock changed/);
  assert.throws(() => mpeg2ControlReference({ ...source, nb_read_frames: "95" }));
});

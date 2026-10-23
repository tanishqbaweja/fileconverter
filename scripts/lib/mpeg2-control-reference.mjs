import assert from "node:assert/strict";
// Independent reference for this finite generated24fps fixture, not a large
// source validator or a browser conversion. No frame index/payload collection.
export function mpeg2ControlReference(source, options) {
  assert.equal(source.width, 640); assert.equal(source.height, 360);
  assert.equal(source.avg_frame_rate, "24/1"); assert.equal(Number(source.nb_read_frames), 96);
  const selected = options !== undefined;
  if (selected) assert.deepEqual(options, { codec: "automatic", maxWidth: 320, bitRateBps: 1000000, frameRateFps: 15, quality: "higher" });
  return selected ? { width: 320, height: 180, frames: 60, frameRate: 15, bitrate: 1000000, qmin: 2, qmax: 12,
    referenceFilter: "select='eq(n,0)+gt(floor(n*15/24),floor((n-1)*15/24))',scale=320:180:flags=bilinear," }
    : { width: 640, height: 360, frames: 96, frameRate: 24, bitrate: 4000000, qmin: 4, qmax: 20, referenceFilter: "" };
}
export async function sourceMpeg2ControlClock(lines) {
  let first = null, count = 0;
  for await (const line of lines) {
    assert.ok(line.length <= 4096); const match = /^frame\|best_effort_timestamp_time=(-?[0-9.]+)/.exec(line); assert.ok(match);
    const time = Number(match[1]); assert.ok(Number.isFinite(time)); if (first === null) first = time;
    assert.ok(Math.abs(time - first - count / 24) < 0.001, "Generated source CFR timing drift"); assert.ok(++count <= 96);
  }
  assert.equal(count, 96); return first;
}
export async function* expectedMpeg2ControlClocks(first, reference) {
  assert.ok(Number.isFinite(first)); assert.ok([60, 96].includes(reference.frames)); assert.ok([15, 24].includes(reference.frameRate));
  for (let frame = 0; frame < reference.frames; frame++) yield `frame|best_effort_timestamp_time=${first + frame / reference.frameRate}`;
}

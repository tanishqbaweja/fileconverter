import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("raw MPEG-2 fixture duration follows the encoded sequence-header rate", () => {
  const manifest = JSON.parse(
    readFileSync("fixtures/media/mpeg2-video-source.m2v.json", "utf8"),
  );
  const video = manifest.probe.streams.find((stream) => stream.codec_type === "video");
  assert.ok(video);
  assert.equal(video.r_frame_rate, "24/1");
  assert.equal(video.avg_frame_rate, "25/1");
  assert.equal(manifest.frameRate, 24);
  assert.equal(manifest.decodedVideoFrames, 96);
  assert.equal(manifest.decodedVideoDurationSeconds, 4);
  for (const generator of [
    "scripts/generate-mpeg2-video-fixture.mjs",
    "scripts/generate-mpeg2-video-stress-fixture.mjs",
  ]) {
    const source = readFileSync(generator, "utf8");
    assert.match(source, /String\(video\?\.r_frame_rate\)/);
    assert.doesNotMatch(source, /String\(video\?\.avg_frame_rate\)/);
  }
});

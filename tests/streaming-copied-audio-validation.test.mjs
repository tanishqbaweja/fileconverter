import assert from "node:assert/strict";
import test from "node:test";
import { createAudioFrameState, parseAudioFrameHashLine, compareCopiedAudioFrames } from "../scripts/lib/streaming-copied-audio-validation.mjs";
const headers = ["#format: frame checksums", "#version: 2", "#hash: SHA256", "#tb 0: 1/48000", "#media_type 0: audio", "#codec_id 0: pcm_s32le", "#sample_rate 0: 48000", "#channel_layout_name 0: mono"];
const prepared = () => { const state = createAudioFrameState(); for (const line of headers) parseAudioFrameHashLine(line, state); return state; };
const row = (pts = 0, hash = "a".repeat(64)) => `0, ${pts}, ${pts}, 1024, 4096, ${hash}`;
test("Streaming copied audio checks exact canonical frame content and every clock without retaining histories", () => {
  const source = prepared(), output = prepared();
  for (let index = 0; index < 10000; index++) {
    const a = parseAudioFrameHashLine(row(index * 1024), source), b = parseAudioFrameHashLine(row(index * 1024 + 16), output);
    compareCopiedAudioFrames(a, b, source, output);
  }
  assert.equal(source.frames, 10000); assert.equal(source.samples, 10240000); assert.equal(source.bytes, 40960000);
  assert.equal(source.headers.size, 8); assert.ok(output.maximumClockErrorSeconds < 0.001);
  assert.equal(source.lastPts, 9999 * 1024); assert.ok(!Object.values(source).some(Array.isArray));
});
test("Unknown clocks/counts, extra streams, malformed hashes, oversize and duplicate metadata cannot certify audio", () => {
  for (const line of [row().replace(", 0, 0,", ", N/A, 0,"), row().replace("1024", "0"), row().replace("0,", "1,"), row().replace("4096", "N/A"), row(0, "abc"), "x".repeat(4097)])
    assert.throws(() => parseAudioFrameHashLine(line, prepared()));
  const state = prepared(); assert.throws(() => parseAudioFrameHashLine(headers[0], state));
  assert.throws(() => parseAudioFrameHashLine(row(), createAudioFrameState()));
});
test("Preserved packet identity cannot hide shifted decoded clocks, changed samples or channel metadata", () => {
  for (const changed of [row(49), row(0, "b".repeat(64)), row().replace("1024", "1000")]) {
    const source = prepared(), output = prepared(); assert.throws(() => compareCopiedAudioFrames(parseAudioFrameHashLine(row(), source), parseAudioFrameHashLine(changed, output), source, output));
  }
  const source = prepared(), output = prepared(); output.headers.set("channel_layout_name", "stereo");
  assert.throws(() => compareCopiedAudioFrames(parseAudioFrameHashLine(row(), source), parseAudioFrameHashLine(row(), output), source, output));
});

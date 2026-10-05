import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateCopiedAudioTiming } from "../scripts/lib/copied-audio-timing.mjs";

const packet = (index, pts, skip = 0) => ({ stream_index: index, pts_time: String(pts),
  dts_time: String(pts), duration_time: "0.021333", ...(skip ? { side_data_list: [
    { side_data_type: "Skip Samples", skip_samples: skip, discard_padding: 0 },
  ] } : {}) });

test("Copied audio comparison respects per-track order, exact priming and bounded timestamps", () => {
  const a = packet(1, 0.062, 1024), b = packet(2, 0.062, 1024);
  const source = [a, b, packet(1, 0.083333), packet(2, 0.083333)];
  const output = [{ ...a, stream_index: 4 }, packet(4, 0.083333), { ...b, stream_index: 5 }, packet(5, 0.083333)];
  const result = validateCopiedAudioTiming(source, output, [1, 2], [4, 5]);
  assert.equal(result.length, 2);
  assert.ok(result.every((r) => r.packets === 2 && r.initialSkipSamples === 1024 && r.maximumPtsErrorSeconds === 0));
  assert.throws(() => validateCopiedAudioTiming(source, [{ ...output[0], pts_time: "0.064" }, ...output.slice(1)], [1, 2], [4, 5]), /PTS changed/);
  assert.throws(() => validateCopiedAudioTiming(source, output.slice(1), [1, 2], [4, 5]), /packet count/);
});

test("Unavailable audio values are not fabricated as zero and histories remain bounded", () => {
  const p = packet(1, 0.062, 1024);
  assert.throws(() => validateCopiedAudioTiming([p], [{ ...p, pts_time: null }], [1], [1]), /unavailable/);
  assert.throws(() => validateCopiedAudioTiming([p], [{ ...p, side_data_list: [
    { side_data_type: "Skip Samples", skip_samples: null, discard_padding: 0 },
  ] }], [1], [1]), /unavailable/);
  assert.throws(() => validateCopiedAudioTiming(Array(4097).fill(p), [p], [1], [1]), /packet cap/);
});

test("Retained genuine browser evidence exposes zero-start16-sample and positive-start1024-sample trim loss", async () => {
  const e = JSON.parse(await readFile(new URL("../evidence/mpeg2-hevc-small-timing-failure-2026-10-05.json", import.meta.url), "utf8"));
  assert.equal(e.publicAcceptance, false);
  assert.equal(e.primaryMemoryAcceptance, false);
  assert.equal(e.protectedFullSourceRetried, false);
  assert.equal(e.build.conclusion, "success");
  assert.equal(e.manifest.allocatorDiagnostic, false);
  assert.equal(e.manifest.maximumWasmMemoryBytes, 33554432);
  assert.deepEqual(e.suites.map((s) => [s.passed, s.failed]), [[3, 1], [3, 1]]);
  for (const row of e.copiedAudioTimelines) {
    for (const track of row.tracks) {
      assert.equal(track.sourcePackets, track.outputPackets);
      assert.equal(track.maximumPtsErrorSeconds, 0);
      assert.equal(track.maximumDtsErrorSeconds, 0);
      assert.equal(track.sourceInitialSkipSamples, 1024);
      assert.equal(track.outputInitialSkipSamples, row.sourceCodec === "hevc" ? 0 : 1008);
      assert.throws(() => validateCopiedAudioTiming([track.sourceFirst], [track.outputFirst], [track.index], [track.index]), /skip_samples changed/);
    }
  }
  const hevc = e.decodedVideo.find((r) => r.sourceCodec === "hevc");
  assert.equal(hevc.sourceFrames, "96");
  assert.equal(hevc.outputFrames, "96");
  assert.ok(hevc.ssim >= 0.98);
  assert.ok(Math.abs(Number(hevc.sourceFormat.duration) - Number(hevc.outputFormat.duration)) > 0.06);
  assert.equal(e.nextAction.muxFixImplemented, false);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const evidence = JSON.parse(await readFile(path.join(root, "evidence/h264-browser-followup-2026-10-04.json"), "utf8"));
const rows = evidence.batches.flatMap((batch) => batch.rows);

test("the typed H264 fix produces genuine frames but timing and duration failures remain recorded", () => {
  const diagnostics = rows.filter((row) => row.kind === "independent-frame-diagnostic");
  assert.equal(diagnostics.length, 2);
  for (const row of diagnostics) {
    assert.equal(row.sourceProbe.streams.find((stream) => stream.codec_type === "video").codec_name, "mpeg4");
    assert.equal(row.outputProbe.streams.find((stream) => stream.codec_type === "video").codec_name, "h264");
    assert.equal(row.sourceFrameTimes.length, 48);
    assert.equal(row.outputFrameTimes.length, 48);
    assert.equal(row.audioPacketHashes.length, 2);
    assert.ok(row.ordinalSsim >= 0.98);
    assert.equal(row.nativeFullDecodePassed, true);
    assert.equal(row.metrics.peakWasmMemoryBytes, 64 * 1024 * 1024);
  }
  const mp4 = diagnostics.find((row) => row.container === "mp4");
  assert.ok(Math.max(...mp4.sourceFrameTimes.map((pts, i) => Math.abs(pts - mp4.outputFrameTimes[i]))) > 0.020);
  assert.ok(mp4.timestampAlignedSsim < 0.98);
  const mkv = diagnostics.find((row) => row.container === "mkv");
  assert.equal(mkv.outputProbe.format.duration, undefined);
  const fault = rows.find((row) => row.kind === "direct-write-failure");
  assert.equal(fault.status, "passed");
  assert.match(fault.error, /destination rejected a bounded write/);
  assert.equal(fault.metrics.pendingOperations, 0);
  assert.equal(fault.metrics.queuedBytes, 0);
  assert.equal(evidence.primaryIncrementalPrivateMiB, null);
  assert.equal(evidence.publicProfilesChanged, false);
  assert.equal(evidence.publicEnginesChanged, false);
  const samples = rows.filter((row) => row.samples).flatMap((row) => row.samples);
  assert.ok(samples.length > 0);
  for (const sample of samples) {
    if (sample.privateBytes === null) continue;
    assert.ok(sample.privateBytes > 0);
    assert.equal(sample.privateBytes, sample.processes.reduce((sum, process) => sum + process.privateBytes, 0));
  }
  assert.equal(evidence.cleanup.remoteRunRemainingArtifacts, 0);
  assert.equal(evidence.cleanup.distAssetsRestoredToPublishedHashes, true);
});

test("H264 mux timing fixes retain bounded fragments, no-cue finalization and strict quality/timeline gates", async () => {
  const kernel = await readFile(path.join(root, "media/ffmpeg/h264-candidate.c"), "utf8");
  assert.match(kernel, /out->avoid_negative_ts = AVFMT_AVOID_NEG_TS_DISABLED/);
  assert.match(kernel, /frag_keyframe\+delay_moov\+default_base_moof\+skip_trailer/);
  assert.match(kernel, /"use_editlist", "1"/);
  assert.match(kernel, /"bounded_no_cues", "1"/);
  assert.match(kernel, /"cluster_size_limit", "1048576"/);
  assert.doesNotMatch(kernel, /"live", "1"|output_io->seekable = 0/);
  const patch = await readFile(path.join(root, "media/ffmpeg/patches/matroska-bounded-no-cues.patch"), "utf8");
  assert.match(patch, /keyframe && !mkv->bounded_no_cues && IS_SEEKABLE/);
  assert.match(patch, /OFFSET\(bounded_no_cues\), AV_OPT_TYPE_BOOL, \{ \.i64 = 0 \}/);
  const browser = await readFile(path.join(root, "tests/browser/h264-candidate.spec.ts"), "utf8");
  assert.match(browser, /expect\(ordinalSsim\)\.toBeGreaterThanOrEqual\(0\.98\)/);
  assert.match(browser, /outputFrameTimes\[index\] - sourceFrameTimes\[index\]/);
  assert.match(browser, /\.toBeLessThanOrEqual\(0\.001\)/);
  assert.match(browser, /timestampAlignedSsim: ssim/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { VORBIS_LARGE_FIXTURE } from "../scripts/lib/vorbis-large-fixture.mjs";
test("large input policy pins the genuine historical147964541B/2300s stereo source, never a short/sparse substitute", async () => {
  assert.equal(VORBIS_LARGE_FIXTURE.bytes, 147964541); assert.equal(VORBIS_LARGE_FIXTURE.durationSeconds, 2300);
  assert.equal(VORBIS_LARGE_FIXTURE.frames, 110400000); assert.equal(VORBIS_LARGE_FIXTURE.channels, 2); assert.equal(VORBIS_LARGE_FIXTURE.sampleRate, 48000);
  assert.equal(VORBIS_LARGE_FIXTURE.sha256, "ec870c32bae0e5c41eb449f3d24fbc470636dfa804431e20a9eb7aef6ad9ff58");
  const source = await readFile("scripts/lib/vorbis-large-fixture.mjs", "utf8");
  assert.match(source, /"-n"/); assert.match(source, /seed=424242/); assert.match(source, /seed=242424/);
  assert.match(source, /"-b:a", "512k", "-vbr", "off"/); assert.match(source, /"-t", "2300"/);
  assert.match(source, /assert.equal\(sha256, VORBIS_LARGE_FIXTURE.sha256/); assert.match(source, /windowsHide: true/);
  assert.doesNotMatch(source, /truncate\(|copyFile\(|sparse|\.arrayBuffer\(/);
});
test("three real same-page full-size jobs keep the normal browser, automatic nativearg3, fixed queues and complete PCM/legacy quality gates", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--vorbis-large-repeat/); assert.match(source, /largeVorbisRepeat \? Array.from\(\{ length: 3 \}/);
  assert.match(source, /compareNativeLongAudioPcm\(input, output, \{ cwd: root, env, channels: 2, expectedFrames: 110400000 \}\)/);
  assert.match(source, /Unchanged legacy loaded-idle cleanup96MiB/);
  assert.match(source, /actualAutomaticQualityArgument = state.metrics.audioQualityArgument/);
  assert.match(source, /assert.equal\(row.output.sha256, report.cases\[0\].output.sha256/);
  assert.match(source, /First invalid large result retained; do not repeat it unchanged/);
  assert.match(source, /journal.peaksExcept\(\["blank"\]\)/); assert.match(source, /largeBudgetFailure/);
  assert.equal(source.split("chromium.launchPersistentContext(").length - 1, 1);
  assert.doesNotMatch(source, /disable.*(?:OnDevice|on.device)|force.gc|HeapProfiler.collectGarbage/);
});
test("large fixture preserves the actual prior SDR policy, not the unrelated small-tone60dB PSNR diagnostic", async () => {
  assert.equal(VORBIS_LARGE_FIXTURE.minimumChannelSdrDb, -6.5);
  const prior = await readFile("scripts/memory-profile.mjs", "utf8");
  assert.match(prior, /vorbisTranscodeOutput \|\| wmaOutput\s*\? -6\.5/);
  assert.match(prior, /comparisonFilter.replace\("apsnr\[quality\]", "asdr\[quality\]"\)/);
  const small = await readFile("scripts/lib/streaming-audio-fidelity.mjs", "utf8");
  assert.match(small, /minimumPsnrDb = 60/); assert.match(small, /minimumPsnrDb >= 60/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { VORBIS_IO_FIXTURE_POLICY } from "../scripts/lib/vorbis-io-fixture.mjs";
import { requiresPersistentVorbisInput } from "../lib/audio-input-policy.ts";
test("new cancellation input crosses actual8MiB reader boundary with real180s stereo512k Opus and fixed finite size", async () => {
  const policy = VORBIS_IO_FIXTURE_POLICY;
  assert.equal(policy.durationSeconds, 180); assert.equal(policy.frames, 8640000); assert.equal(policy.channels, 2);
  assert.equal(requiresPersistentVorbisInput("opus-to-ogg", 33, policy.minimumBytesExclusive + 1), true);
  assert.equal(policy.maximumBytes, 16 * 1048576);
  const source = await readFile("scripts/lib/vorbis-io-fixture.mjs", "utf8");
  assert.match(source, /"-t", "180"/); assert.match(source, /"-b:a", "512k", "-vbr", "off"/);
  assert.match(source, /seed=424242/); assert.match(source, /seed=242424/); assert.match(source, /"-n"/);
  assert.match(source, /windowsHide: true/); assert.match(source, /AUDIO_METADATA_TAGS/); assert.match(source, /source-cancel.opus/);
  assert.doesNotMatch(source, /truncate\(|copyFile\(|\.arrayBuffer\(/);
});
test("real UI gate cancels actual BYOB after payload progress, faults native writer, then validates exact q7 output in the same page", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--vorbis-io-recovery/); assert.match(source, /interruption: "cancel", byobCancellation: true/);
  assert.match(source, /state.metrics\?\.inputBytes > 262144 && state.metrics\?\.outputBytes > 65536/);
  assert.match(source, /validateAudioInterruption\(conversion.interruption, state/); assert.match(source, /transport.inFlight, 0/);
  assert.match(source, /samePageVorbisIoRecovery/); assert.match(source, /actualAutomaticQualityArgument = state.metrics.audioQualityArgument/);
  assert.ok(source.includes("a7c954b7b54cd9512735f22eb31c442205d80fe88c5c2f93448ac9e0ceb70167"));
  assert.match(source, /sourceDecode.samples, 17280000/); assert.match(source, /compareNativeAudioPcm\(input, output/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
  assert.equal(source.split("chromium.launchPersistentContext(").length - 1, 1);
});

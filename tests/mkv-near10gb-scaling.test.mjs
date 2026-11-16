import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { MKV_SCALE_NEAR10GB, assertNear10GbExtent, near10GbFixtureArguments, near10GbExpectedPcmSamples } from "../scripts/lib/mkv-near10gb-scaling.mjs";
import { assertLargeScalingExtent } from "../scripts/lib/mkv-large-scaling.mjs";
test("explicit near10GB media scope keeps older5GB limits, real1600-loop source, exact460800frames/902400AAC and PCM sample count", () => {
  assert.equal(MKV_SCALE_NEAR10GB.expectedVideoPackets, 1600 * 288); assert.equal(MKV_SCALE_NEAR10GB.expectedAudioPackets, 1600 * 564);
  assertNear10GbExtent(9500000000); assert.throws(() => assertNear10GbExtent(5350648699));
  assert.throws(() => assertLargeScalingExtent(9500000000)); assert.throws(() => assertNear10GbExtent(10200000001));
  assert.ok(MKV_SCALE_NEAR10GB.requiredDiskBytes > 2 * MKV_SCALE_NEAR10GB.maximumBytes + 4 * 1024 ** 3);
  const args = near10GbFixtureArguments("source.mkv", "owned.mkv"); assert.equal(args[args.indexOf("-stream_loop") + 1], "1599");
  assert.ok(!args.includes("-fs") && args.includes("+bitexact") && args.includes("-copyts"));
  assert.equal(near10GbExpectedPcmSamples(902400, 1024, 0), 924056576);
  assert.throws(() => near10GbExpectedPcmSamples(902400, 0, 0));
});
test("near10GB full decoded content check uses exact bytes, complete video/PCM hashes, unchanged30min TOTAL per-file deadline and bounded hidden native helpers", async () => {
  const code = await readFile("scripts/lib/mkv-near10gb-scaling.mjs", "utf8");
  assert.match(code, /windowsHide: true/); assert.match(code, /FULL_VIDEO_VALIDATOR_DEADLINE_MS/);
  assert.match(code, /remainingMs = deadlineAt - Date.now/);
  assert.match(code, /decodedVideoSha256: video.sha256, decodedPcmSha256: audio.sha256/);
  assert.match(code, /expectedAudioSamples, near10GbExpectedPcmSamples/);
  assert.doesNotMatch(code, /writeFile|arrayBuffer\(|truncate\(/);
});

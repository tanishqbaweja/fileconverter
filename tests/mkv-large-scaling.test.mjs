import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { MKV_SCALE_5GB, assertLargeScalingExtent, largeScalingFixtureArguments } from "../scripts/lib/mkv-large-scaling.mjs";

test("new finite scaling case is actual >4GiB media, never relaxation of old small/original extents or sparse/padded substitutes", () => {
  assert.equal(MKV_SCALE_5GB.loops, 900); assert.equal(MKV_SCALE_5GB.expectedVideoPackets, 900 * 288);
  assert.ok(MKV_SCALE_5GB.requiredDiskBytes >= 2 * MKV_SCALE_5GB.maximumBytes + 4 * 1024 ** 3);
  assertLargeScalingExtent(5 * 1024 ** 3);
  for (const n of [12 * 1048576, 2958573265, 2 ** 32, 5000000000 - 1, 6000000000 + 1, NaN]) assert.throws(() => assertLargeScalingExtent(n));
  assert.deepEqual(largeScalingFixtureArguments("parent.mkv", "owned.mkv"), ["-v", "error", "-n", "-copyts", "-stream_loop", "899", "-i", "parent.mkv",
    "-map", "0", "-c", "copy", "-avoid_negative_ts", "disabled", "-fflags", "+bitexact", "owned.mkv"]);
});

test("large browser job keeps all packet/clock/codec and COMPLETE source/output decoded video+PCM checks, bounded progress and unchanged primary gate", async () => {
  const source = await readFile("scripts/qualify-mkv-direct-reuse.mjs", "utf8"), helper = await readFile("scripts/lib/mkv-large-scaling.mjs", "utf8");
  assert.match(source, /--hevc-header-parser-scale-5gb/);
  assert.match(source, /sourceCompleteDecode = await decodeCompleteScalingContent/);
  assert.match(source, /outputCompleteDecode = await decodeCompleteScalingContent/);
  assert.match(source, /Complete scaling video pixels changed/); assert.match(source, /Complete scaling PCM changed/);
  assert.match(source, /Scaling codec initialization bytes changed/);
  assert.match(source, /duringConversion = time => !largeRun/);
  assert.match(source, /Unchanged 250 MiB whole-Chromium gate exceeded/);
  assert.match(source, /createLargeMkvScalingSource\(fixtureRuntime\)/);
  assert.match(source, /assertHevcHeaderParserCore\(candidate.proof\)/);
  assert.match(helper, /windowsHide: true/); assert.match(helper, /statfs\(root\)/);
  assert.match(helper, /createFullVideoDecodeProgress\(MKV_SCALE_5GB.expectedVideoPackets/);
  assert.match(helper, /FULL_VIDEO_VALIDATOR_DEADLINE_MS/);
  assert.doesNotMatch(helper, /-fs|truncate\(|arrayBuffer\(|writeFile\(/);
});

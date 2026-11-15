import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { bindOpfsOutputValidationBacking, bindProtectedMkvOutputValidationBacking, bindScalingMkvOutputValidationBacking } from "../scripts/lib/opfs-output-validation-backing.mjs";
import { inspectMkvMp4TimelineBoxes } from "../scripts/lib/mkv-mp4-timeline-boxes.mjs";

test("explicit scaling binding plans only three 4KiB probes above 32-bit offsets; no sparse/media file or conversion is fabricated", async () => {
  const runtime = await createOwnedRuntimeScratch("scaling-boundaries-unit-");
  try {
    const profile = path.join(runtime.directory, "profile"); await mkdir(profile);
    const size = 10 * 1024 ** 3 + 7, abort = new Error("unit-only adapter stops before any physical binding");
    let evaluations = 0;
    const page = { async evaluate(callback, args) {
      evaluations++; assert.equal(args.name, "within-test-scaled-hevc.mp4"); assert.equal(args.size, size);
      assert.equal(args.sampleBytes, 4096);
      assert.deepEqual(args.ranges, [0, Math.floor((size - 4096) / 2), size - 4096]);
      assert.ok(args.ranges[1] > 2 ** 32 && args.ranges[2] > 2 ** 32);
      throw abort;
    } };
    await assert.rejects(bindOpfsOutputValidationBacking(page, profile, "within-test-scaled-hevc.mp4", size));
    await assert.rejects(bindProtectedMkvOutputValidationBacking(page, profile, "test.mp4", size));
    await assert.rejects(bindScalingMkvOutputValidationBacking(page, profile, "test.mp4", size));
    await assert.rejects(bindScalingMkvOutputValidationBacking(page, profile, "../within-test-scaled-hevc.mp4", size));
    await assert.rejects(bindScalingMkvOutputValidationBacking(page, profile, "within-test-scaled-hevc.mp4", 12 * 1024 ** 3 + 1));
    assert.equal(evaluations, 0);
    await assert.rejects(bindScalingMkvOutputValidationBacking(page, profile, "within-test-scaled-hevc.mp4", size), error => error === abort);
    assert.equal(evaluations, 1);
  } finally { await runtime.close(); }
});

function virtualMetadata() {
  const words = (...values) => { const b = Buffer.alloc(values.length * 4); values.forEach((v, i) => b.writeUInt32BE(v, i * 4)); return b; };
  const box = (name, ...data) => { const b = Buffer.concat(data), h = Buffer.alloc(8); h.writeUInt32BE(b.length + 8); h.write(name, 4); return Buffer.concat([h, b]); };
  const movie = box("moov", box("mvhd", words(0, 0, 0, 1000, 0)),
    box("trak", box("tkhd", words(0, 0, 0, 1)),
      box("mdia", box("mdhd", words(0, 0, 0, 16000, 0)), box("hdlr", words(0, 0), Buffer.from("vide")))));
  const mdat = Buffer.alloc(16); mdat.writeUInt32BE(1); mdat.write("mdat", 4); mdat.writeBigUInt64BE(BigInt(5 * 1024 ** 3), 8);
  const fragment = box("moof", box("traf", box("tfhd", words(0, 1)), box("tfdt", words(0x01000000, 1, 123))));
  const afterPayload = movie.length + 5 * 1024 ** 3;
  const regions = [{ at: 0, bytes: movie }, { at: movie.length, bytes: mdat }, { at: afterPayload, bytes: fragment }];
  let calls = 0, totalRead = 0;
  return { size: afterPayload + fragment.length, get calls() { return calls; }, get totalRead() { return totalRead; },
    async read(at, count) {
      calls++; totalRead += count;
      assert.ok(Number.isSafeInteger(at) && count <= 24);
      const region = regions.find(r => at >= r.at && at + count <= r.at + r.bytes.length);
      assert.ok(region, "Unit adapter forbids EVERY simulated media-payload read");
      return region.bytes.subarray(at - region.at, at - region.at + count);
    } };
}

test("virtual metadata-only unit checks wide mdat/tfdt offsets without allocating or writing a large fixture", async () => {
  const fixture = virtualMetadata();
  for (const mode of [{}, { sustained: true }, { protectedPrefix: true }, { scalingPrefix: true, protectedPrefix: true }, { scalingPrefix: true, sustained: true }]) {
    await assert.rejects(inspectMkvMp4TimelineBoxes(fixture.read, fixture.size, mode));
  }
  assert.equal(fixture.calls, 0);
  const result = await inspectMkvMp4TimelineBoxes(fixture.read, fixture.size, { scalingPrefix: true });
  assert.equal(result.tracks[0].firstFragmentDecodeTimeTicks, String(2 ** 32 + 123));
  assert.equal(result.completeFragmentInventory, true); assert.equal(result.scalingExtentScope, true);
  assert.equal(result.mediaPayloadBytesRead, 0); assert.ok(result.maximumReadBytes <= 24);
  assert.equal(result.bytesRead, fixture.totalRead); assert.ok(fixture.totalRead < 1024);
  await assert.rejects(inspectMkvMp4TimelineBoxes(fixture.read, 12 * 1024 ** 3 + 1, { scalingPrefix: true }));
});

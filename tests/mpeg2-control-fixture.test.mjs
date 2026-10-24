import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mpeg2ControlFixtureArguments } from "../scripts/lib/mpeg2-control-fixture.mjs";
test("paired controls source retains real HEVC/AAC content, metadata, timing and byteexact mux metadata", () => {
  const args = mpeg2ControlFixtureArguments("owned-source.mkv");
  assert.equal(args.at(-1), "owned-source.mkv"); assert.equal(args[args.indexOf("-fflags") + 1], "+bitexact");
  assert.ok(args.includes("testsrc2=size=640x360:rate=24:duration=4")); assert.ok(args.includes("libx265")); assert.ok(args.includes("aac"));
  assert.ok(args.includes("title=MPEG-2 café 音楽")); assert.ok(args.includes("language=eng"));
  assert.equal(args[args.indexOf("-crf") + 1], "18"); assert.equal(args[args.indexOf("-threads:v") + 1], "1");
  assert.throws(() => mpeg2ControlFixtureArguments("not-a-matroska-source.mp4"));
});
test("two actually generated control sources matched bytes, packet hashes and full structure, then were deleted", async () => {
  const report = JSON.parse(await readFile(new URL("../evidence/2026-10-24T01-55-26.270Z-mpeg2-control-fixture-determinism.json", import.meta.url)));
  assert.equal(report.status, "passed-byte-identical-generated-fixtures"); assert.equal(report.scratchRemoved, true);
  assert.equal(report.browserConversions, 0); assert.equal(report.originalRead, false); assert.equal(report.publicAcceptance, false);
  const generator = await readFile(new URL("../scripts/lib/mpeg2-control-fixture.mjs", import.meta.url));
  assert.equal(createHash("sha256").update(generator).digest("hex"), report.generatorSha256);
  assert.equal(report.generatedFixtures.length, 2); assert.deepEqual(report.generatedFixtures[0], report.generatedFixtures[1]);
  assert.equal(report.generatedFixtures[0].bytes, 786823); assert.equal(report.generatedFixtures[0].frames, 96);
  assert.equal(report.generatedFixtures[0].sha256, "e70b76ca98594c4626024a68ad7886e3a9751e4fa1c9e124b616a7ff67e6b740");
  assert.match(report.generatedFixtures[0].packets, /1,a,SHA256=dcb30df9c3d558061d428b84c2846f7b5891cf7a908a1d4e3681fe8071e1bd14/);
});

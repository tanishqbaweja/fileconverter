import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDecodedByteHash, decodedMediaStreamArguments } from "../scripts/lib/streamed-decoded-hash.mjs";
test("raw-video validation preserves demuxer clock instead of rounding to nominal frame rate; no timestamp suppression, dropped-frame workaround or filter", () => {
  const args = decodedMediaStreamArguments("owned-source", "video-1280x720-yuv420p");
  assert.equal(args[args.indexOf("-enc_time_base:v") + 1], "-1");
  assert.equal(args[args.indexOf("-fps_mode") + 1], "passthrough"); assert.ok(args.includes("-xerror"));
  assert.equal(args[args.indexOf("-progress") + 1], "pipe:2"); assert.equal(args.at(-1), "pipe:1");
  assert.ok(!args.some(a => ["-vf", "-r", "-vsync", "-err_detect"].includes(a)));
  assert.ok(!decodedMediaStreamArguments("owned-source", "audio-48000-mono-s16le").includes("-enc_time_base:v"));
  assert.throws(() => decodedMediaStreamArguments("owned-source", "unbounded-format"));
});
test("UNIT ONLY: bounded decoded bytes hash every byte independent of chunk split; exact extents reject missing/excess/oversized data", () => {
  const bytes = Buffer.from("independent-validator-bytes"), hash = createDecodedByteHash({ expectedBytes: bytes.length, maximumBytes: bytes.length });
  hash.chunk(bytes.subarray(0, 5)); hash.chunk(bytes.subarray(5));
  const result = hash.finish(); assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(result.bytes, bytes.length); assert.equal(result.retainedDecodedFrames, 0); assert.equal(result.decodedFileCreated, false);
  assert.throws(() => hash.chunk(Buffer.from("after-end")));
  const partial = createDecodedByteHash({ expectedBytes: 10, maximumBytes: 10 }); partial.chunk(Buffer.from("short")); assert.throws(() => partial.finish());
  const excess = createDecodedByteHash({ expectedBytes: 1, maximumBytes: 1 }); assert.throws(() => excess.chunk(Buffer.from("extra")));
  const large = createDecodedByteHash({ maximumBytes: 1000000 }); assert.throws(() => large.chunk(Buffer.alloc(262145)));
});
test("native pipe candidate is independent validation only; Windows hidden, bounded chunks/backpressure, finite deadlines and owned-child abort cleanup", async () => {
  const source = await readFile("scripts/lib/streamed-decoded-hash.mjs", "utf8");
  assert.match(source, /windowsHide: true/); assert.match(source, /for await \(const chunk of child.stdout\) digest.chunk\(chunk\)/);
  assert.match(source, /expectedFrames \* 1280 \* 720 \* 3 \/ 2/);
  assert.match(source, /child.exitCode === null && child.signalCode === null/);
  assert.match(source, /Promise.allSettled\(\[raw, status, exit\]\)/);
  assert.doesNotMatch(source, /writeFile|arrayBuffer\(|Buffer\.concat|chunks\.push|fetch\(/);
});

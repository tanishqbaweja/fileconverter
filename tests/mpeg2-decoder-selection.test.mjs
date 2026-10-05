import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { selectMpeg2Decoders, verifyMpeg2DecoderSet } from "../media/ffmpeg/mpeg2-decoder-selection.mjs";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
test("Additional specialist preserves broad default and exact upstream decoder dependencies", () => {
  assert.equal(selectMpeg2Decoders().requested, "h264,hevc,mpeg4,mpeg2video,theora,vp8,vp9");
  assert.deepEqual(selectMpeg2Decoders("hevc-mpeg4"), {
    name: "hevc-mpeg4", requested: "hevc,mpeg4", enabled: ["h263", "hevc", "mpeg4"],
  });
  for (const invalid of [null, "", "none", "__proto__", "constructor", 1])
    assert.throws(() => selectMpeg2Decoders(invalid), /decoder set/);
  for (const name of ["wide", "hevc-mpeg4"]) {
    const selected = selectMpeg2Decoders(name);
    assert.deepEqual(verifyMpeg2DecoderSet(name, selected.enabled), selected);
    assert.throws(() => verifyMpeg2DecoderSet(name, selected.enabled.slice(1)), /compiled decoder/);
    assert.throws(() => verifyMpeg2DecoderSet(name, [...selected.enabled, "aac"]), /compiled decoder/);
    assert.throws(() => verifyMpeg2DecoderSet(name, [...selected.enabled].reverse()), /compiled decoder/);
  }
  assert.throws(() => verifyMpeg2DecoderSet("hevc-mpeg4", selectMpeg2Decoders().enabled), /compiled decoder/);
});
test("Only decoder selection changes: fixed heap, kernel, AVIO, guarded stacks, quality and default module preserved", async () => {
  const recipe = await read("media/ffmpeg/build-mpeg2-candidate.sh");
  assert.match(recipe, /WITHIN_MPEG2_DECODER_SET:-wide/);
  for (const name of ["wide", "hevc-mpeg4"])
    assert.ok(recipe.includes(`${name}) CANDIDATE_DECODER_FLAGS="--enable-decoder=${selectMpeg2Decoders(name).requested}"`));
  assert.equal(recipe.split('"${CANDIDATE_DECODER_FLAGS}"').length, 2);
  assert.match(recipe, /-sINITIAL_MEMORY=33554432/); assert.match(recipe, /-sMAXIMUM_MEMORY=33554432/);
  assert.match(recipe, /-sALLOW_MEMORY_GROWTH=0/); assert.match(recipe, /-sSTACK_OVERFLOW_CHECK=2/);
  assert.match(recipe, /-sSTACK_SIZE=262144/); assert.match(recipe, /-sASYNCIFY_STACK_SIZE=262144/);
  assert.match(recipe, /mpeg2-decoder-selection.mjs/);
  const manifest = await read("media/ffmpeg/mpeg2-candidate-manifest.mjs");
  assert.match(manifest, /verifyMpeg2DecoderSet\(process.env.WITHIN_MPEG2_DECODER_SET/);
  assert.match(manifest, /decoderSet: decoderSelection.name/);
  assert.equal(createHash("sha256").update(await read("media/ffmpeg/mpeg2-candidate.c")).digest("hex"),
    "67d3b8299a9e695ea68f96fdcc51d3f5ba5a694547b3f8288e740990c5f7eac0");
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  await assert.rejects(promisify(execFile)(bash, ["media/ffmpeg/build-mpeg2-candidate.sh"], {
    env: { ...process.env, WITHIN_MPEG2_DECODER_SET: "none" }, windowsHide: true,
  }), /Private MPEG2 decoder set must be wide or hevc-mpeg4/);
});

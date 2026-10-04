import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeSadReference, SAD_SOURCE_SHA256, SAD_SHAPES } from "../scripts/lib/openh264-sad-reference.mjs";

test("SAD proof refuses an invented or drifted scalar oracle", () => {
  assert.equal(SAD_SOURCE_SHA256, "82c47be2c051aa92079ac0c731818c4a33612c6dbe61534ada5c0ac5c33667ae");
  assert.deepEqual(SAD_SHAPES, ["8x8", "16x8", "8x16", "16x16"]);
  assert.throws(() => makeSadReference(Buffer.alloc(8268)), /Pinned OpenH264 SAD/);
  assert.throws(() => makeSadReference(Buffer.from("int32_t WelsSampleSad8x8_c() {}")), /Pinned OpenH264 SAD/);
});
test("private SAD SIMD uses exact-width loads and independently advances both strides without allocating", async () => {
  const source = await readFile(new URL("../media/ffmpeg/openh264-sad-simd.h", import.meta.url), "utf8");
  assert.match(source, /Width == 8 \? wasm_v128_load64_zero\(current\) : wasm_v128_load\(current\)/);
  assert.match(source, /Width == 8 \? wasm_v128_load64_zero\(reference\) : wasm_v128_load\(reference\)/);
  assert.match(source, /current \+= current_stride/);
  assert.match(source, /reference \+= reference_stride/);
  assert.match(source, /wasm_u16x8_extadd_pairwise_u8x16/);
  assert.match(source, /wasm_u32x4_extadd_pairwise_u16x8/);
  assert.doesNotMatch(source.replace(/\/\/[^\n]*/g, ""), /malloc|new |quality|frame_skipping/);
  const production = await readFile(new URL("../media/ffmpeg/build-h264-candidate.sh", import.meta.url), "utf8");
  assert.match(production, /export WITHIN_H264_SAD_SIMD="\$\{WITHIN_H264_SAD_SIMD:-0\}"/);
});
test("SAD proof isolates bounded warm primitive measurements from file conversion acceptance", async () => {
  const script = await readFile(new URL("../scripts/verify-sad-arithmetic.mjs", import.meta.url), "utf8");
  for (const group of ["exhaustiveUniformBytePairs", "exhaustiveMixedSignBytePairs", "singlePixelLaneAndRow",
    "seededRandomIndependentStrideAndAlignment", "zeroAndOverlappingNonnegativeStrides", "inputEndsExactlyAtWasmBoundary"]) assert.ok(script.includes(group));
  assert.match(script, /browserConversions: 0, conversionBuildsChanged: false, speedGainClaim: null/);
  assert.match(script, /not exhaustive enumeration/);
  assert.match(script, /input or canary modified/);
  assert.match(script, /round < 7/);
  assert.match(script, /simd.checksum, scalar.checksum/);
  const shell = await readFile(new URL("../media/ffmpeg/verify-sad-arithmetic.sh", import.meta.url), "utf8");
  assert.match(shell, /-O3 -fno-strict-aliasing -msimd128 -pthread/);
  assert.match(shell, /-sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432/);
  assert.match(shell, /trap cleanup EXIT/);
  assert.match(shell, /export TMPDIR="\$\{BUILD_ROOT\}\/tmp" EM_CACHE="\$\{BUILD_ROOT\}\/cache"/);
  assert.doesNotMatch(shell, /docker (build|run)/);
});

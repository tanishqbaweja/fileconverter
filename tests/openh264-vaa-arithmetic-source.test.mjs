import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeVaaReference, VAA_SOURCE_SHA256 } from "../scripts/lib/openh264-vaa-reference.mjs";

test("VAA arithmetic reference refuses source drift rather than comparing against a rewritten oracle", () => {
  assert.equal(VAA_SOURCE_SHA256, "69a57a09170a613b472a28f339bf54e72a82c2d46bc0c69e62d0abb676353b3a");
  assert.throws(() => makeVaaReference(Buffer.alloc(19566)), /Pinned OpenH264/);
  assert.throws(() => makeVaaReference(Buffer.from("void VAACalcSadBgd_c () {}")), /Pinned OpenH264/);
});
test("private SIMD candidate preserves bounds, signed sums, traversal and explicit wrap without changing video builds", async () => {
  const source = await readFile(new URL("../media/ffmpeg/openh264-vaa-simd.h", import.meta.url), "utf8");
  assert.match(source, /wasm_v128_load64_zero\(current\)/);
  assert.doesNotMatch(source, /wasm_v128_load\(/);
  assert.match(source, /signed_sums = wasm_i16x8_add\(signed_sums, diff\)/);
  assert.match(source, /uint32_t frame = 0/);
  assert.match(source, /step = \(stride << 4\) - width/);
  assert.match(source, /memcpy\(frame_sad, &frame, sizeof\(frame\)\)/);
  const recipe = await readFile(new URL("../media/ffmpeg/build-h264-candidate.sh", import.meta.url), "utf8");
  assert.doesNotMatch(recipe, /openh264-vaa-simd|WITHIN_H264_VAA_SIMD/);
});
test("arithmetic proof covers finite patterns honestly and owns compiler scratch with terminal cleanup", async () => {
  const script = await readFile(new URL("../scripts/verify-vaa-arithmetic.mjs", import.meta.url), "utf8");
  for (const group of ["exhaustiveUniformBytePairs", "exhaustiveMixedSignBytePairs", "singlePixelQuadrantAndLane",
    "seededRandomStrideAlignmentAndDimensions", "maximumDimensionsAndFrameOverflow", "sourceEndsAtWasmMemoryBoundary"]) assert.ok(script.includes(group));
  assert.match(script, /not exhaustive enumeration/);
  assert.match(script, /browserConversions: 0, speedGainClaim: null/);
  assert.match(script, /input modified/);
  assert.match(script, /prefix canary overwritten/);
  assert.match(script, /suffix canary overwritten/);
  const shell = await readFile(new URL("../media/ffmpeg/verify-vaa-arithmetic.sh", import.meta.url), "utf8");
  assert.match(shell, /trap cleanup EXIT/);
  assert.match(shell, /-sEXPORTED_RUNTIME_METHODS='\["HEAPU8"\]'/);
  assert.match(shell, /-sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432/);
  assert.match(shell, /export TMPDIR="\$\{BUILD_ROOT\}\/tmp" EM_CACHE="\$\{BUILD_ROOT\}\/cache"/);
  assert.doesNotMatch(shell, /docker (build|run)/);
});

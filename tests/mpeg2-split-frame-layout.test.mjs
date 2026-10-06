import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readMpeg2SplitNativeLayout } from "../scripts/lib/mpeg2-split-frame-layout.mjs";

test("Versioned 64-byte native reader preserves signed strides and returns scalar-only frozen layouts", () => {
  const heap = new Uint8Array(new WebAssembly.Memory({ initial: 256, maximum: 256, shared: true }).buffer);
  const pointer = 128, record = new DataView(heap.buffer, pointer, 64);
  record.setUint32(0, 1, true); record.setUint32(4, 1920, true); record.setUint32(8, 804, true);
  record.setUint32(12, 0, true);
  for (let i = 0; i < 3; i++) {
    record.setUint32(16 + 16 * i, 4000 + i * 8000, true);
    record.setInt32(20 + 16 * i, -1920 / (i ? 2 : 1), true);
    record.setUint32(24 + 16 * i, 256, true); record.setUint32(28 + 16 * i, 100000, true);
  }
  const value = readMpeg2SplitNativeLayout(heap, pointer);
  assert.equal(value.pixelFormat, "yuv420p"); assert.deepEqual(value.planes.map((p) => p.stride), [-1920, -960, -960]);
  assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.planes));
  assert.ok(value.planes.every((p) => Object.isFrozen(p) && Object.values(p).every(Number.isSafeInteger)));
  record.setUint32(4, 640, true); assert.equal(value.width, 1920, "No borrowed descriptor view retained");
  record.setUint32(12, 1, true); assert.equal(readMpeg2SplitNativeLayout(heap, pointer).pixelFormat, "yuv422p");
  for (const at of [-1, 1, 127, heap.length - 60, Number.MAX_SAFE_INTEGER])
    assert.throws(() => readMpeg2SplitNativeLayout(heap, at));
  record.setUint32(0, 2, true); assert.throws(() => readMpeg2SplitNativeLayout(heap, pointer), /ABI/);
  record.setUint32(0, 1, true); record.setUint32(12, 2, true);
  assert.throws(() => readMpeg2SplitNativeLayout(heap, pointer), /pixel kind/);
  assert.throws(() => readMpeg2SplitNativeLayout(heap.subarray(4), pointer), /fixed-heap/);
});
test("Native descriptor borrows exact FFmpeg backing references and never mutates codec frames or reference counts", async () => {
  const header = await readFile(new URL("../media/ffmpeg/mpeg2-split-frame-layout.h", import.meta.url), "utf8");
  assert.match(header, /sizeof\(WithinSplitFrameLayout\) == 64/); assert.match(header, /sizeof\(uintptr_t\) == 4/);
  assert.match(header, /av_frame_get_plane_buffer\(frame, i\)/); assert.match(header, /const AVFrame \*frame/);
  assert.match(header, /first < \(int64_t\)\(uintptr_t\)buffer->data/);
  assert.match(header, /frame->crop_top/); assert.match(header, /AVERROR\(ENOSYS\)/);
  assert.match(header, /\*output = next/);
  assert.doesNotMatch(header, /av_(?:malloc|free|buffer_ref|buffer_unref|frame_unref|frame_ref|frame_make_writable)\(/);
  assert.doesNotMatch(header, /frame->\w+\s*=(?!=)|memcpy\(|memset\(/);
});
test("Standalone native ownership smoke cannot convert files or certify full-browser memory or metadata", async () => {
  const root = new URL("../", import.meta.url);
  const native = await readFile(new URL("media/ffmpeg/mpeg2-split-frame-smoke.c", root), "utf8");
  const recipe = await readFile(new URL("media/ffmpeg/verify-mpeg2-split-frame.sh", root), "utf8");
  const verifier = await readFile(new URL("scripts/verify-mpeg2-split-frame-native.mjs", root), "utf8");
  assert.doesNotMatch(native, /avcodec_|avformat_|fopen\(|within_input|within_output/);
  assert.match(native, /av_frame_get_buffer\(synthetic_frame, 32\)/); assert.match(native, /av_frame_free\(&synthetic_frame\)/);
  assert.match(recipe, /--disable-avformat --disable-avcodec/); assert.match(recipe, /--enable-avutil/);
  assert.match(recipe, /memory_bytes=33554432/); assert.match(recipe, /memory_bytes=16777216/);
  assert.match(recipe, /-sMALLOC=dlmalloc/); assert.match(recipe, /-sSTACK_OVERFLOW_CHECK=2/);
  assert.match(recipe, /-sALLOW_MEMORY_GROWTH=0/); assert.match(recipe, /trap cleanup EXIT/);
  assert.match(recipe, /printf '\{"type":"commonjs"\}/); assert.match(recipe, /tail -n 120 ffbuild\/config.log/);
  assert.match(recipe, /\[\[.*! -L "\$\{BUILD_ROOT\}"/);
  assert.match(verifier, /actualLimits\[role\], \[\{ imported: true/); assert.match(verifier, /assert.notEqual\(pixelHash\(encoder, target\), original/);
  assert.match(verifier, /paddingHash\(encoder, target\), originalPadding/);
  assert.match(verifier, /processMemoryAcceptance: false/); assert.match(verifier, /conversionPerformed: false/);
  assert.match(verifier, /finally \{\s*bridge\?\.close\(\)/);
  assert.doesNotMatch(verifier, /test\.mkv|ffmpeg.*exec|spawn\(/);
});

test("Executed compiler-probe failure remains distinct from an unexecuted native frame or conversion test", async () => {
  const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-split-frame-build-failure-2026-10-06.json", import.meta.url)));
  assert.equal(proof.run.databaseId, 37434634781); assert.equal(proof.run.jobId, 112173338626);
  assert.equal(proof.run.headSha, "ea0aeb4aab92c07601a80a3b4a518719c6891a7e");
  assert.equal(proof.run.conclusion, "failure"); assert.equal(proof.run.buildStepSeconds, 29);
  assert.equal(proof.nativeFrameHeaderCompiled, false); assert.equal(proof.syntheticFrameCasesExecuted, 0);
  assert.equal(proof.conversionPerformed, false); assert.equal(proof.originalFixtureRead, false);
  assert.equal(proof.hostedCleanupStepPassed, true); assert.equal(proof.hostedArtifactsRemaining, 0);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.rootCauseProven, false);
  assert.equal(proof.speedGainClaim, null); assert.match(proof.changedNextAttempt, /One changed synthetic build/);
});

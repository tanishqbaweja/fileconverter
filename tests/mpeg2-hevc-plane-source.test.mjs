import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { reconstructExecutedHevcGetBuffer } from "../scripts/lib/alignment16-first-malloc-capacity.mjs";
import { reverseSingleIdlePlaneBuffer } from "../media/ffmpeg/mpeg2-encoder-plane-source.mjs";
import { reversePlaneFactoryPrototype } from "../media/ffmpeg/mpeg2-encoder-plane-prototype-source.mjs";
import { HEVC_PLANE_EDITS, applyHevcSingleIdleGetBuffer, reverseHevcSingleIdleGetBuffer, makeHevcSingleIdleBuffer, makeHevcPlaneSmoke } from "../media/ffmpeg/mpeg2-hevc-plane-source.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
test("new HEVC plane selector/wiring reverses executed decoder; sizes, padding, live references and nonselected policies remain exact", async () => {
  const old = reconstructExecutedHevcGetBuffer(await read("work/mpeg2-encoder-planes-38044000567/encoder-plane-get-buffer.c")).generated;
  const changed = applyHevcSingleIdleGetBuffer(old); assert.equal(reverseHevcSingleIdleGetBuffer(changed), old);
  assert.ok(changed.includes("pool->hevc_single_idle")); assert.ok(changed.includes("av_buffer_pool_get(pool->pools[i])"));
  assert.ok(changed.includes("buffer_size[i] = size[i] + 16 + STRIDE_ALIGN - 1"));
  for (const [before] of HEVC_PLANE_EDITS) for (const gate of ["avcodec_align_dimensions2", "av_image_fill_plane_sizes", "av_buffer_unref", "av_refstruct_unref", "av_buffer_pool_uninit"])
    assert.ok(!before.includes(gate));
  const header = await read("media/ffmpeg/mpeg2-hevc-plane-policy.h");
  assert.match(header, /codec_id == AV_CODEC_ID_HEVC && threads == 1 && !encoder &&\s+!memory_poisoning/);
  assert.throws(() => applyHevcSingleIdleGetBuffer(old + " ")); assert.throws(() => applyHevcSingleIdleGetBuffer(changed));
});
test("bounded pool source exactly equals actually built encoder primitive; actual-libavutil smoke is only a pending decoder derivative", async () => {
  const actualBuffer = await read("work/mpeg2-encoder-planes-38044000567/encoder-plane-buffer.c");
  const changed = makeHevcSingleIdleBuffer(reverseSingleIdlePlaneBuffer(reversePlaneFactoryPrototype(actualBuffer))); assert.equal(changed, actualBuffer);
  assert.match(changed, /pool->pool_free == within_mpeg2_single_idle_plane_free && pool->pool/);
  assert.match(changed, /memset\(ret->data, 0, ret->size\)/);
  const original = await read("media/ffmpeg/mpeg2-encoder-plane-smoke.c"), recipe = makeHevcPlaneSmoke(original);
  let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, original); assert.equal(recipe.compiledExecutionProven, false);
  for (const gate of ["selectors == 80", "200000", "av_buffer_get_ref_count(a) == 2", "delayed.allocated == delayed.freed", "expect_zero(live)", "counts.allocated == counts.freed"])
    assert.ok(recipe.generated.includes(gate), gate);
});

// Reuse the real encoder's bounded pool primitive; select HEVC decoder planes.
// This is a private SOURCE candidate, not compiled/browser/full acceptance.
import assert from "node:assert/strict";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { GET_BUFFER_EDITS, applySingleIdlePlaneBuffer, reverseSingleIdlePlaneBuffer } from "./mpeg2-encoder-plane-source.mjs";
import { applyPlaneFactoryPrototype, reversePlaneFactoryPrototype } from "./mpeg2-encoder-plane-prototype-source.mjs";
const executed = "910da6292a78066b114da7d26c7c1684969022960efc8becf116dc2b5acc4ab4";
const oldBlock = `        // Private specialist core: no inactive encoder / HEVC plane cache.
        // Preserve upstream layout, padding, zeroing and all live references.
        // Other decoder pools and auxiliary reference pools remain unchanged.
        pic->buf[i] = (av_codec_is_encoder(s->codec) ||
                       s->codec_id == AV_CODEC_ID_HEVC)`;
const newBlock = `        // Private single-thread HEVC decoder: at most one final-unreferenced
        // plane per pool. Pool acquisition zeroes the complete padded buffer.
        // Live references and all nonselected allocation policies stay intact.
        pic->buf[i] = pool->hevc_single_idle
            ? av_buffer_pool_get(pool->pools[i])
            : (av_codec_is_encoder(s->codec) ||
                       s->codec_id == AV_CODEC_ID_HEVC)`;
export const HEVC_PLANE_EDITS = Object.freeze(GET_BUFFER_EDITS.map(([before, after], index) => {
  const convert = text => text.replaceAll("mpeg2-encoder-plane-policy.h", "mpeg2-hevc-plane-policy.h")
    .replaceAll("within_mpeg2_plane_single_idle", "within_hevc_plane_single_idle")
    .replaceAll("encoder_single_idle", "hevc_single_idle");
  return Object.freeze(index === 5 ? [oldBlock, newBlock] : [convert(before), convert(after)]);
}));
export function applyHevcSingleIdleGetBuffer(source) {
  assert.equal(sha(source), executed); let generated = source;
  for (const [before, after] of HEVC_PLANE_EDITS) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  assert.equal(reverseHevcSingleIdleGetBuffer(generated), source);
  return generated;
}
export function reverseHevcSingleIdleGetBuffer(source) {
  let restored = source;
  for (const [before, after] of HEVC_PLANE_EDITS.toReversed()) { assert.equal(restored.split(after).length, 2); restored = restored.replace(after, before); }
  assert.equal(sha(restored), executed); return restored;
}
export function makeHevcSingleIdleBuffer(source) {
  const generated = applyPlaneFactoryPrototype(applySingleIdlePlaneBuffer(source));
  assert.equal(sha(generated), "76fcae1c9409074b9b287d77d189ba06ab84e680e818a7649c56a6ad43db081a");
  assert.equal(reverseSingleIdlePlaneBuffer(reversePlaneFactoryPrototype(generated)), source);
  return generated;
}
export function makeHevcPlaneSmoke(source) {
  // Same actual-libavutil lifetime cases, new decoder-only selector.
  const edits = [["mpeg2-encoder-plane-policy.h", "mpeg2-hevc-plane-policy.h"],
    ["within_mpeg2_plane_single_idle", "within_hevc_plane_single_idle"],
    ["codecs[i] == AV_CODEC_ID_MPEG2VIDEO && threads[j] == 1 && encoder && !poison", "codecs[i] == AV_CODEC_ID_HEVC && threads[j] == 1 && !encoder && !poison"],
    ["actual-libavutil-encoder-plane-lifecycle-not-conversion", "actual-libavutil-hevc-plane-lifecycle-not-conversion"]];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replace(after, before);
  assert.equal(reverse, source);
  return { generated, edits, originalCasesByteExact: true, compiledExecutionProven: false };
}

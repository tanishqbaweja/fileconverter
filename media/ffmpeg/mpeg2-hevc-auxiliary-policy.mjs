// Exact reversible cache-admission trial; sizes, DPB and live refs unchanged.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HEVC_DECODER_SOURCE_SHA256 = "d6c12610d92a8d8e27bae984172ce1d0f13f8eb16d5998eb58cc25b2fc690974";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const substitutions = [
  ['#include "hevcdec.h"\n', '#include "hevcdec.h"\n#include "mpeg2-hevc-auxiliary-policy.h"\n'],
  ["static int pic_arrays_init(HEVCLayerContext *l, const HEVCSPS *sps)",
    "static int pic_arrays_init(HEVCLayerContext *l, const HEVCSPS *sps, unsigned pool_flags)"],
  ["l->tab_mvf_pool = av_refstruct_pool_alloc(min_pu_size * sizeof(MvField), 0);",
    "l->tab_mvf_pool = av_refstruct_pool_alloc(min_pu_size * sizeof(MvField), pool_flags);"],
  ["l->rpl_tab_pool = av_refstruct_pool_alloc(ctb_count   * sizeof(RefPicListTab), 0);",
    "l->rpl_tab_pool = av_refstruct_pool_alloc(ctb_count   * sizeof(RefPicListTab), pool_flags);"],
  ["ret = pic_arrays_init(l, sps);",
    "ret = pic_arrays_init(l, sps, within_hevc_auxiliary_pool_flags(\n" +
    "        s->avctx->codec_id, s->avctx->thread_count, av_codec_is_encoder(s->avctx->codec)));"],
];
function bounded(source) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 196608);
}
export function applyHevcAuxiliaryPolicy(source) {
  bounded(source); assert.equal(sha(source), HEVC_DECODER_SOURCE_SHA256);
  for (const [before, after] of substitutions) {
    assert.equal(source.split(before).length, 2); source = source.replace(before, after);
  }
  return source;
}
export function reverseHevcAuxiliaryPolicy(source) {
  bounded(source);
  for (const [before, after] of [...substitutions].reverse()) {
    assert.equal(source.split(after).length, 2); source = source.replace(after, before);
  }
  assert.equal(sha(source), HEVC_DECODER_SOURCE_SHA256); return source;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, "../.."), target = path.resolve(process.argv[2] ?? "");
  assert.equal(process.argv.length, 3);
  assert.equal(target, path.join(root, "work/mpeg2-candidate-build/ffmpeg/libavcodec/hevc/hevcdec.c"));
  assert.equal(await realpath(target), target);
  const info = await lstat(target); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 196608);
  const before = await readFile(target, "utf8"), after = applyHevcAuxiliaryPolicy(before);
  assert.equal(reverseHevcAuxiliaryPolicy(after), before);
  await writeFile(target, after);
  process.stdout.write(`${sha(after)}  private-hevc-final-unref-cache-policy\n`);
}

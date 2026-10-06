// Reversible scalar observation around exactly two upstream allocation calls.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HEVC_REFS_SOURCE_SHA256 } from "./mpeg2-hevc-auxiliary-diagnostic.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const forward = "\nstatic void *within_hevc_pool_get(HEVCContext *s, HEVCLayerContext *l, unsigned which);\n";
const substitutions = [
  ['#include "libavutil/refstruct.h"\n', '#include "libavutil/refstruct.h"\n' + forward],
  ["av_refstruct_pool_get(l->tab_mvf_pool)", "within_hevc_pool_get(s, l, 0)"],
  ["av_refstruct_pool_get(l->rpl_tab_pool)", "within_hevc_pool_get(s, l, 1)"],
];
const addition = `
/* Shared48-event inventory: pool-get attempts AND encoder boundaries. */
int within_refstruct_pool_diagnostic(AVRefStructPool *pool, size_t stats[4]);
void within_hevc_aux_emit(unsigned sequence, unsigned layer, unsigned phase,
                          unsigned which, unsigned succeeded, unsigned active,
                          unsigned short_refs, unsigned long_refs, unsigned output,
                          const size_t *values);
static void within_hevc_pool_snapshot(const HEVCContext *s, const HEVCLayerContext *l,
                                      unsigned phase, unsigned which, unsigned succeeded)
{
    static unsigned sequence;
    if (sequence >= 48 || !s->avctx || s->avctx->codec_id != AV_CODEC_ID_HEVC ||
        s->avctx->thread_count != 1 || av_codec_is_encoder(s->avctx->codec) || !l->sps)
        return;
    unsigned active = 0, short_refs = 0, long_refs = 0, output = 0;
    for (unsigned i = 0; i < FF_ARRAY_ELEMS(l->DPB); i++) {
        const unsigned flags = l->DPB[i].flags;
        active += !!flags;
        short_refs += !!(flags & HEVC_FRAME_FLAG_SHORT_REF);
        long_refs += !!(flags & HEVC_FRAME_FLAG_LONG_REF);
        output += !!(flags & HEVC_FRAME_FLAG_OUTPUT);
    }
    size_t values[12] = { 0 };
    AVRefStructPool *pools[2] = { l->tab_mvf_pool, l->rpl_tab_pool };
    for (unsigned i = 0; i < 2; i++) {
        size_t *row = values + 6 * i;
        row[0] = pools[i] != NULL;
        if (pools[i])
            row[1] = within_refstruct_pool_diagnostic(pools[i], row + 2);
    }
    within_hevc_aux_emit(++sequence, (unsigned)(l - s->layers), phase, which,
                         succeeded, active, short_refs, long_refs, output, values);
}
static void *within_hevc_pool_get(HEVCContext *s, HEVCLayerContext *l, unsigned which)
{
    AVRefStructPool *pool = which == 0 ? l->tab_mvf_pool : l->rpl_tab_pool;
    within_hevc_pool_snapshot(s, l, 1, which, 0);
    void *obj = av_refstruct_pool_get(pool);
    within_hevc_pool_snapshot(s, l, 2, which, obj != NULL);
    return obj;
}
void within_hevc_aux_diagnostic(const AVCodecContext *context);
void within_hevc_aux_diagnostic(const AVCodecContext *context)
{
    if (!context || context->codec_id != AV_CODEC_ID_HEVC || context->thread_count != 1 ||
        !context->priv_data || av_codec_is_encoder(context->codec))
        return;
    const HEVCContext *s = context->priv_data;
    for (unsigned layer = 0; layer < FF_ARRAY_ELEMS(s->layers); layer++)
        within_hevc_pool_snapshot(s, &s->layers[layer], 0, 2, 0);
}
`;
export function instrumentHevcPoolAttempts(source) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 32768);
  assert.equal(sha(source), HEVC_REFS_SOURCE_SHA256);
  for (const [before, after] of substitutions) {
    assert.equal(source.split(before).length, 2); source = source.replace(before, after);
  }
  return source + addition;
}
export function reverseHevcPoolAttempts(source) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 32768);
  assert.ok(source.endsWith(addition)); source = source.slice(0, -addition.length);
  for (const [before, after] of [...substitutions].reverse()) {
    assert.equal(source.split(after).length, 2); source = source.replace(after, before);
  }
  assert.equal(sha(source), HEVC_REFS_SOURCE_SHA256); return source;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, "../.."), target = path.resolve(process.argv[2] ?? "");
  assert.equal(process.argv.length, 3);
  assert.equal(target, path.join(root, "work/mpeg2-candidate-build/ffmpeg/libavcodec/hevc/refs.c"));
  assert.equal(await realpath(target), target);
  const info = await lstat(target); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 32768);
  const before = await readFile(target, "utf8"), after = instrumentHevcPoolAttempts(before);
  assert.equal(reverseHevcPoolAttempts(after), before);
  await writeFile(target, after);
  process.stdout.write(`${sha(after)}  read-only-hevc-pool-attempt-source\n`);
}

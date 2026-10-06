// Exact addition-only diagnostic; no decoder references or allocation policy change.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HEVC_REFS_SOURCE_SHA256 = "340d160758ec36928907132618c0d989a0f09869cca5fe57ab936ad54a9a3e5e";
const kernelHash = "67d3b8299a9e695ea68f96fdcc51d3f5ba5a694547b3f8288e740990c5f7eac0";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const addition = `
/* Private read-only HEVC inventory at the actual encoder-send boundary. */
int within_refstruct_pool_diagnostic(AVRefStructPool *pool, size_t stats[4]);
void within_hevc_aux_emit(unsigned sequence, unsigned layer, unsigned active,
                          unsigned short_refs, unsigned long_refs, unsigned output,
                          const size_t *values);
void within_hevc_aux_diagnostic(const AVCodecContext *context);
void within_hevc_aux_diagnostic(const AVCodecContext *context)
{
    static unsigned sequence;
    if (!context || context->codec_id != AV_CODEC_ID_HEVC ||
        context->thread_count != 1 || !context->priv_data ||
        av_codec_is_encoder(context->codec))
        return;
    const HEVCContext *s = context->priv_data;
    for (unsigned layer = 0; layer < FF_ARRAY_ELEMS(s->layers); layer++) {
        const HEVCLayerContext *l = &s->layers[layer];
        if (!l->sps)
            continue;
        if (sequence >= 48)
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
        within_hevc_aux_emit(++sequence, layer, active, short_refs, long_refs,
                             output, values);
    }
}
`;
const needle = "  int result = avcodec_send_frame(p->encoder, frame);";
const boundary = "  within_hevc_aux_diagnostic(p->decoder);\n";

export function instrumentHevcAuxiliarySource(source) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 32768);
  assert.equal(sha(source), HEVC_REFS_SOURCE_SHA256);
  return source + addition;
}
export function reverseHevcAuxiliarySource(source) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 32768);
  assert.ok(source.endsWith(addition));
  const restored = source.slice(0, -addition.length);
  assert.equal(sha(restored), HEVC_REFS_SOURCE_SHA256);
  return restored;
}
export function instrumentHevcEncoderBoundary(kernel) {
  assert.equal(sha(kernel), kernelHash); assert.equal(kernel.split(needle).length, 2);
  return kernel.replace(needle, boundary + needle);
}
export function reverseHevcEncoderBoundary(kernel) {
  assert.equal(kernel.split(boundary).length, 2);
  const restored = kernel.replace(boundary, ""); assert.equal(sha(restored), kernelHash);
  return restored;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, "../.."), target = path.resolve(process.argv[2] ?? "");
  assert.equal(process.argv.length, 3);
  assert.equal(target, path.join(root, "work/mpeg2-candidate-build/ffmpeg/libavcodec/hevc/refs.c"));
  assert.equal(await realpath(target), target);
  const info = await lstat(target); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 32768);
  const before = await readFile(target, "utf8"), after = instrumentHevcAuxiliarySource(before);
  assert.equal(reverseHevcAuxiliarySource(after), before);
  await writeFile(target, after);
  process.stdout.write(`${sha(after)}  read-only-hevc-auxiliary-source\n`);
}

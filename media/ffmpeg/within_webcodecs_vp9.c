/* SPDX-License-Identifier: LGPL-2.1-or-later
 * Private encoder plug-in only. The existing FFmpeg demux/decode/mux/AVIO code
 * is unchanged. No file or completed output is passed through this interface.
 */
#include <stddef.h>
#include <errno.h>
#include <string.h>
#include <emscripten.h>
#include <emscripten/heap.h>
#include "avcodec.h"
#include "codec_internal.h"
#include "libavutil/intreadwrite.h"
#include "libavutil/opt.h"
#include "mpeg2-split-frame-layout.h"

typedef struct WithinWebCodecsVp9 {
    const AVClass *class;
    char *deadline;
    int cpu_used, lag, alt_ref, row_mt, tiles, crf;
    uint64_t frames;
    uint8_t config[96], frame[80];
} WithinWebCodecsVp9;
EM_ASYNC_JS(int, within_wc_open, (unsigned pointer), {
  try { return await Module["withinWebCodecs"].open(HEAPU8, pointer); }
  catch(error) { Module["withinBridge"].message(2, String(error).slice(0,512));
    return error?.name === "NotSupportedError" ? -2 : error?.name === "AbortError" ? -3 : -1; }
});
EM_ASYNC_JS(int, within_wc_frame, (unsigned pointer), {
  try { return await Module["withinWebCodecs"].encode(HEAPU8, pointer); }
  catch(error) { Module["withinBridge"].message(2, String(error).slice(0,512));
    return error?.name === "NotSupportedError" ? -2 : error?.name === "AbortError" ? -3 : -1; }
});
EM_JS(int, within_wc_copy, (unsigned pointer, unsigned bytes), {
  try { return Module["withinWebCodecs"].copy(HEAPU8, pointer, bytes); }
  catch(error) { Module["withinBridge"].message(2, String(error).slice(0,512));
    return error?.name === "NotSupportedError" ? -2 : error?.name === "AbortError" ? -3 : -1; }
});
EM_JS(void, within_wc_close, (void), { if(Module["withinWebCodecs"])Module["withinWebCodecs"].close(); });
/* JS returns protocol sentinels, never Linux errno values. Emscripten's errno
 * numbering differs; -38 would misleadingly report "Network is down". */
static int wc_error(int sentinel)
{
    return sentinel == -2 ? AVERROR(ENOSYS) : sentinel == -3 ? AVERROR_EXIT : AVERROR_EXTERNAL;
}
static av_cold int wc_init(AVCodecContext *ctx)
{
    WithinWebCodecsVp9 *s = ctx->priv_data;
    if (emscripten_get_heap_size() != 33554432 || ctx->pix_fmt != AV_PIX_FMT_YUV420P ||
        ctx->width < 2 || ctx->width > 1920 || (ctx->width & 1) || ctx->height < 2 || ctx->height > 1080 || (ctx->height & 1) ||
        ctx->time_base.num <= 0 || ctx->time_base.den <= 0 || ctx->framerate.num <= 0 || ctx->framerate.den <= 0 ||
        ctx->bit_rate < 10000 || ctx->bit_rate > 20000000 || ctx->max_b_frames ||
        s->crf != -1 || s->lag || s->alt_ref || s->cpu_used != 8 || strcmp(s->deadline, "realtime"))
        return AVERROR(ENOSYS); /* Unsupported controls never silently change semantics. */
    uint8_t *w = s->config; memset(w, 0, sizeof(s->config));
    AV_WL32(w,1); AV_WL32(w+4,ctx->width); AV_WL32(w+8,ctx->height);
    AV_WL32(w+12,ctx->time_base.num); AV_WL32(w+16,ctx->time_base.den);
    AV_WL32(w+20,ctx->framerate.num); AV_WL32(w+24,ctx->framerate.den);
    AV_WL32(w+28,ctx->bit_rate); AV_WL32(w+32,ctx->gop_size);
    AV_WL32(w+36,ctx->color_primaries); AV_WL32(w+40,ctx->color_trc);
    AV_WL32(w+44,ctx->colorspace); AV_WL32(w+48,ctx->color_range);
    AV_WL32(w+52,ctx->sample_aspect_ratio.num); AV_WL32(w+56,ctx->sample_aspect_ratio.den);
    int opened = within_wc_open((uintptr_t)w);
    return opened < 0 ? wc_error(opened) : opened;
}
static int wc_encode(AVCodecContext *ctx, AVPacket *packet, const AVFrame *frame, int *got_packet)
{
    WithinWebCodecsVp9 *s = ctx->priv_data; *got_packet = 0;
    if (!frame) return 0; /* Each submitted frame was already flushed. */
    WithinSplitFrameLayout layout;
    /* Descriptor must live in native heap, not an untrusted JS pixel pointer. */
    int result = within_split_describe_frame(frame, &layout, emscripten_get_heap_size());
    if (result < 0 || frame->pts == AV_NOPTS_VALUE || frame->pts < 0) return result < 0 ? result : AVERROR(EINVAL);
    memcpy(s->frame, &layout, sizeof(layout)); AV_WL64(s->frame+64, frame->pts);
    AV_WL32(s->frame+72, !s->frames || (ctx->gop_size > 0 && !(s->frames % ctx->gop_size)));
    AV_WL32(s->frame+76,1);
    int bytes = within_wc_frame((uintptr_t)s->frame);
    if (bytes <= 0 || bytes > 1048576) return bytes < 0 ? wc_error(bytes) : AVERROR(EINVAL);
    result = av_new_packet(packet, bytes); if (result < 0) return result;
    result = within_wc_copy((uintptr_t)packet->data, bytes);
    if (result < 0) { av_packet_unref(packet); return wc_error(result); }
    packet->pts = packet->dts = frame->pts; packet->duration = 1;
    packet->time_base = ctx->time_base; if (result == 1) packet->flags |= AV_PKT_FLAG_KEY;
    *got_packet = 1; s->frames++; return 0;
}
static av_cold int wc_close(AVCodecContext *ctx) { (void)ctx; within_wc_close(); return 0; }
#define OFFSET(field) offsetof(WithinWebCodecsVp9,field)
#define FLAGS (AV_OPT_FLAG_VIDEO_PARAM|AV_OPT_FLAG_ENCODING_PARAM)
static const AVOption options[] = {
    {"deadline","Required native bridge latency",OFFSET(deadline),AV_OPT_TYPE_STRING,{.str="realtime"},0,0,FLAGS},
    {"cpu-used","Only automatic baseline controls qualify",OFFSET(cpu_used),AV_OPT_TYPE_INT,{.i64=8},0,9,FLAGS},
    {"lag-in-frames","No delayed-frame input queue",OFFSET(lag),AV_OPT_TYPE_INT,{.i64=0},0,0,FLAGS},
    {"auto-alt-ref","No native alternate-frame buffering",OFFSET(alt_ref),AV_OPT_TYPE_INT,{.i64=0},0,0,FLAGS},
    {"row-mt","Native-only threading preference",OFFSET(row_mt),AV_OPT_TYPE_INT,{.i64=0},0,1,FLAGS},
    {"tile-columns","Native-only tiling preference",OFFSET(tiles),AV_OPT_TYPE_INT,{.i64=0},0,1,FLAGS},
    {"crf","Explicit CRF requires existing Wasm encoder",OFFSET(crf),AV_OPT_TYPE_INT,{.i64=-1},-1,63,FLAGS},
    {NULL}
};
static const AVClass wc_class = { .class_name="within_webcodecs_vp9", .item_name=av_default_item_name,
    .option=options, .version=LIBAVUTIL_VERSION_INT };
const FFCodec ff_within_webcodecs_vp9_encoder = {
    .p.name="within_webcodecs_vp9", CODEC_LONG_NAME("Private bounded browser VP9 encoder bridge"),
    .p.type=AVMEDIA_TYPE_VIDEO, .p.id=AV_CODEC_ID_VP9, .p.priv_class=&wc_class,
    .priv_data_size=sizeof(WithinWebCodecsVp9), .caps_internal=FF_CODEC_CAP_INIT_CLEANUP,
    .init=wc_init, .close=wc_close, FF_CODEC_ENCODE_CB(wc_encode), CODEC_PIXFMTS(AV_PIX_FMT_YUV420P),
};

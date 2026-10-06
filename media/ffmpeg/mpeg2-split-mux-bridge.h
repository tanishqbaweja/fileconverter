#ifndef WITHIN_MPEG2_SPLIT_MUX_BRIDGE_H
#define WITHIN_MPEG2_SPLIT_MUX_BRIDGE_H
#include "mpeg2-split-frame-layout.h"
#include "mpeg2-split-frame-properties.h"
#include "mpeg2-split-codec-parameters.h"
/* Bounded slots inside the decoder's existing32MiB heap, no payload staging
 * array. Encoded payload goes directly into a native AVPacket owned by mux. */
static uint8_t split_mux_config[96], split_mux_parameters[65536], split_mux_properties[65536], split_mux_packet_record[320];
static unsigned split_mux_parameter_bytes;
static WithinSplitFrameLayout split_mux_layout;

/* Synchronous only. The outer native mux loop owns every await in AVIO, so no
 * native reentry or nested Asyncify transaction occurs while a packet is held.
 * 0=open,1=frame,2=next,3=copy-to-native-packet,4=release,5=flush,6=close. */
EM_JS(int, within_split_call, (int operation, unsigned a, unsigned b, unsigned c), {
  try { return Module["withinSplit"].call(operation, HEAPU8, a, b, c); }
  catch (error) {
    Module["withinBridge"].message(2, (error instanceof Error ? error.message : String(error)).slice(0, 1024));
    return -5;
  }
});

static int within_split_open(const AVCodecContext *context)
{
    uint8_t *w = split_mux_config; memset(w, 0, 96);
    AV_WL32(w, 1); AV_WL32(w + 4, context->width); AV_WL32(w + 8, context->height);
    AV_WL32(w + 12, context->pix_fmt == AV_PIX_FMT_YUV422P);
    AV_WL32(w + 16, context->time_base.num); AV_WL32(w + 20, context->time_base.den);
    AV_WL32(w + 24, context->framerate.num); AV_WL32(w + 28, context->framerate.den);
    AV_WL32(w + 32, context->bit_rate); AV_WL32(w + 36, context->qmin); AV_WL32(w + 40, context->qmax);
    AV_WL32(w + 44, context->sample_aspect_ratio.num); AV_WL32(w + 48, context->sample_aspect_ratio.den);
    AV_WL32(w + 52, context->color_primaries); AV_WL32(w + 56, context->color_trc);
    AV_WL32(w + 60, context->colorspace); AV_WL32(w + 64, context->color_range);
    AV_WL32(w + 68, context->chroma_sample_location);
    int bytes = within_split_call(0, (uintptr_t)w, (uintptr_t)split_mux_parameters, 0);
    if (bytes < 144 || bytes > 65536) return bytes < 0 ? bytes : AVERROR_INVALIDDATA;
    split_mux_parameter_bytes = bytes; return 0;
}

static int within_split_send(AVFrame *frame)
{
    if (!frame) return within_split_call(5, 0, 0, 0);
    int result = within_split_describe_frame(frame, &split_mux_layout, emscripten_get_heap_size());
    if (result < 0) return result;
    unsigned property_bytes = 0;
    result = within_split_write_properties(frame, split_mux_properties, &property_bytes);
    if (result < 0) return result;
    return within_split_call(1, (uintptr_t)&split_mux_layout, (uintptr_t)split_mux_properties, property_bytes);
}

static int within_split_receive(AVPacket *packet)
{
    int status = within_split_call(2, (uintptr_t)split_mux_packet_record, 0, 0);
    if (status == 0) return AVERROR(EAGAIN);
    if (status == 2) return AVERROR_EOF;
    if (status != 1) return status < 0 ? status : AVERROR_INVALIDDATA;
    uint8_t *w = split_mux_packet_record;
    unsigned bytes = AV_RL32(w + 8), sides = AV_RL32(w + 56);
    if (AV_RL32(w) != 1 || AV_RL32(w + 4) || bytes > 1048576 || (AV_RL32(w + 12) & ~23u) ||
        (int32_t)AV_RL32(w + 48) <= 0 || (int32_t)AV_RL32(w + 52) <= 0 || sides > 16 || AV_RL32(w + 60)) return AVERROR_INVALIDDATA;
    unsigned side_bytes = 0;
    for (unsigned i = 0; i < 16; i++) {
        const uint8_t *item = w + 64 + i * 16;
        if (i >= sides) {
            if (AV_RL32(item) || AV_RL32(item + 4) || AV_RL32(item + 8) || AV_RL32(item + 12)) return AVERROR_INVALIDDATA;
        } else {
            unsigned size = AV_RL32(item + 8);
            if (AV_RL32(item + 4) || AV_RL32(item + 12) || size > 65536 - side_bytes ||
                !within_split_encoded_side(AV_RL32(item), size)) return AVERROR_INVALIDDATA;
            // av_packet_new_side_data replaces duplicate types. Never follow
            // an earlier freed pointer or silently discard a duplicate entry.
            for (unsigned j = 0; j < i; j++) if (AV_RL32(w + 64 + j * 16) == AV_RL32(item)) return AVERROR(ENOSYS);
            side_bytes += size;
        }
    }
    av_packet_unref(packet);
    int result = av_new_packet(packet, bytes);
    if (result < 0) return result;
    AV_WL32(w + 4, (uintptr_t)packet->data);
    memset(packet->data + bytes, 0, AV_INPUT_BUFFER_PADDING_SIZE);
    for (unsigned i = 0; i < sides; i++) {
        uint8_t *item = w + 64 + i * 16; unsigned size = AV_RL32(item + 8);
        uint8_t *data = av_packet_new_side_data(packet, AV_RL32(item), size);
        if (!data) return AVERROR(ENOMEM);
        AV_WL32(item + 4, (uintptr_t)data);
    }
    result = within_split_call(3, (uintptr_t)w, 0, 0);
    if (result < 0) return result;
    packet->pts = (int64_t)AV_RL64(w + 16); packet->dts = (int64_t)AV_RL64(w + 24);
    packet->duration = (int64_t)AV_RL64(w + 32); packet->pos = (int64_t)AV_RL64(w + 40);
    packet->flags = AV_RL32(w + 12);
    packet->time_base = (AVRational){ (int32_t)AV_RL32(w + 48), (int32_t)AV_RL32(w + 52) };
    return 0;
}
#endif

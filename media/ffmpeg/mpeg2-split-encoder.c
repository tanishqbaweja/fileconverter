/* Private separate MPEG-2 codec owner. No demux, mux, filesystem, source file,
 * browser writer, hidden resize or codec algorithm replacement. The production
 * owner must await packet consumption and apply original native time rescaling.
 * Closed=0, idle=1, prepared=2, receiving=3, flushing=4, EOF=5, failed=6. */
#include <emscripten.h>
#include <emscripten/heap.h>
#include "mpeg2-split-frame-layout.h"
#include "mpeg2-split-frame-properties.h"
#include "mpeg2-split-codec-parameters.h"

static AVCodecContext *encoder_context;
static AVCodecParameters *encoder_parameters;
static AVFrame *encoder_input;
static AVPacket *encoder_packet;
static WithinSplitFrameLayout encoder_layout;
static uint8_t encoder_config[96], encoder_properties[65536], encoder_parameter_wire[65536], encoder_packet_record[320];
static unsigned encoder_parameter_bytes, encoder_frames, encoder_packets;
static int encoder_state, encoder_packet_held;

/* Limit the codec's requested reserve BEFORE allocation, separately from the
 * actual compressed-payload bound. Worst-case reserves are not packet sizes. */
static int encoder_packet_buffer(AVCodecContext *context, AVPacket *packet, int flags)
{
    if (packet->size < 0 || packet->size > 8 * 1024 * 1024) return AVERROR(EFBIG);
    return avcodec_default_get_encode_buffer(context, packet, flags);
}

EMSCRIPTEN_KEEPALIVE int within_split_encoder_config(void) { return (int)(uintptr_t)encoder_config; }
EMSCRIPTEN_KEEPALIVE int within_split_encoder_properties(void) { return (int)(uintptr_t)encoder_properties; }
EMSCRIPTEN_KEEPALIVE int within_split_encoder_parameters(void) { return (int)(uintptr_t)encoder_parameter_wire; }
EMSCRIPTEN_KEEPALIVE int within_split_encoder_parameter_bytes(void) { return encoder_parameter_bytes; }
EMSCRIPTEN_KEEPALIVE int within_split_encoder_state(void) { return encoder_state; }
EMSCRIPTEN_KEEPALIVE unsigned within_split_encoder_frames(void) { return encoder_frames; }
EMSCRIPTEN_KEEPALIVE unsigned within_split_encoder_packets(void) { return encoder_packets; }
EMSCRIPTEN_KEEPALIVE int within_split_encoder_input_refs(void)
{ return encoder_input && encoder_input->buf[0] ? av_buffer_get_ref_count(encoder_input->buf[0]) : 0; }

EMSCRIPTEN_KEEPALIVE int within_split_encoder_close(void)
{
    av_packet_free(&encoder_packet); av_frame_free(&encoder_input);
    avcodec_parameters_free(&encoder_parameters); avcodec_free_context(&encoder_context);
    encoder_state = encoder_packet_held = 0; encoder_parameter_bytes = encoder_frames = encoder_packets = 0;
    memset(encoder_config, 0, sizeof(encoder_config));
    memset(encoder_properties, 0, sizeof(encoder_properties)); memset(encoder_parameter_wire, 0, sizeof(encoder_parameter_wire));
    memset(&encoder_layout, 0, sizeof(encoder_layout)); memset(encoder_packet_record, 0, sizeof(encoder_packet_record));
    return 0;
}

EMSCRIPTEN_KEEPALIVE int within_split_encoder_open(void)
{
    if (encoder_state || encoder_context || emscripten_get_heap_size() != 16777216) return AVERROR(EBUSY);
    const uint8_t *wire = encoder_config;
    const unsigned width = AV_RL32(wire + 4), height = AV_RL32(wire + 8), kind = AV_RL32(wire + 12);
    const int32_t tn = AV_RL32(wire + 16), td = AV_RL32(wire + 20), fn = AV_RL32(wire + 24), fd = AV_RL32(wire + 28);
    const unsigned bitrate = AV_RL32(wire + 32), qmin = AV_RL32(wire + 36), qmax = AV_RL32(wire + 40);
    const int32_t sn = AV_RL32(wire + 44), sd = AV_RL32(wire + 48);
    if (AV_RL32(wire) != 1 || width < 2 || width > 4096 || (width & 1) || height < 2 || height > 2160 || (height & 1) || kind > 1 ||
        tn <= 0 || td <= 0 || fn <= 0 || fd <= 0 || (int64_t)tn * fn != (int64_t)td * fd || sn < 0 || (sn && sd <= 0) ||
        (bitrate != 300000 && bitrate != 600000 && bitrate != 1000000 && bitrate != 2000000 && bitrate != 4000000) ||
        !((qmin == 8 && qmax == 31) || (qmin == 4 && qmax == 20) || (qmin == 2 && qmax == 12)) ||
        AV_RL32(wire + 64) == AVCOL_RANGE_JPEG) return AVERROR(EINVAL);
    for (unsigned at = 72; at < sizeof(encoder_config); at += 4) if (AV_RL32(wire + at)) return AVERROR(EINVAL);
    const AVCodec *codec = avcodec_find_encoder_by_name("mpeg2video");
    if (!codec) return AVERROR(ENOSYS);
    encoder_context = avcodec_alloc_context3(codec); encoder_parameters = avcodec_parameters_alloc();
    encoder_input = av_frame_alloc(); encoder_packet = av_packet_alloc();
    if (!encoder_context || !encoder_parameters || !encoder_input || !encoder_packet) {
        within_split_encoder_close(); return AVERROR(ENOMEM);
    }
    encoder_context->width = width; encoder_context->height = height;
    encoder_context->pix_fmt = kind ? AV_PIX_FMT_YUV422P : AV_PIX_FMT_YUV420P;
    encoder_context->time_base = (AVRational){ tn, td }; encoder_context->framerate = (AVRational){ fn, fd };
    encoder_context->bit_rate = bitrate; encoder_context->gop_size = 48; encoder_context->max_b_frames = 0;
    encoder_context->thread_count = 1; encoder_context->slices = 1; encoder_context->qmin = qmin; encoder_context->qmax = qmax;
    encoder_context->strict_std_compliance = FF_COMPLIANCE_NORMAL;
    encoder_context->flags |= AV_CODEC_FLAG_LOW_DELAY | AV_CODEC_FLAG_GLOBAL_HEADER | AV_CODEC_FLAG_BITEXACT;
    encoder_context->sample_aspect_ratio = (AVRational){ sn, sd };
    encoder_context->color_primaries = AV_RL32(wire + 52); encoder_context->color_trc = AV_RL32(wire + 56);
    encoder_context->colorspace = AV_RL32(wire + 60); encoder_context->color_range = AV_RL32(wire + 64);
    encoder_context->chroma_sample_location = AV_RL32(wire + 68); encoder_context->get_encode_buffer = encoder_packet_buffer;
    int result = avcodec_open2(encoder_context, codec, NULL);
    if (result >= 0) result = avcodec_parameters_from_context(encoder_parameters, encoder_context);
    if (result >= 0) result = within_split_write_parameters(encoder_parameters, encoder_parameter_wire);
    if (result < 0) { within_split_encoder_close(); return result; }
    encoder_parameter_bytes = result; encoder_state = 1;
    return 0;
}

/* Initialization audit only; this reads actual context fields, not just config
 * bytes. Encoding/fidelity/browser memory remain separate required evidence. */
EMSCRIPTEN_KEEPALIVE int within_split_encoder_settings_match(void)
{
    const AVCodecContext *c = encoder_context;
    if (!c) return 0;
    const uint8_t *w = encoder_config;
    return c->width == AV_RL32(w + 4) && c->height == AV_RL32(w + 8) &&
        c->pix_fmt == (AV_RL32(w + 12) ? AV_PIX_FMT_YUV422P : AV_PIX_FMT_YUV420P) &&
        c->time_base.num == (int32_t)AV_RL32(w + 16) && c->time_base.den == (int32_t)AV_RL32(w + 20) &&
        c->framerate.num == (int32_t)AV_RL32(w + 24) && c->framerate.den == (int32_t)AV_RL32(w + 28) &&
        c->bit_rate == AV_RL32(w + 32) && c->qmin == AV_RL32(w + 36) && c->qmax == AV_RL32(w + 40) &&
        c->sample_aspect_ratio.num == (int32_t)AV_RL32(w + 44) && c->sample_aspect_ratio.den == (int32_t)AV_RL32(w + 48) &&
        c->color_primaries == AV_RL32(w + 52) && c->color_trc == AV_RL32(w + 56) && c->colorspace == AV_RL32(w + 60) &&
        c->color_range == AV_RL32(w + 64) && c->chroma_sample_location == AV_RL32(w + 68) &&
        c->gop_size == 48 && !c->max_b_frames && c->thread_count == 1 && c->slices == 1 &&
        c->strict_std_compliance == FF_COMPLIANCE_NORMAL &&
        c->flags == (AV_CODEC_FLAG_LOW_DELAY | AV_CODEC_FLAG_GLOBAL_HEADER | AV_CODEC_FLAG_BITEXACT);
}

/* Codec initialization audit, never a frame encode. Import into another native
 * owner and compare its actual fields with avcodec_parameters_from_context,
 * including extradata padding and each structured CPB field. */
EMSCRIPTEN_KEEPALIVE int within_split_encoder_parameters_check(void)
{
    if (!encoder_parameters || !encoder_parameter_bytes) return AVERROR(EINVAL);
    AVCodecParameters *copy = NULL;
    int result = within_split_read_parameters(&copy, encoder_parameter_wire, encoder_parameter_bytes);
    if (result < 0) return result;
    const AVCodecParameters *p = encoder_parameters;
#define PARAM_EQUAL(field) do { if (copy->field != p->field) result = AVERROR_INVALIDDATA; } while (0)
    PARAM_EQUAL(codec_type); PARAM_EQUAL(codec_id); PARAM_EQUAL(codec_tag); PARAM_EQUAL(format); PARAM_EQUAL(bit_rate);
    PARAM_EQUAL(bits_per_coded_sample); PARAM_EQUAL(bits_per_raw_sample); PARAM_EQUAL(profile); PARAM_EQUAL(level);
    PARAM_EQUAL(width); PARAM_EQUAL(height); PARAM_EQUAL(sample_aspect_ratio.num); PARAM_EQUAL(sample_aspect_ratio.den);
    PARAM_EQUAL(framerate.num); PARAM_EQUAL(framerate.den); PARAM_EQUAL(field_order); PARAM_EQUAL(color_range);
    PARAM_EQUAL(color_primaries); PARAM_EQUAL(color_trc); PARAM_EQUAL(color_space); PARAM_EQUAL(chroma_location);
    PARAM_EQUAL(video_delay); PARAM_EQUAL(alpha_mode); PARAM_EQUAL(extradata_size); PARAM_EQUAL(nb_coded_side_data);
#undef PARAM_EQUAL
    if (result >= 0 && copy->extradata_size > 0) {
        if (memcmp(copy->extradata, p->extradata, copy->extradata_size)) result = AVERROR_INVALIDDATA;
        for (unsigned i = 0; i < AV_INPUT_BUFFER_PADDING_SIZE; i++)
            if (copy->extradata[copy->extradata_size + i]) result = AVERROR_INVALIDDATA;
    }
    for (int i = 0; result >= 0 && i < p->nb_coded_side_data; i++) {
        const AVPacketSideData *a = &p->coded_side_data[i], *b = &copy->coded_side_data[i];
        if (a->type != b->type || a->size != b->size) { result = AVERROR_INVALIDDATA; break; }
        if (a->type == AV_PKT_DATA_CPB_PROPERTIES) {
            const AVCPBProperties *x = (const AVCPBProperties *)a->data, *y = (const AVCPBProperties *)b->data;
            if (x->max_bitrate != y->max_bitrate || x->min_bitrate != y->min_bitrate || x->avg_bitrate != y->avg_bitrate ||
                x->buffer_size != y->buffer_size || x->vbv_delay != y->vbv_delay) result = AVERROR_INVALIDDATA;
        } else if (memcmp(a->data, b->data, a->size)) result = AVERROR_INVALIDDATA;
    }
    avcodec_parameters_free(&copy);
    return result;
}

EMSCRIPTEN_KEEPALIVE int within_split_encoder_prepare(void)
{
    if (encoder_state != 1 || encoder_packet_held) return AVERROR(EBUSY);
    /* Reuse storage only when the codec has relinquished its references. If
     * not writable, drop only OUR old ref and allocate new caller-owned storage;
     * never copy old pixels or unref a codec-owned reference to save memory. */
    if (!encoder_input->buf[0] || !av_frame_is_writable(encoder_input)) {
        av_frame_unref(encoder_input); encoder_input->width = encoder_context->width; encoder_input->height = encoder_context->height;
        encoder_input->format = encoder_context->pix_fmt;
        int result = av_frame_get_buffer(encoder_input, 32);
        if (result < 0) return result;
    }
    int result = within_split_describe_frame(encoder_input, &encoder_layout, emscripten_get_heap_size());
    if (result < 0) return result;
    encoder_state = 2;
    return (int)(uintptr_t)&encoder_layout;
}

EMSCRIPTEN_KEEPALIVE int within_split_encoder_abort_frame(void)
{
    if (encoder_state != 2 || encoder_packet_held) return AVERROR(EBUSY);
    encoder_state = 1; return 0;
}

EMSCRIPTEN_KEEPALIVE int within_split_encoder_send(unsigned property_bytes)
{
    if (encoder_state != 2 || encoder_packet_held || encoder_frames == UINT32_MAX) return AVERROR(EBUSY);
    int result = within_split_read_properties(encoder_input, encoder_properties, property_bytes);
    if (result < 0) return result;
    result = avcodec_send_frame(encoder_context, encoder_input);
    if (result < 0) { encoder_state = 6; return result; }
    encoder_frames++; encoder_state = 3;
    return 0;
}

EMSCRIPTEN_KEEPALIVE int within_split_encoder_flush(void)
{
    if (encoder_state != 1 || encoder_packet_held) return AVERROR(EBUSY);
    int result = avcodec_send_frame(encoder_context, NULL);
    if (result < 0) { encoder_state = 6; return result; }
    encoder_state = 4; return 0;
}

EMSCRIPTEN_KEEPALIVE int within_split_encoder_next_packet(void)
{
    if (encoder_state == 5) return 2;
    if ((encoder_state != 3 && encoder_state != 4) || encoder_packet_held) return AVERROR(EBUSY);
    int result = avcodec_receive_packet(encoder_context, encoder_packet);
    if (result == AVERROR(EAGAIN)) {
        if (encoder_state == 4) { encoder_state = 6; return AVERROR_BUG; }
        encoder_state = 1; return 0;
    }
    if (result == AVERROR_EOF) { encoder_state = 5; return 2; }
    if (result < 0) { encoder_state = 6; return result; }
    const AVPacket *p = encoder_packet;
    const uint64_t heap_bytes = emscripten_get_heap_size();
    unsigned side_bytes = 0;
    if (p->size < 0 || p->size > 1048576 || p->opaque || p->opaque_ref || (p->flags & AV_PKT_FLAG_TRUSTED) ||
        (p->size && (!p->data || !p->buf || (uintptr_t)p->data < (uintptr_t)p->buf->data ||
        (uint64_t)(uintptr_t)p->data + p->size > (uint64_t)(uintptr_t)p->buf->data + p->buf->size)) ||
        (uint64_t)(uintptr_t)p->data + p->size > heap_bytes || p->side_data_elems < 0 || p->side_data_elems > 16 ||
        (p->side_data_elems && !p->side_data)) result = AVERROR(EFBIG);
    for (int i = 0; result >= 0 && i < p->side_data_elems; i++) {
        const AVPacketSideData *side = &p->side_data[i];
        if (side->size > 65536 - side_bytes || !side->data || !within_split_encoded_side(side->type, side->size) ||
            (uint64_t)(uintptr_t)side->data + side->size > heap_bytes) result = AVERROR(ENOSYS);
        else side_bytes += side->size;
    }
    if (result < 0 || encoder_packets == UINT32_MAX) {
        av_packet_unref(encoder_packet); encoder_state = 6; return result < 0 ? result : AVERROR(EFBIG);
    }
    memset(encoder_packet_record, 0, sizeof(encoder_packet_record));
    uint8_t *wire = encoder_packet_record;
    AV_WL32(wire, 1); AV_WL32(wire + 4, (uintptr_t)p->data); AV_WL32(wire + 8, p->size); AV_WL32(wire + 12, p->flags);
    AV_WL64(wire + 16, p->pts); AV_WL64(wire + 24, p->dts); AV_WL64(wire + 32, p->duration); AV_WL64(wire + 40, p->pos);
    AV_WL32(wire + 48, encoder_context->time_base.num); AV_WL32(wire + 52, encoder_context->time_base.den);
    AV_WL32(wire + 56, p->side_data_elems);
    for (int i = 0; i < p->side_data_elems; i++) {
        const AVPacketSideData *side = &p->side_data[i]; unsigned offset = 64 + i * 16;
        AV_WL32(wire + offset, side->type); AV_WL32(wire + offset + 4, (uintptr_t)side->data); AV_WL32(wire + offset + 8, side->size);
    }
    encoder_packets++; encoder_packet_held = 1;
    return 1;
}

EMSCRIPTEN_KEEPALIVE int within_split_encoder_packet_record(void)
{ return encoder_packet_held ? (int)(uintptr_t)encoder_packet_record : AVERROR(EINVAL); }

EMSCRIPTEN_KEEPALIVE int within_split_encoder_release_packet(void)
{
    if (!encoder_packet_held) return AVERROR(EINVAL);
    av_packet_unref(encoder_packet); encoder_packet_held = 0;
    memset(encoder_packet_record, 0, sizeof(encoder_packet_record));
    return 0;
}

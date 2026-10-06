#ifndef WITHIN_MPEG2_SPLIT_CODEC_PARAMETERS_H
#define WITHIN_MPEG2_SPLIT_CODEC_PARAMETERS_H
/* Pinned MPEG-2 video parameters, not an AVCodecParameters struct transfer.
 * Explicit LE scalars + bounded bytes. The mux-owner imports into a fresh native
 * object before replacing its own old object; failure leaves it untouched. */
#include <errno.h>
#include <stdint.h>
#include <string.h>
#include <libavcodec/avcodec.h>
#include <libavutil/intreadwrite.h>

#define WITHIN_SPLIT_PARAMETER_CAP 65536u
#define WITHIN_SPLIT_PARAMETER_HEADER 144u
#define WITHIN_SPLIT_PARAMETER_MAGIC 0x31504357u
#define WITHIN_SPLIT_PACKET_SIDE_LIMIT 16u
_Static_assert(AV_PKT_DATA_NEW_EXTRADATA == 1 && AV_PKT_DATA_QUALITY_STATS == 8 && AV_PKT_DATA_CPB_PROPERTIES == 10,
               "Pinned encoded side-data ABI changed");
_Static_assert(sizeof(AVCPBProperties) == 40, "CPB serializer requires the pinned five-field layout");

static int within_split_encoded_side(unsigned type, unsigned size)
{
    switch (type) {
    case AV_PKT_DATA_CPB_PROPERTIES: return size == sizeof(AVCPBProperties) && size == 40;
    case AV_PKT_DATA_NEW_EXTRADATA: return size > 0;
    case AV_PKT_DATA_QUALITY_STATS: return size >= 8;
    default: return 0;
    }
}

static int within_split_parameter_tail(const uint8_t *wire, unsigned bytes, AVCodecParameters *out)
{
    unsigned offset = WITHIN_SPLIT_PARAMETER_HEADER, extra = AV_RL32(wire + 104), sides = AV_RL32(wire + 108);
    if (extra > bytes - offset || sides > WITHIN_SPLIT_PACKET_SIDE_LIMIT) return AVERROR_INVALIDDATA;
    if (out && extra) {
        out->extradata = av_mallocz(extra + AV_INPUT_BUFFER_PADDING_SIZE);
        if (!out->extradata) return AVERROR(ENOMEM);
        memcpy(out->extradata, wire + offset, extra); out->extradata_size = extra;
    }
    offset += extra;
    for (unsigned i = 0; i < sides; i++) {
        if (bytes - offset < 8) return AVERROR_INVALIDDATA;
        unsigned type = AV_RL32(wire + offset), size = AV_RL32(wire + offset + 4); offset += 8;
        if (size > bytes - offset || !within_split_encoded_side(type, size)) return AVERROR(ENOSYS);
        if (out) {
            AVPacketSideData *side = av_packet_side_data_new(&out->coded_side_data, &out->nb_coded_side_data, type, size, 0);
            if (!side) return AVERROR(ENOMEM);
            if (type == AV_PKT_DATA_CPB_PROPERTIES) {
                AVCPBProperties *cpb = (AVCPBProperties *)side->data;
                cpb->max_bitrate = (int64_t)AV_RL64(wire + offset);
                cpb->min_bitrate = (int64_t)AV_RL64(wire + offset + 8);
                cpb->avg_bitrate = (int64_t)AV_RL64(wire + offset + 16);
                cpb->buffer_size = (int64_t)AV_RL64(wire + offset + 24);
                cpb->vbv_delay = AV_RL64(wire + offset + 32);
            } else memcpy(side->data, wire + offset, size);
        }
        offset += size;
    }
    return offset == bytes ? 0 : AVERROR_INVALIDDATA;
}

static int within_split_write_parameters(const AVCodecParameters *p, uint8_t *wire)
{
    if (!p || !wire || p->codec_type != AVMEDIA_TYPE_VIDEO || p->codec_id != AV_CODEC_ID_MPEG2VIDEO ||
        (p->format != AV_PIX_FMT_YUV420P && p->format != AV_PIX_FMT_YUV422P) ||
        p->width < 2 || p->width > 4096 || (p->width & 1) || p->height < 2 || p->height > 2160 || (p->height & 1) ||
        p->extradata_size < 0 || p->extradata_size > WITHIN_SPLIT_PARAMETER_CAP - WITHIN_SPLIT_PARAMETER_HEADER ||
        (p->extradata_size && !p->extradata) || p->nb_coded_side_data < 0 || p->nb_coded_side_data > WITHIN_SPLIT_PACKET_SIDE_LIMIT ||
        (p->nb_coded_side_data && !p->coded_side_data) || p->ch_layout.nb_channels || p->sample_rate || p->block_align ||
        p->frame_size || p->initial_padding || p->trailing_padding || p->seek_preroll) return AVERROR(ENOSYS);
    unsigned bytes = WITHIN_SPLIT_PARAMETER_HEADER + p->extradata_size;
    for (int i = 0; i < p->nb_coded_side_data; i++) {
        const AVPacketSideData *side = &p->coded_side_data[i];
        if (side->size > WITHIN_SPLIT_PARAMETER_CAP || !side->data || !within_split_encoded_side(side->type, side->size) ||
            WITHIN_SPLIT_PARAMETER_CAP - bytes < 8 || side->size > WITHIN_SPLIT_PARAMETER_CAP - bytes - 8)
            return AVERROR(EFBIG);
        bytes += 8 + side->size;
    }
    memset(wire, 0, WITHIN_SPLIT_PARAMETER_HEADER);
    AV_WL32(wire, WITHIN_SPLIT_PARAMETER_MAGIC); AV_WL32(wire + 4, 1); AV_WL32(wire + 8, bytes);
    AV_WL32(wire + 12, 1); AV_WL32(wire + 16, p->width); AV_WL32(wire + 20, p->height);
    AV_WL32(wire + 24, p->format == AV_PIX_FMT_YUV422P); AV_WL32(wire + 28, p->codec_tag);
    AV_WL64(wire + 32, p->bit_rate); AV_WL32(wire + 40, p->bits_per_coded_sample); AV_WL32(wire + 44, p->bits_per_raw_sample);
    AV_WL32(wire + 48, p->profile); AV_WL32(wire + 52, p->level);
    AV_WL32(wire + 56, p->sample_aspect_ratio.num); AV_WL32(wire + 60, p->sample_aspect_ratio.den);
    AV_WL32(wire + 64, p->framerate.num); AV_WL32(wire + 68, p->framerate.den); AV_WL32(wire + 72, p->field_order);
    AV_WL32(wire + 76, p->color_range); AV_WL32(wire + 80, p->color_primaries); AV_WL32(wire + 84, p->color_trc);
    AV_WL32(wire + 88, p->color_space); AV_WL32(wire + 92, p->chroma_location); AV_WL32(wire + 96, p->video_delay);
    AV_WL32(wire + 100, p->alpha_mode); AV_WL32(wire + 104, p->extradata_size); AV_WL32(wire + 108, p->nb_coded_side_data);
    unsigned offset = WITHIN_SPLIT_PARAMETER_HEADER;
    if (p->extradata_size) memcpy(wire + offset, p->extradata, p->extradata_size);
    offset += p->extradata_size;
    for (int i = 0; i < p->nb_coded_side_data; i++) {
        const AVPacketSideData *side = &p->coded_side_data[i];
        AV_WL32(wire + offset, side->type); AV_WL32(wire + offset + 4, side->size); offset += 8;
        if (side->type == AV_PKT_DATA_CPB_PROPERTIES) {
            const AVCPBProperties *cpb = (const AVCPBProperties *)side->data;
            AV_WL64(wire + offset, cpb->max_bitrate); AV_WL64(wire + offset + 8, cpb->min_bitrate);
            AV_WL64(wire + offset + 16, cpb->avg_bitrate); AV_WL64(wire + offset + 24, cpb->buffer_size);
            AV_WL64(wire + offset + 32, cpb->vbv_delay);
        } else memcpy(wire + offset, side->data, side->size);
        offset += side->size;
    }
    return bytes;
}

static int within_split_read_parameters(AVCodecParameters **destination, const uint8_t *wire, unsigned bytes)
{
    if (!destination || !wire || bytes < WITHIN_SPLIT_PARAMETER_HEADER || bytes > WITHIN_SPLIT_PARAMETER_CAP ||
        AV_RL32(wire) != WITHIN_SPLIT_PARAMETER_MAGIC || AV_RL32(wire + 4) != 1 || AV_RL32(wire + 8) != bytes ||
        AV_RL32(wire + 12) != 1 || AV_RL32(wire + 24) > 1 || AV_RL32(wire + 16) < 2 || AV_RL32(wire + 16) > 4096 ||
        (AV_RL32(wire + 16) & 1) || AV_RL32(wire + 20) < 2 || AV_RL32(wire + 20) > 2160 || (AV_RL32(wire + 20) & 1)) return AVERROR_INVALIDDATA;
    for (unsigned at = 112; at < WITHIN_SPLIT_PARAMETER_HEADER; at += 4) if (AV_RL32(wire + at)) return AVERROR_INVALIDDATA;
    int result = within_split_parameter_tail(wire, bytes, NULL);
    if (result < 0) return result;
    AVCodecParameters *p = avcodec_parameters_alloc();
    if (!p) return AVERROR(ENOMEM);
    p->codec_type = AVMEDIA_TYPE_VIDEO; p->codec_id = AV_CODEC_ID_MPEG2VIDEO;
    p->width = AV_RL32(wire + 16); p->height = AV_RL32(wire + 20);
    p->format = AV_RL32(wire + 24) ? AV_PIX_FMT_YUV422P : AV_PIX_FMT_YUV420P; p->codec_tag = AV_RL32(wire + 28);
    p->bit_rate = (int64_t)AV_RL64(wire + 32); p->bits_per_coded_sample = (int32_t)AV_RL32(wire + 40);
    p->bits_per_raw_sample = (int32_t)AV_RL32(wire + 44); p->profile = (int32_t)AV_RL32(wire + 48); p->level = (int32_t)AV_RL32(wire + 52);
    p->sample_aspect_ratio = (AVRational){ (int32_t)AV_RL32(wire + 56), (int32_t)AV_RL32(wire + 60) };
    p->framerate = (AVRational){ (int32_t)AV_RL32(wire + 64), (int32_t)AV_RL32(wire + 68) }; p->field_order = AV_RL32(wire + 72);
    p->color_range = AV_RL32(wire + 76); p->color_primaries = AV_RL32(wire + 80); p->color_trc = AV_RL32(wire + 84);
    p->color_space = AV_RL32(wire + 88); p->chroma_location = AV_RL32(wire + 92); p->video_delay = (int32_t)AV_RL32(wire + 96);
    p->alpha_mode = AV_RL32(wire + 100);
    result = within_split_parameter_tail(wire, bytes, p);
    if (result < 0) { avcodec_parameters_free(&p); return result; }
    avcodec_parameters_free(destination); *destination = p;
    return 0;
}
#endif

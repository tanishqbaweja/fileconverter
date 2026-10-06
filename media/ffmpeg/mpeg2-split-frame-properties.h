#ifndef WITHIN_MPEG2_SPLIT_FRAME_PROPERTIES_H
#define WITHIN_MPEG2_SPLIT_FRAME_PROPERTIES_H
/* Private, pinned FFmpeg 8.1.2 video-property wire format. Never transfer an
 * AVFrame, pointer, AVBufferRef or decoder-private object between Wasm heaps.
 * Caller owns one 64 KiB slot per heap and retains its frame until consumption.
 * This transports properties, not pixels, codec settings or encoded packets.
 * Only documented byte-array side-data payloads are accepted so far. Unknown
 * or structured payloads fail explicitly; no silent metadata loss. */
#include <errno.h>
#include <stdint.h>
#include <string.h>
#include "libavutil/dict.h"
#include "libavutil/error.h"
#include "libavutil/frame.h"
#include "libavutil/intreadwrite.h"
#include "libavutil/pixfmt.h"

#define WITHIN_SPLIT_PROPS_CAPACITY 65536u
#define WITHIN_SPLIT_PROPS_HEADER 160u
#define WITHIN_SPLIT_PROPS_MAGIC 0x31504657u
#define WITHIN_SPLIT_PROPS_DICT_LIMIT 64u
#define WITHIN_SPLIT_PROPS_SIDE_LIMIT 16u

static unsigned within_props_string_bytes(const char *text, unsigned limit)
{
    if (!text) return 0;
    for (unsigned i = 0; i < limit; i++) if (!text[i]) return i + 1;
    return 0;
}

static int within_props_room(unsigned *offset, unsigned bytes)
{
    if (*offset > WITHIN_SPLIT_PROPS_CAPACITY || bytes > WITHIN_SPLIT_PROPS_CAPACITY - *offset)
        return AVERROR(EFBIG);
    *offset += bytes;
    return 0;
}

/* Raw bytes, not structs whose payload could include heap-specific pointers.
 * ICC/EXIF transport here is not an endorsement of container preservation. */
static int within_props_byte_side(unsigned type, unsigned bytes)
{
    switch (type) {
    case AV_FRAME_DATA_A53_CC: return bytes > 0;
    case AV_FRAME_DATA_SEI_UNREGISTERED: return bytes >= 16;
    case AV_FRAME_DATA_ICC_PROFILE: return bytes > 0;
    case AV_FRAME_DATA_EXIF: return bytes > 0;
    default: return 0;
    }
}

/* Preflight the complete dictionary before writing any property record. */
static int within_props_dict_size(const AVDictionary *dict, unsigned *offset, unsigned *count)
{
    const AVDictionaryEntry *entry = NULL;
    *count = 0;
    while ((entry = av_dict_get(dict, "", entry, AV_DICT_IGNORE_SUFFIX))) {
        unsigned key = within_props_string_bytes(entry->key, 1025);
        unsigned value = within_props_string_bytes(entry->value, 8193);
        if (!key || key < 2 || !value) return AVERROR(EFBIG);
        if (++*count > WITHIN_SPLIT_PROPS_DICT_LIMIT) return AVERROR(EFBIG);
        int result = within_props_room(offset, 8 + key + value);
        if (result < 0) return result;
    }
    return 0;
}

static void within_props_dict_write(uint8_t *wire, unsigned *offset, const AVDictionary *dict)
{
    const AVDictionaryEntry *entry = NULL;
    while ((entry = av_dict_get(dict, "", entry, AV_DICT_IGNORE_SUFFIX))) {
        unsigned key = within_props_string_bytes(entry->key, 1025);
        unsigned value = within_props_string_bytes(entry->value, 8193);
        AV_WL32(wire + *offset, key); AV_WL32(wire + *offset + 4, value); *offset += 8;
        memcpy(wire + *offset, entry->key, key); *offset += key;
        memcpy(wire + *offset, entry->value, value); *offset += value;
    }
}

static int within_props_video(const AVFrame *frame)
{
    if (!frame || frame->width < 2 || frame->width > 4096 || (frame->width & 1) ||
        frame->height < 2 || frame->height > 2160 || (frame->height & 1)) return AVERROR(EINVAL);
    if ((frame->format != AV_PIX_FMT_YUV420P && frame->format != AV_PIX_FMT_YUV422P) ||
        frame->nb_samples || frame->sample_rate || frame->ch_layout.nb_channels ||
        frame->hw_frames_ctx || frame->opaque || frame->opaque_ref ||
        frame->crop_top || frame->crop_bottom || frame->crop_left || frame->crop_right)
        return AVERROR(ENOSYS);
    /* private_ref belongs to libavcodec. Outside code must NEVER inspect it. */
    return 0;
}

static int within_split_write_properties(const AVFrame *frame, uint8_t *wire, unsigned *bytes)
{
    unsigned size = WITHIN_SPLIT_PROPS_HEADER, dict_count, unused;
    int result = within_props_video(frame);
    if (result < 0 || !wire || !bytes) return result < 0 ? result : AVERROR(EINVAL);
    if (frame->nb_side_data < 0 || frame->nb_side_data > WITHIN_SPLIT_PROPS_SIDE_LIMIT ||
        (frame->nb_side_data && !frame->side_data)) return AVERROR(EFBIG);
    result = within_props_dict_size(frame->metadata, &size, &dict_count);
    if (result < 0) return result;
    for (int i = 0; i < frame->nb_side_data; i++) {
        const AVFrameSideData *side = frame->side_data[i];
        if (!side || side->size > WITHIN_SPLIT_PROPS_CAPACITY ||
            !within_props_byte_side(side->type, (unsigned)side->size)) return AVERROR(ENOSYS);
        if (!side->data || !side->buf || !side->buf->data ||
            (uintptr_t)side->data < (uintptr_t)side->buf->data ||
            (uint64_t)(uintptr_t)side->data + side->size > (uint64_t)(uintptr_t)side->buf->data + side->buf->size)
            return AVERROR_INVALIDDATA;
        result = within_props_room(&size, 16 + (unsigned)side->size);
        if (result < 0) return result;
        result = within_props_dict_size(side->metadata, &size, &unused);
        if (result < 0) return result;
    }
    /* All validation finished. The caller slot is independent of frame storage. */
    memset(wire, 0, WITHIN_SPLIT_PROPS_HEADER);
    AV_WL32(wire, WITHIN_SPLIT_PROPS_MAGIC); AV_WL32(wire + 4, 1); AV_WL32(wire + 8, size);
    AV_WL32(wire + 12, frame->width); AV_WL32(wire + 16, frame->height);
    AV_WL32(wire + 20, frame->format == AV_PIX_FMT_YUV422P);
    AV_WL32(wire + 24, frame->pict_type);
    AV_WL32(wire + 28, frame->sample_aspect_ratio.num); AV_WL32(wire + 32, frame->sample_aspect_ratio.den);
    AV_WL32(wire + 36, frame->time_base.num); AV_WL32(wire + 40, frame->time_base.den);
    AV_WL32(wire + 44, frame->quality); AV_WL32(wire + 48, frame->repeat_pict);
    AV_WL32(wire + 52, frame->flags); AV_WL32(wire + 56, frame->decode_error_flags);
    AV_WL32(wire + 60, frame->color_range); AV_WL32(wire + 64, frame->color_primaries);
    AV_WL32(wire + 68, frame->color_trc); AV_WL32(wire + 72, frame->colorspace);
    AV_WL32(wire + 76, frame->chroma_location); AV_WL32(wire + 80, frame->alpha_mode);
    AV_WL64(wire + 88, frame->pts); AV_WL64(wire + 96, frame->pkt_dts);
    AV_WL64(wire + 104, frame->best_effort_timestamp); AV_WL64(wire + 112, frame->duration);
    AV_WL32(wire + 136, dict_count); AV_WL32(wire + 140, frame->nb_side_data);
    unsigned offset = WITHIN_SPLIT_PROPS_HEADER;
    within_props_dict_write(wire, &offset, frame->metadata);
    for (int i = 0; i < frame->nb_side_data; i++) {
        const AVFrameSideData *side = frame->side_data[i]; unsigned dict_size = 0, count;
        within_props_dict_size(side->metadata, &dict_size, &count);
        AV_WL32(wire + offset, side->type); AV_WL32(wire + offset + 4, side->size);
        AV_WL32(wire + offset + 8, count); AV_WL32(wire + offset + 12, 0); offset += 16;
        memcpy(wire + offset, side->data, side->size); offset += side->size;
        within_props_dict_write(wire, &offset, side->metadata);
    }
    *bytes = size;
    return 0;
}

static int within_props_take(unsigned *offset, unsigned bytes, unsigned end)
{
    if (*offset > end || bytes > end - *offset) return AVERROR_INVALIDDATA;
    *offset += bytes;
    return 0;
}

/* Both passes use the same bounded parser. NULL output means validate only;
 * allocations are made exclusively in a fresh temporary frame on pass two. */
static int within_props_dict_read(const uint8_t *wire, unsigned end, unsigned *offset,
                                  unsigned count, AVDictionary **output)
{
    if (count > WITHIN_SPLIT_PROPS_DICT_LIMIT) return AVERROR_INVALIDDATA;
    for (unsigned i = 0; i < count; i++) {
        unsigned at = *offset;
        if (within_props_take(offset, 8, end) < 0) return AVERROR_INVALIDDATA;
        unsigned key = AV_RL32(wire + at), value = AV_RL32(wire + at + 4);
        if (key < 2 || key > 1025 || !value || value > 8193) return AVERROR_INVALIDDATA;
        unsigned key_at = *offset;
        if (within_props_take(offset, key, end) < 0) return AVERROR_INVALIDDATA;
        unsigned value_at = *offset;
        if (within_props_take(offset, value, end) < 0) return AVERROR_INVALIDDATA;
        if (wire[key_at + key - 1] || wire[value_at + value - 1] ||
            memchr(wire + key_at, 0, key - 1) || memchr(wire + value_at, 0, value - 1)) return AVERROR_INVALIDDATA;
        if (output) {
            int result = av_dict_set(output, (const char *)wire + key_at,
                (const char *)wire + value_at, AV_DICT_MATCH_CASE | AV_DICT_MULTIKEY);
            if (result < 0) return result;
        }
    }
    return 0;
}

static int within_props_tail_read(const uint8_t *wire, unsigned bytes, AVFrame *output)
{
    unsigned offset = WITHIN_SPLIT_PROPS_HEADER, sides = AV_RL32(wire + 140);
    if (sides > WITHIN_SPLIT_PROPS_SIDE_LIMIT) return AVERROR_INVALIDDATA;
    int result = within_props_dict_read(wire, bytes, &offset, AV_RL32(wire + 136), output ? &output->metadata : NULL);
    if (result < 0) return result;
    for (unsigned i = 0; i < sides; i++) {
        unsigned at = offset;
        if (within_props_take(&offset, 16, bytes) < 0) return AVERROR_INVALIDDATA;
        unsigned type = AV_RL32(wire + at), size = AV_RL32(wire + at + 4), count = AV_RL32(wire + at + 8);
        if (AV_RL32(wire + at + 12) || !within_props_byte_side(type, size)) return AVERROR(ENOSYS);
        unsigned data_at = offset;
        if (within_props_take(&offset, size, bytes) < 0) return AVERROR_INVALIDDATA;
        AVFrameSideData *side = NULL;
        if (output) {
            side = av_frame_new_side_data(output, type, size);
            if (!side) return AVERROR(ENOMEM);
            memcpy(side->data, wire + data_at, size);
        }
        result = within_props_dict_read(wire, bytes, &offset, count, side ? &side->metadata : NULL);
        if (result < 0) return result;
    }
    return offset == bytes ? 0 : AVERROR_INVALIDDATA;
}

static void within_props_scalars_read(AVFrame *frame, const uint8_t *wire)
{
    frame->pict_type = (int32_t)AV_RL32(wire + 24);
    frame->sample_aspect_ratio = (AVRational){ (int32_t)AV_RL32(wire + 28), (int32_t)AV_RL32(wire + 32) };
    frame->time_base = (AVRational){ (int32_t)AV_RL32(wire + 36), (int32_t)AV_RL32(wire + 40) };
    frame->quality = (int32_t)AV_RL32(wire + 44); frame->repeat_pict = (int32_t)AV_RL32(wire + 48);
    frame->flags = (int32_t)AV_RL32(wire + 52); frame->decode_error_flags = (int32_t)AV_RL32(wire + 56);
    frame->color_range = (int32_t)AV_RL32(wire + 60); frame->color_primaries = (int32_t)AV_RL32(wire + 64);
    frame->color_trc = (int32_t)AV_RL32(wire + 68); frame->colorspace = (int32_t)AV_RL32(wire + 72);
    frame->chroma_location = (int32_t)AV_RL32(wire + 76); frame->alpha_mode = (int32_t)AV_RL32(wire + 80);
    frame->pts = (int64_t)AV_RL64(wire + 88); frame->pkt_dts = (int64_t)AV_RL64(wire + 96);
    frame->best_effort_timestamp = (int64_t)AV_RL64(wire + 104); frame->duration = (int64_t)AV_RL64(wire + 112);
}

static int within_split_read_properties(AVFrame *destination, const uint8_t *wire, unsigned bytes)
{
    int result = within_props_video(destination);
    if (result < 0 || !wire || bytes < WITHIN_SPLIT_PROPS_HEADER || bytes > WITHIN_SPLIT_PROPS_CAPACITY)
        return result < 0 ? result : AVERROR_INVALIDDATA;
    if (AV_RL32(wire) != WITHIN_SPLIT_PROPS_MAGIC || AV_RL32(wire + 4) != 1 || AV_RL32(wire + 8) != bytes ||
        AV_RL32(wire + 12) != destination->width || AV_RL32(wire + 16) != destination->height ||
        AV_RL32(wire + 20) != (unsigned)(destination->format == AV_PIX_FMT_YUV422P)) return AVERROR_INVALIDDATA;
    for (unsigned at = 120; at < 136; at += 4) if (AV_RL32(wire + at)) return AVERROR(ENOSYS);
    if (AV_RL32(wire + 84)) return AVERROR_INVALIDDATA;
    for (unsigned at = 144; at < WITHIN_SPLIT_PROPS_HEADER; at += 4) if (AV_RL32(wire + at)) return AVERROR_INVALIDDATA;
    result = within_props_tail_read(wire, bytes, NULL);
    if (result < 0) return result;
    AVFrame *temporary = av_frame_alloc();
    if (!temporary) return AVERROR(ENOMEM);
    result = within_props_tail_read(wire, bytes, temporary);
    if (result >= 0) {
        /* Transactional replacement: all fallible work completed, no pixels or
         * decoder/encoder buffer references changed, no extra pixel allocation. */
        av_frame_side_data_free(&destination->side_data, &destination->nb_side_data);
        av_dict_free(&destination->metadata);
        within_props_scalars_read(destination, wire);
        destination->metadata = temporary->metadata; temporary->metadata = NULL;
        destination->side_data = temporary->side_data; temporary->side_data = NULL;
        destination->nb_side_data = temporary->nb_side_data; temporary->nb_side_data = 0;
    }
    av_frame_free(&temporary);
    return result;
}
#endif

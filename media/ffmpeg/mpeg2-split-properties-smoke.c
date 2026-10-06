/* Synthetic property ownership test, not a codec or media converter. */
#include <stdio.h>
#include "mpeg2-split-frame-smoke.c"
#include "mpeg2-split-frame-properties.h"

static uint8_t property_wire[WITHIN_SPLIT_PROPS_CAPACITY];

EMSCRIPTEN_KEEPALIVE
int within_props_smoke_slot(void) { return (int)(uintptr_t)property_wire; }

EMSCRIPTEN_KEEPALIVE
int within_props_smoke_export(void)
{
    unsigned bytes = 0;
    int result = within_split_write_properties(synthetic_frame, property_wire, &bytes);
    return result < 0 ? result : (int)bytes;
}

EMSCRIPTEN_KEEPALIVE
int within_props_smoke_import(unsigned bytes)
{
    return within_split_read_properties(synthetic_frame, property_wire, bytes);
}

EMSCRIPTEN_KEEPALIVE
int within_props_smoke_seed(int seed)
{
    if (!synthetic_frame || seed < 0 || seed > 255) return AVERROR(EINVAL);
    av_dict_free(&synthetic_frame->metadata);
    av_frame_side_data_free(&synthetic_frame->side_data, &synthetic_frame->nb_side_data);
    synthetic_frame->pict_type = AV_PICTURE_TYPE_B;
    synthetic_frame->sample_aspect_ratio = (AVRational){ 1001 + seed, 1000 };
    synthetic_frame->time_base = (AVRational){ 1, 90000 + seed };
    synthetic_frame->quality = 118; synthetic_frame->repeat_pict = 2;
    synthetic_frame->flags = AV_FRAME_FLAG_KEY | AV_FRAME_FLAG_INTERLACED | AV_FRAME_FLAG_TOP_FIELD_FIRST;
    synthetic_frame->decode_error_flags = FF_DECODE_ERROR_CONCEALMENT_ACTIVE;
    synthetic_frame->color_range = AVCOL_RANGE_MPEG;
    synthetic_frame->color_primaries = AVCOL_PRI_BT709;
    synthetic_frame->color_trc = AVCOL_TRC_BT709;
    synthetic_frame->colorspace = AVCOL_SPC_BT709;
    synthetic_frame->chroma_location = AVCHROMA_LOC_LEFT;
    synthetic_frame->alpha_mode = 0;
    synthetic_frame->pts = INT64_C(1152921504606846985) + seed;
    synthetic_frame->pkt_dts = INT64_MIN;
    synthetic_frame->best_effort_timestamp = -INT64_C(1152921504606846985) - seed;
    synthetic_frame->duration = INT64_C(9223372036854775807) - seed;
    int result = av_dict_set(&synthetic_frame->metadata, "Title", "Unicode: \xe2\x98\x83 \xe6\x97\xa5\xe6\x9c\xac", AV_DICT_MATCH_CASE);
    if (result < 0) return result;
    result = av_dict_set(&synthetic_frame->metadata, "title", "different case", AV_DICT_MATCH_CASE);
    if (result < 0) return result;
    result = av_dict_set(&synthetic_frame->metadata, "empty", "", 0);
    if (result < 0) return result;
    result = av_dict_set(&synthetic_frame->metadata, "duplicate", "first", AV_DICT_MULTIKEY);
    if (result < 0) return result;
    result = av_dict_set(&synthetic_frame->metadata, "duplicate", "second", AV_DICT_MULTIKEY);
    if (result < 0) return result;
    const enum AVFrameSideDataType types[] = { AV_FRAME_DATA_A53_CC, AV_FRAME_DATA_SEI_UNREGISTERED,
        AV_FRAME_DATA_ICC_PROFILE, AV_FRAME_DATA_EXIF };
    for (unsigned i = 0; i < 4; i++) {
        AVFrameSideData *side = av_frame_new_side_data(synthetic_frame, types[i], 33 + i);
        if (!side) return AVERROR(ENOMEM);
        for (unsigned j = 0; j < side->size; j++) side->data[j] = (seed + i * 17 + j) & 255;
        result = av_dict_set(&side->metadata, "side-note", "private test bytes", 0);
        if (result < 0) return result;
    }
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int within_props_smoke_check(int seed)
{
    if (!synthetic_frame || seed < 0 || seed > 255) return 0;
    if (synthetic_frame->pict_type != AV_PICTURE_TYPE_B ||
        synthetic_frame->sample_aspect_ratio.num != 1001 + seed || synthetic_frame->sample_aspect_ratio.den != 1000 ||
        synthetic_frame->time_base.num != 1 || synthetic_frame->time_base.den != 90000 + seed ||
        synthetic_frame->quality != 118 || synthetic_frame->repeat_pict != 2 ||
        synthetic_frame->flags != (AV_FRAME_FLAG_KEY | AV_FRAME_FLAG_INTERLACED | AV_FRAME_FLAG_TOP_FIELD_FIRST) ||
        synthetic_frame->decode_error_flags != FF_DECODE_ERROR_CONCEALMENT_ACTIVE ||
        synthetic_frame->color_range != AVCOL_RANGE_MPEG || synthetic_frame->color_primaries != AVCOL_PRI_BT709 ||
        synthetic_frame->color_trc != AVCOL_TRC_BT709 || synthetic_frame->colorspace != AVCOL_SPC_BT709 ||
        synthetic_frame->chroma_location != AVCHROMA_LOC_LEFT || synthetic_frame->alpha_mode != 0 ||
        synthetic_frame->pts != INT64_C(1152921504606846985) + seed || synthetic_frame->pkt_dts != INT64_MIN ||
        synthetic_frame->best_effort_timestamp != -INT64_C(1152921504606846985) - seed ||
        synthetic_frame->duration != INT64_C(9223372036854775807) - seed ||
        av_dict_count(synthetic_frame->metadata) != 5 || synthetic_frame->nb_side_data != 4) return 0;
    const char *keys[] = { "Title", "title", "empty", "duplicate", "duplicate" };
    const char *values[] = { "Unicode: \xe2\x98\x83 \xe6\x97\xa5\xe6\x9c\xac", "different case", "", "first", "second" };
    const AVDictionaryEntry *entry = NULL;
    for (unsigned i = 0; i < 5; i++) {
        entry = av_dict_get(synthetic_frame->metadata, "", entry, AV_DICT_IGNORE_SUFFIX);
        if (!entry || strcmp(entry->key, keys[i]) || strcmp(entry->value, values[i])) return 0;
    }
    const enum AVFrameSideDataType types[] = { AV_FRAME_DATA_A53_CC, AV_FRAME_DATA_SEI_UNREGISTERED,
        AV_FRAME_DATA_ICC_PROFILE, AV_FRAME_DATA_EXIF };
    for (unsigned i = 0; i < 4; i++) {
        const AVFrameSideData *side = synthetic_frame->side_data[i];
        if (!side || side->type != types[i] || side->size != 33 + i || av_dict_count(side->metadata) != 1) return 0;
        for (unsigned j = 0; j < side->size; j++) if (side->data[j] != ((seed + i * 17 + j) & 255)) return 0;
        entry = av_dict_get(side->metadata, "side-note", NULL, 0);
        if (!entry || strcmp(entry->value, "private test bytes")) return 0;
    }
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int within_props_smoke_empty(void)
{
    if (!synthetic_frame) return AVERROR(EINVAL);
    av_dict_free(&synthetic_frame->metadata);
    av_frame_side_data_free(&synthetic_frame->side_data, &synthetic_frame->nb_side_data);
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int within_props_smoke_reject(int mode)
{
    int result;
    unsigned bytes = 0;
    if (!synthetic_frame || mode < 1 || mode > 7) return AVERROR(EINVAL);
    if (mode == 1 || mode == 2) {
        AVFrameSideData *side = av_frame_new_side_data(synthetic_frame,
            mode == 1 ? AV_FRAME_DATA_MASTERING_DISPLAY_METADATA : AV_FRAME_DATA_A53_CC,
            mode == 1 ? 32 : WITHIN_SPLIT_PROPS_CAPACITY);
        if (!side) return AVERROR(ENOMEM);
    } else if (mode == 3) {
        for (unsigned i = 0; i < 65; i++) {
            char key[32]; snprintf(key, sizeof(key), "extra-%u", i);
            result = av_dict_set(&synthetic_frame->metadata, key, "bounded", 0);
            if (result < 0) return result;
        }
    } else if (mode == 4) {
        char value[8194]; memset(value, 'x', sizeof(value) - 1); value[sizeof(value) - 1] = 0;
        result = av_dict_set(&synthetic_frame->metadata, "oversized", value, 0);
        if (result < 0) return result;
    } else if (mode == 5) synthetic_frame->opaque = property_wire;
    else if (mode == 6) synthetic_frame->crop_bottom = 2;
    else if (mode == 7) synthetic_frame->sample_rate = 48000;
    result = within_split_write_properties(synthetic_frame, property_wire, &bytes);
    synthetic_frame->opaque = NULL; synthetic_frame->crop_bottom = 0; synthetic_frame->sample_rate = 0;
    return result;
}

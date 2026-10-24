/* Real installed libavutil API ownership probe; NO media conversion. */
#include <stdio.h>
#include <string.h>
#include "libavutil/avutil.h"
#include "libavutil/buffer.h"
#include "libavutil/frame.h"
/* Keep the pinned production header byte-identical. Its existing signedness
 * warnings are not errors in its actual build; suppress ONLY those warnings
 * around that include, retaining -Werror for this probe and the new helper. */
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wsign-compare"
#include "../../media/ffmpeg/mpeg2-split-frame-properties.h"
#pragma clang diagnostic pop
#include "../../media/ffmpeg/mpeg2-scaled-frame-properties.h"
#define REQUIRE(expression) do { if (!(expression)) { fprintf(stderr, "native check failed at%d: %s\n", __LINE__, #expression); goto fail; } } while (0)
int main(void)
{
    AVFrame *source = av_frame_alloc(), *old = av_frame_alloc(), *fixed = av_frame_alloc();
    uint8_t wire[WITHIN_SPLIT_PROPS_CAPACITY]; unsigned bytes = 0;
    int old_result = 0, maximum_side_data = 0;
    REQUIRE(source && old && fixed);
    AVFrame *frames[] = {source, old, fixed};
    for (unsigned i = 0; i < 3; i++) {
        frames[i]->width = 4; frames[i]->height = 4; frames[i]->format = AV_PIX_FMT_YUV420P;
        REQUIRE(av_frame_get_buffer(frames[i], 32) == 0);
        memset(frames[i]->buf[0]->data, 0x5a, frames[i]->buf[0]->size);
    }
    source->pict_type = AV_PICTURE_TYPE_B;
    AVFrameSideData *side = av_frame_new_side_data(source, AV_FRAME_DATA_SEI_UNREGISTERED, 32);
    REQUIRE(side); memset(side->data, 0x37, side->size);
    for (int frame = 0; frame < 17; frame++) REQUIRE(av_frame_copy_props(old, source) == 0);
    REQUIRE(old->nb_side_data == 17);
    old_result = within_split_write_properties(old, wire, &bytes); REQUIRE(old_result == AVERROR(EFBIG));
    AVBufferRef *pixel_reference = fixed->buf[0]; uint8_t *pixels = fixed->data[0];
    REQUIRE(av_dict_set(&source->metadata, "first-frame-only", "not a later-frame property", 0) == 0);
    for (int frame = 0; frame < 1000; frame++) {
        if (frame == 1) av_dict_free(&source->metadata);
        REQUIRE(within_mpeg2_replace_scaled_properties(fixed, source) == 0);
        REQUIRE(fixed->nb_side_data == 1 && fixed->side_data[0]->size == 32);
        REQUIRE(!memcmp(fixed->side_data[0]->data, source->side_data[0]->data, 32));
        REQUIRE(fixed->side_data[0]->data != source->side_data[0]->data);
        REQUIRE(fixed->pict_type == source->pict_type); /* Not a B-frame-policy patch. */
        REQUIRE(within_split_write_properties(fixed, wire, &bytes) == 0);
        REQUIRE(fixed->buf[0] == pixel_reference && fixed->data[0] == pixels && av_buffer_get_ref_count(fixed->buf[0]) == 1);
        for (size_t at = 0; at < fixed->buf[0]->size; at++) REQUIRE(fixed->buf[0]->data[at] == 0x5a);
        if (frame > 0) REQUIRE(av_dict_count(fixed->metadata) == 0);
        if (fixed->nb_side_data > maximum_side_data) maximum_side_data = fixed->nb_side_data;
    }
    REQUIRE(within_mpeg2_replace_scaled_properties(fixed, fixed) == AVERROR(EINVAL));
    REQUIRE(within_mpeg2_replace_scaled_properties(NULL, source) == AVERROR(EINVAL));
    printf("{\"status\":\"passed-native-scaled-property-lifecycle\",\"libavutilVersion\":%u,\"oldCopies\":17,\"oldSideData\":%d,\"oldWireResult\":%d,\"expectedWireResult\":%d,\"errorSymbol\":\"EFBIG\",\"correctedCopies\":1000,\"maximumCorrectedSideData\":%d,\"pixelStorageAndBytesUnchanged\":true,\"sourcePropertiesPreserved\":true,\"staleDictionaryRemoved\":true,\"bFramePolicyUnchanged\":true,\"mediaConversions\":0}\n",
           avutil_version(), old->nb_side_data, old_result, AVERROR(EFBIG), maximum_side_data);
    av_frame_free(&source); av_frame_free(&old); av_frame_free(&fixed); return 0;
fail:
    av_frame_free(&source); av_frame_free(&old); av_frame_free(&fixed); return 1;
}

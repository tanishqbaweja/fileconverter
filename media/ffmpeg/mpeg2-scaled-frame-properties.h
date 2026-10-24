#ifndef WITHIN_MPEG2_SCALED_FRAME_PROPERTIES_H
#define WITHIN_MPEG2_SCALED_FRAME_PROPERTIES_H
#include <errno.h>
#include "libavutil/dict.h"
#include "libavutil/error.h"
#include "libavutil/frame.h"

/* The scaler owns this reusable pixel frame. Replace its OLD properties before
 * copying the current decoded frame: av_frame_copy_props appends side data and
 * merges dictionaries. Never unref/copy its pixels or alter source properties.
 * A copy failure aborts the job; no partially replaced frame is submitted. */
static int within_mpeg2_replace_scaled_properties(AVFrame *destination, const AVFrame *source)
{
    if (!destination || !source || destination == source) return AVERROR(EINVAL);
    av_frame_side_data_free(&destination->side_data, &destination->nb_side_data);
    av_dict_free(&destination->metadata);
    return av_frame_copy_props(destination, source);
}
#endif

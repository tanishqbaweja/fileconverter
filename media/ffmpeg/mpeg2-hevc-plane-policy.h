/* Private HEVC decoder only; no live-reference or codec-option changes. */
#ifndef WITHIN_HEVC_PLANE_POLICY_H
#define WITHIN_HEVC_PLANE_POLICY_H
#include <libavcodec/codec_id.h>
static inline int within_hevc_plane_single_idle(enum AVCodecID codec_id,
                                              int threads, int encoder,
                                              int memory_poisoning)
{
    return codec_id == AV_CODEC_ID_HEVC && threads == 1 && !encoder &&
           !memory_poisoning;
}
#endif

/* Private single-idle pixel-plane selector; no codec options or live refs changed. */
#ifndef WITHIN_MPEG2_ENCODER_PLANE_POLICY_H
#define WITHIN_MPEG2_ENCODER_PLANE_POLICY_H
#include <libavcodec/codec_id.h>
static inline int within_mpeg2_plane_single_idle(enum AVCodecID codec_id,
                                               int threads, int encoder,
                                               int memory_poisoning)
{
    return codec_id == AV_CODEC_ID_MPEG2VIDEO && threads == 1 && encoder &&
           !memory_poisoning;
}
#endif

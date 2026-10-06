/* Private candidate only. The generic final-reference policy is already
 * independently lifecycle-tested; never release live decoder references. */
#ifndef WITHIN_HEVC_AUXILIARY_POLICY_H
#define WITHIN_HEVC_AUXILIARY_POLICY_H
#include <libavcodec/codec_id.h>

#define WITHIN_HEVC_AUXILIARY_UNCACHED (1u << 30)

static inline unsigned within_hevc_auxiliary_pool_flags(enum AVCodecID codec_id,
                                                       int thread_count,
                                                       int is_encoder)
{
    return codec_id == AV_CODEC_ID_HEVC && thread_count == 1 && !is_encoder
        ? WITHIN_HEVC_AUXILIARY_UNCACHED : 0;
}
#endif

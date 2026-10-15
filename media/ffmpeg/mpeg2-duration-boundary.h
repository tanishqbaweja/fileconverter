#ifndef WITHIN_MPEG2_DURATION_BOUNDARY_H
#define WITHIN_MPEG2_DURATION_BOUNDARY_H
#include <limits.h>
#include <stdint.h>
#include <libavcodec/packet.h>
#include <libavutil/avutil.h>
#include <libavutil/error.h>
#include <libavutil/mathematics.h>

/* The existing pipeline is CFR, low-delay, no-B-frame, one encoder tick/frame.
 * Rescaling one duration independently rounds each frame the same way. At a
 * fragment boundary that can lose a tick of next-packet lookahead. Describe
 * exactly the same clock using adjacent rescaled boundaries instead. No PTS,
 * DTS, source offset, codec setting, reference, allocation or payload changes. */
static inline int within_packet_cfr_duration(const AVPacket *packet,
    AVRational encoder_clock, AVRational mux_clock, int64_t *duration)
{
    if (!packet || !duration || encoder_clock.num <= 0 || encoder_clock.den <= 0 ||
        mux_clock.num <= 0 || mux_clock.den <= 0 ||
        packet->pts == AV_NOPTS_VALUE || packet->dts == AV_NOPTS_VALUE ||
        packet->pts != packet->dts || packet->dts < 0 || packet->dts == INT64_MAX ||
        (packet->duration != 0 && packet->duration != 1))
        return AVERROR_INVALIDDATA;
    int64_t start = av_rescale_q(packet->dts, encoder_clock, mux_clock);
    int64_t end = av_rescale_q(packet->dts + 1, encoder_clock, mux_clock);
    /* av_rescale_q reports unrepresentable results as INT64_MIN. Reject coarse
     * clocks/overflow rather than inventing a nonzero duration or changing DTS. */
    if (start < 0 || end <= start)
        return AVERROR_INVALIDDATA;
    *duration = end - start;
    return 0;
}
#endif

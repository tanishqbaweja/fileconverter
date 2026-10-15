/* Actual pinned libavutil rational arithmetic, not a media conversion. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "mpeg2-duration-boundary.h"
_Static_assert(sizeof(void *) == 4, "Require actual Wasm32 execution");
static unsigned iterations, sequences, rejected;
static int64_t oracle(int64_t ordinal, AVRational encoder, AVRational mux)
{
    /* Independent positive-integer oracle. Selected finite test products fit
     * uint64_t; do not call FFmpeg's rescaling implementation for expectations. */
    uint64_t numerator = (uint64_t)ordinal * encoder.num * mux.den;
    uint64_t denominator = (uint64_t)encoder.den * mux.num;
    assert(denominator && numerator < UINT64_MAX - denominator / 2);
    return (int64_t)((numerator + denominator / 2) / denominator);
}
static void sequence(AVRational encoder, AVRational mux)
{
    int64_t total = 0;
    for (int64_t i = 0; i < 6000; i++) {
        AVPacket packet = { .pts = i, .dts = i, .duration = i % 2 };
        unsigned char before[sizeof(packet)]; memcpy(before, &packet, sizeof(packet));
        int64_t duration = -1;
        assert(within_packet_cfr_duration(&packet, encoder, mux, &duration) == 0);
        assert(duration == oracle(i + 1, encoder, mux) - oracle(i, encoder, mux));
        assert(memcmp(before, &packet, sizeof(packet)) == 0);
        total += duration;
        assert(total == oracle(i + 1, encoder, mux));
        iterations++;
    }
    sequences++;
}
static void reject(AVPacket *packet, AVRational encoder, AVRational mux)
{
    int64_t duration = -77;
    assert(within_packet_cfr_duration(packet, encoder, mux, &duration) == AVERROR_INVALIDDATA);
    assert(duration == -77); rejected++;
}
int main(void)
{
    const AVRational rates[] = {{24,1}, {25,1}, {30,1}, {24000,1001}, {30000,1001}, {50,1}, {60000,1001}};
    const AVRational clocks[] = {{1,1000}, {1,16000}, {1,90000}};
    for (unsigned r = 0; r < sizeof(rates) / sizeof(rates[0]); r++)
        for (unsigned c = 0; c < sizeof(clocks) / sizeof(clocks[0]); c++)
            sequence(av_inv_q(rates[r]), clocks[c]);
    int64_t durations[2] = {0}, total = 0;
    for (int64_t i = 0; i < 96; i++) {
        AVPacket packet = { .pts = i, .dts = i, .duration = 1 };
        int64_t duration;
        assert(within_packet_cfr_duration(&packet, (AVRational){1,24}, (AVRational){1,16000}, &duration) == 0);
        if (i >= 94) durations[i - 94] = duration;
        total += duration;
    }
    assert(durations[0] == 666 && durations[1] == 667 && total == 64000);
    assert(oracle(95, (AVRational){1,24}, (AVRational){1,16000}) + 1328 == 64661);
    AVPacket packet = { .pts = 0, .dts = 0, .duration = 1 };
    const AVRational valid = {1,24};
    reject(NULL, valid, valid);
    assert(within_packet_cfr_duration(&packet, valid, valid, NULL) == AVERROR_INVALIDDATA); rejected++;
    packet.pts = AV_NOPTS_VALUE; reject(&packet, valid, valid); packet.pts = 0;
    packet.dts = AV_NOPTS_VALUE; reject(&packet, valid, valid); packet.dts = 0;
    packet.pts = packet.dts = -1; reject(&packet, valid, valid);
    packet.pts = packet.dts = INT64_MAX; reject(&packet, valid, valid);
    packet.pts = 1; packet.dts = 0; reject(&packet, valid, valid); packet.pts = 0;
    packet.duration = 2; reject(&packet, valid, valid);
    packet.duration = -1; reject(&packet, valid, valid); packet.duration = 1;
    reject(&packet, (AVRational){0,24}, valid); reject(&packet, (AVRational){1,0}, valid);
    reject(&packet, valid, (AVRational){0,24}); reject(&packet, valid, (AVRational){1,0});
    reject(&packet, valid, (AVRational){1,1});
    packet.pts = packet.dts = INT64_MAX - 1;
    int64_t duration;
    assert(within_packet_cfr_duration(&packet, valid, valid, &duration) == 0 && duration == 1);
    reject(&packet, (AVRational){INT_MAX,1}, (AVRational){1,INT_MAX});
    assert(iterations == 126000 && sequences == 21 && rejected == 15);
    printf("{\"status\":\"passed\",\"scope\":\"actual-wasm32-avutil-cfr-boundaries-not-conversion\","
           "\"sequences\":%u,\"iterations\":%u,\"invalidCases\":%u,\"independentIntegerOracle\":true,"
           "\"lastTwoDurations\":[666,667],\"regressionFrameCount\":96,\"regressionTotalTicks\":64000,"
           "\"sourceOffsetLastDts\":64661,\"packetBytesUnchanged\":true,\"ptsDtsUnchanged\":true,"
           "\"allocationsAdded\":0,\"conversionsPerformed\":0,\"browserFidelityVerified\":false,"
           "\"fullOriginalCompleted\":false,\"memoryAcceptance\":false,\"speedGainProven\":false}\n",
           sequences, iterations, rejected);
    return 0;
}

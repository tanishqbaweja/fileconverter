/* Ownership experiment, NOT a converter or a simulated interleaver. Links the
 * pinned libavformat/libavcodec/libavutil and uses the unchanged packet cache.
 * The tiny sink validates synthetic packet contents; it does not make media. */
#include <assert.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavformat/mux.h>
#include <libavutil/channel_layout.h>
#include <libavutil/mem.h>

_Static_assert(sizeof(void *) == 4, "Measure actual Wasm32 ownership");
static unsigned owned_allocations, owned_frees, payload_allocations;
static void *owned_malloc(size_t bytes)
{
    void *p = av_malloc(bytes);
    if (p) { owned_allocations++; payload_allocations++; }
    return p;
}
static void *owned_mallocz(size_t bytes)
{
    void *p = av_mallocz(bytes);
    if (p) owned_allocations++;
    return p;
}
static void owned_free(void *p)
{
    if (p) owned_frees++;
    av_free(p);
}
#define av_malloc owned_malloc
#define av_mallocz owned_mallocz
#define av_free owned_free
#include "mpeg2-packet-largest-idle.h"
#undef av_malloc
#undef av_mallocz
#undef av_free

typedef struct Sink {
    unsigned delivered, hold_next;
    int fail;
    int64_t last_dts[2];
    AVPacket *held;
} Sink;

static unsigned payload_size(int64_t pts)
{
    return pts % 2 == 0 ? 314024 : 212606;
}
static unsigned char payload_byte(int stream, int64_t pts)
{
    return (unsigned char)((stream * 71 + pts) % 251);
}
static void check_payload(const AVPacket *packet)
{
    assert(packet && packet->buf && packet->data);
    assert(packet->stream_index == 0 || packet->stream_index == 1);
    assert(packet->pts == packet->dts && packet->dts >= 0);
    assert(packet->duration == 1);
    assert(packet->size == (int)payload_size(packet->pts));
    unsigned char value = payload_byte(packet->stream_index, packet->pts);
    for (int i = 0; i < packet->size; i++) assert(packet->data[i] == value);
    for (int i = 0; i < AV_INPUT_BUFFER_PADDING_SIZE; i++)
        assert(packet->data[packet->size + i] == 0);
}
static int sink_write(AVFormatContext *context, AVPacket *packet)
{
    Sink *sink = context->opaque;
    check_payload(packet);
    assert(packet->dts > sink->last_dts[packet->stream_index]);
    sink->last_dts[packet->stream_index] = packet->dts;
    sink->delivered++;
    if (sink->hold_next) {
        assert(!sink->held->buf);
        assert(av_packet_ref(sink->held, packet) == 0);
        sink->hold_next = 0;
    }
    return sink->fail ? AVERROR(EIO) : 0;
}
static const FFOutputFormat test_format = {
    .p.name = "within-packet-ownership-test",
    .p.flags = AVFMT_NOFILE,
    .p.video_codec = AV_CODEC_ID_MPEG2VIDEO,
    .p.audio_codec = AV_CODEC_ID_AAC,
    .write_packet = sink_write,
};
static AVFormatContext *open_context(Sink *sink)
{
    AVFormatContext *context = avformat_alloc_context();
    assert(context);
    memset(sink, 0, sizeof(*sink));
    sink->last_dts[0] = sink->last_dts[1] = -1;
    sink->held = av_packet_alloc(); assert(sink->held);
    context->opaque = sink;
    context->oformat = &test_format.p;
    /* Identical to the real private kernel, NOT the generic 2-second wrapper. */
    context->max_interleave_delta = AV_TIME_BASE;
    for (int i = 0; i < 2; i++) {
        AVStream *stream = avformat_new_stream(context, NULL); assert(stream);
        stream->time_base = (AVRational){1, 1000};
        stream->codecpar->codec_type = i ? AVMEDIA_TYPE_AUDIO : AVMEDIA_TYPE_VIDEO;
        stream->codecpar->codec_id = i ? AV_CODEC_ID_AAC : AV_CODEC_ID_MPEG2VIDEO;
        if (i) {
            stream->codecpar->sample_rate = 48000;
            stream->codecpar->frame_size = 1024;
            av_channel_layout_default(&stream->codecpar->ch_layout, 2);
        } else {
            stream->codecpar->width = 1920;
            stream->codecpar->height = 804;
            stream->codecpar->format = AV_PIX_FMT_YUV420P;
        }
    }
    assert(avformat_write_header(context, NULL) == 0);
    return context;
}
static AVPacket *make_packet(WithinPacketCache **cache, int stream, int64_t pts)
{
    AVPacket *packet = av_packet_alloc(); assert(packet);
    unsigned bytes = payload_size(pts);
    packet->buf = within_packet_cache_get(cache, bytes, AV_INPUT_BUFFER_PADDING_SIZE);
    assert(packet->buf);
    packet->data = packet->buf->data; packet->size = bytes;
    memset(packet->data, payload_byte(stream, pts), bytes);
    packet->stream_index = stream;
    packet->pts = packet->dts = pts; packet->duration = 1;
    return packet;
}
static void submit(AVFormatContext *context, AVPacket *packet)
{
    assert(av_interleaved_write_frame(context, packet) == 0);
    assert(!packet->buf && !packet->data && packet->size == 0);
    av_packet_free(&packet);
}
static void close_context(AVFormatContext *context, Sink *sink,
                          WithinPacketCache **cache)
{
    avformat_free_context(context);
    av_packet_free(&sink->held);
    within_packet_cache_close(cache);
    assert(!*cache && owned_allocations == owned_frees);
}
static unsigned matched_workload(int drain)
{
    Sink sink; WithinPacketCache *cache = NULL;
    AVFormatContext *context = open_context(&sink);
    unsigned before = payload_allocations;
    for (int64_t i = 0; i < 8; i++) {
        submit(context, make_packet(&cache, 0, i));
        if (drain) {
            assert(av_interleaved_write_frame(context, NULL) == 0);
            assert(sink.delivered == (unsigned)i + 1);
            assert(cache->live == 0 && cache->idle->capacity == 314088);
        } else {
            assert(sink.delivered == 0);
            assert(cache->live == (unsigned)i + 1 && !cache->idle);
        }
    }
    assert(av_interleaved_write_frame(context, NULL) == 0);
    assert(sink.delivered == 8 && cache->live == 0);
    unsigned count = payload_allocations - before;
    /* Audio can arrive later; only per-stream DTS ordering is enforced here.
     * This is not proof that a real container tolerates changed global order. */
    submit(context, make_packet(&cache, 1, 0));
    assert(av_interleaved_write_frame(context, NULL) == 0);
    assert(sink.delivered == 9 && cache->live == 0);
    assert(av_write_trailer(context) == 0);
    close_context(context, &sink, &cache);
    return count;
}
int main(void)
{
    assert(avformat_version() == LIBAVFORMAT_VERSION_INT);
    unsigned queued = matched_workload(0), drained = matched_workload(1);
    assert(queued == 8 && drained == 1);

    Sink sink; WithinPacketCache *cache = NULL;
    AVFormatContext *context = open_context(&sink);
    AVPacket *packet = make_packet(&cache, 0, 0);
    AVBufferRef *alias = av_buffer_ref(packet->buf); assert(alias);
    sink.hold_next = 1; submit(context, packet);
    assert(cache->live == 1 && !cache->idle && sink.delivered == 0);
    assert(av_interleaved_write_frame(context, NULL) == 0);
    assert(sink.delivered == 1 && cache->live == 1 && !cache->idle);
    check_payload(sink.held);
    AVBufferRef *other = within_packet_cache_get(&cache, 32, 64); assert(other);
    assert(other->data != alias->data);
    av_buffer_unref(&other);
    avformat_free_context(context);
    within_packet_cache_close(&cache); assert(!cache);
    assert(alias->data[314023] == payload_byte(0, 0));
    av_buffer_unref(&alias); check_payload(sink.held);
    av_packet_free(&sink.held); assert(owned_allocations == owned_frees);

    context = open_context(&sink);
    submit(context, make_packet(&cache, 0, 0));
    sink.fail = 1;
    assert(av_interleaved_write_frame(context, NULL) == AVERROR(EIO));
    assert(sink.delivered == 1 && cache->live == 0);
    close_context(context, &sink, &cache);

    context = open_context(&sink);
    submit(context, make_packet(&cache, 0, 0));
    assert(cache->live == 1 && sink.delivered == 0);
    close_context(context, &sink, &cache); /* Abandoned queue, no flush/trailer. */

    context = open_context(&sink);
    for (int64_t i = 0; i < 2000; i++) {
        for (int stream = 0; stream < 2; stream++) {
            submit(context, make_packet(&cache, stream, i));
            assert(av_interleaved_write_frame(context, NULL) == 0);
            assert(cache->live == 0 && cache->idle);
        }
    }
    assert(sink.delivered == 4000);
    assert(av_write_trailer(context) == 0);
    close_context(context, &sink, &cache);
    printf("{\"status\":\"passed\",\"scope\":\"actual-wasm32-libavformat-interleave-ownership-not-conversion\","
           "\"libavformatVersion\":%u,\"matchedPackets\":8,\"queuedPayloadAllocations\":%u,"
           "\"drainedPayloadAllocations\":%u,\"repeatedPackets\":4000,"
           "\"payloadPaddingAndPerStreamTimestampsVerified\":true,\"aliasesAndMuxHeldReferencesPreserved\":true,"
           "\"deferredClosePassed\":true,\"writeErrorPropagated\":true,\"abandonedQueueCleaned\":true,"
           "\"ownedAllocationsBalanced\":true,\"productionQueuePolicyChanged\":false,"
           "\"realContainerFidelityVerified\":false,\"fullFailureCauseProven\":false,"
           "\"conversionSpeedGainProven\":false,\"conversionsPerformed\":0}\n",
           avformat_version(), queued, drained);
    return 0;
}

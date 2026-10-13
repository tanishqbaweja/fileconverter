#ifndef WITHIN_MPEG2_PACKET_CACHE_H
#define WITHIN_MPEG2_PACKET_CACHE_H
#include <errno.h>
#include <string.h>
#include <libavutil/buffer.h>
#include <libavutil/mem.h>

/* Private single-thread mux candidate. Only final-unreferenced storage may be
 * reused. One idle allocation, never a fixed 1MiB allocation for every packet.
 * Live mux references remain owned by AVBuffer until their final unreference. */
typedef struct WithinPacketCache WithinPacketCache;
typedef struct WithinPacketLease {
    WithinPacketCache *owner;
    uint8_t *data;
    size_t capacity;
} WithinPacketLease;
struct WithinPacketCache {
    WithinPacketLease *idle;
    unsigned live;
    int closed;
};

static void within_packet_lease_free(WithinPacketLease *lease)
{
    av_free(lease->data);
    av_free(lease);
}
static void within_packet_release(void *opaque, uint8_t *data)
{
    WithinPacketLease *lease = opaque;
    WithinPacketCache *cache = lease->owner;
    (void)data;
    cache->live--;
    /* Keep one largest final-unreferenced allocation, never a live buffer. */
    if (!cache->closed && (!cache->idle || lease->capacity > cache->idle->capacity)) {
        if (cache->idle) within_packet_lease_free(cache->idle);
        cache->idle = lease;
    } else {
        within_packet_lease_free(lease);
    }
    if (cache->closed && !cache->live)
        av_free(cache);
}
static AVBufferRef *within_packet_cache_get(WithinPacketCache **owner,
                                           unsigned bytes, unsigned padding)
{
    /* Match the existing packet bridge's payload and padding bounds. */
    if (bytes > 1048576 || padding != 64)
        return NULL;
    WithinPacketCache *cache = *owner;
    if (!cache) {
        cache = av_mallocz(sizeof(*cache));
        if (!cache) return NULL;
        *owner = cache;
    }
    if (cache->closed) return NULL;
    size_t required = (size_t)bytes + padding;
    WithinPacketLease *lease = cache->idle;
    cache->idle = NULL;
    if (lease && lease->capacity < required) {
        within_packet_lease_free(lease);
        lease = NULL;
    }
    if (!lease) {
        lease = av_mallocz(sizeof(*lease));
        if (!lease) return NULL;
        lease->data = av_malloc(required);
        if (!lease->data) { av_free(lease); return NULL; }
        lease->owner = cache;
        lease->capacity = required;
    }
    memset(lease->data, 0, lease->capacity);
    cache->live++;
    AVBufferRef *ref = av_buffer_create(lease->data, lease->capacity,
                                       within_packet_release, lease, 0);
    /* av_buffer_create failure does not consume the caller's data/opaque. */
    if (!ref) within_packet_release(lease, lease->data);
    return ref;
}
static void within_packet_cache_close(WithinPacketCache **owner)
{
    WithinPacketCache *cache = *owner;
    *owner = NULL;
    if (!cache) return;
    cache->closed = 1;
    if (cache->idle) within_packet_lease_free(cache->idle);
    cache->idle = NULL;
    if (!cache->live) av_free(cache);
}
#endif

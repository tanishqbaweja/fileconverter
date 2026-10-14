#ifndef WITHIN_MPEG2_EBML_REUSE_H
#define WITHIN_MPEG2_EBML_REUSE_H
#include <errno.h>
#include <string.h>
#include <libavutil/buffer.h>
#include <libavutil/error.h>
#include <libavutil/mem.h>

/* Private single-thread Matroska block candidate. Metadata/attachments and
 * oversized blocks stay upstream. Only final-unreferenced storage is reusable;
 * physical capacity is private, AVBuffer's size is always the logical request.
 * One idle payload <= 1 MiB + 64, no per-block maximum-size preallocation. */
typedef struct WithinEbmlCache WithinEbmlCache;
typedef struct WithinEbmlLease {
    WithinEbmlCache *owner;
    uint8_t *data;
    size_t capacity;
} WithinEbmlLease;
struct WithinEbmlCache {
    WithinEbmlLease *idle;
    unsigned live;
    int closed;
};
static void within_ebml_lease_free(WithinEbmlLease *lease)
{
    av_free(lease->data);
    av_free(lease);
}
static void within_ebml_release(void *opaque, uint8_t *data)
{
    WithinEbmlLease *lease = opaque;
    WithinEbmlCache *cache = lease->owner;
    (void)data;
    cache->live--;
    if (!cache->closed && (!cache->idle || lease->capacity > cache->idle->capacity)) {
        if (cache->idle) within_ebml_lease_free(cache->idle);
        cache->idle = lease;
    } else {
        within_ebml_lease_free(lease);
    }
    if (cache->closed && !cache->live) av_free(cache);
}
static int within_ebml_buffer_realloc(WithinEbmlCache **owner,
                                     AVBufferRef **buffer, size_t size)
{
    /* Existing refs keep the real libavutil copy-on-write/realloc semantics.
     * Larger input is not rejected or truncated: it uses the original path. */
    if (*buffer || size < 64 || size > 1048640)
        return av_buffer_realloc(buffer, size);
    WithinEbmlCache *cache = *owner;
    if (!cache) {
        cache = av_mallocz(sizeof(*cache));
        if (!cache) return AVERROR(ENOMEM);
        *owner = cache;
    }
    if (cache->closed) return AVERROR(EINVAL);
    WithinEbmlLease *lease = cache->idle;
    cache->idle = NULL;
    if (lease && lease->capacity < size) {
        within_ebml_lease_free(lease);
        lease = NULL;
    }
    if (!lease) {
        lease = av_mallocz(sizeof(*lease));
        if (!lease) return AVERROR(ENOMEM);
        lease->data = av_malloc(size);
        if (!lease->data) { av_free(lease); return AVERROR(ENOMEM); }
        lease->owner = cache;
        lease->capacity = size;
    }
    /* ebml_read_binary completely overwrites the payload before exposing it;
     * it also repeats this padding clear. Failed/short reads unref the buffer. */
    memset(lease->data + size - 64, 0, 64);
    cache->live++;
    AVBufferRef *ref = av_buffer_create(lease->data, size, within_ebml_release, lease, 0);
    if (!ref) { within_ebml_release(lease, lease->data); return AVERROR(ENOMEM); }
    *buffer = ref;
    return 0;
}
static void within_ebml_cache_close(WithinEbmlCache **owner)
{
    WithinEbmlCache *cache = *owner;
    *owner = NULL;
    if (!cache) return;
    cache->closed = 1;
    if (cache->idle) within_ebml_lease_free(cache->idle);
    cache->idle = NULL;
    /* AVPackets may outlive AVFormatContext. The last alias frees this owner. */
    if (!cache->live) av_free(cache);
}
#endif

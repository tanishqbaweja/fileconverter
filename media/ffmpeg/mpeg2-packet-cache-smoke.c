/* Must compile/link against actual pinned libavutil; not a media conversion.
 * Failure seams affect only the candidate header, not FFmpeg's real refcounts. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <libavutil/buffer.h>
#include <libavutil/mem.h>
static unsigned owned_allocations, owned_frees, allocation_calls;
static unsigned fail_allocation, fail_create;
static void *checked_alloc(size_t bytes, int zero)
{
    if (++allocation_calls == fail_allocation) return NULL;
    void *p = zero ? av_mallocz(bytes) : av_malloc(bytes);
    if (p) owned_allocations++;
    return p;
}
static void *checked_malloc(size_t bytes) { return checked_alloc(bytes, 0); }
static void *checked_mallocz(size_t bytes) { return checked_alloc(bytes, 1); }
static void checked_free(void *p) { if (p) owned_frees++; av_free(p); }
static AVBufferRef *checked_create(uint8_t *data, size_t size,
    void (*release)(void *, uint8_t *), void *opaque, int flags)
{
    if (fail_create) return NULL;
    return av_buffer_create(data, size, release, opaque, flags);
}
#define av_malloc checked_malloc
#define av_mallocz checked_mallocz
#define av_free checked_free
#define av_buffer_create checked_create
#include "mpeg2-packet-cache.h"
#undef av_malloc
#undef av_mallocz
#undef av_free
#undef av_buffer_create
static void balanced(void) { assert(owned_allocations == owned_frees); }
static void zeroed(AVBufferRef *ref)
{
    assert(ref);
    for (size_t i = 0; i < ref->size; i++) assert(ref->data[i] == 0);
}
int main(void)
{
    WithinPacketCache *cache = NULL;
    assert(!within_packet_cache_get(&cache, 1048577, 64));
    assert(!within_packet_cache_get(&cache, 1, 63)); assert(!cache);
    AVBufferRef *ref = within_packet_cache_get(&cache, 314024, 64);
    assert(ref && ref->size == 314088); zeroed(ref);
    uint8_t *first = ref->data; memset(ref->data, 0x72, ref->size);
    av_buffer_unref(&ref); assert(cache->live == 0 && cache->idle);
    unsigned prior_allocations = owned_allocations;
    for (unsigned i = 0; i < 200000; i++) {
        unsigned bytes = i % 3 == 0 ? 0 : i % 3 == 1 ? 32 : 314024;
        ref = within_packet_cache_get(&cache, bytes, 64);
        assert(ref && ref->data == first && cache->live == 1 && !cache->idle);
        /* Whole padding/capacity checked periodically, tail on every acquire. */
        if (i % 2000 == 0) zeroed(ref);
        for (unsigned j = 0; j < 64; j++) assert(ref->data[bytes + j] == 0);
        memset(ref->data, 0x5a, ref->size); av_buffer_unref(&ref);
        assert(cache->live == 0 && cache->idle);
    }
    assert(owned_allocations == prior_allocations);
    ref = within_packet_cache_get(&cache, 1048576, 64);
    assert(ref && ref->size == 1048640); zeroed(ref);
    AVBufferRef *alias = av_buffer_ref(ref); assert(alias && av_buffer_get_ref_count(ref) == 2);
    memset(ref->data, 0x61, ref->size); av_buffer_unref(&ref);
    assert(cache->live == 1 && !cache->idle && alias->data[1048575] == 0x61);
    AVBufferRef *second = within_packet_cache_get(&cache, 32, 64);
    assert(second && second->size == 96 && second->data != alias->data);
    av_buffer_unref(&second); assert(cache->live == 1 && cache->idle->capacity == 96);
    av_buffer_unref(&alias); assert(cache->live == 0 && cache->idle->capacity == 96);
    within_packet_cache_close(&cache); assert(!cache); balanced();
    /* Closing cannot free an aliased mux buffer; its last unref frees owner. */
    ref = within_packet_cache_get(&cache, 4096, 64); assert(ref);
    alias = av_buffer_ref(ref); assert(alias); av_buffer_unref(&ref);
    within_packet_cache_close(&cache); assert(!cache);
    memset(alias->data, 0x31, alias->size); assert(alias->data[4095] == 0x31);
    av_buffer_unref(&alias); balanced(); within_packet_cache_close(&cache);
    for (unsigned i = 1; i <= 3; i++) {
        allocation_calls = 0; fail_allocation = i;
        assert(!within_packet_cache_get(&cache, 4096, 64));
        within_packet_cache_close(&cache); balanced();
    }
    fail_allocation = 0; fail_create = 1;
    assert(!within_packet_cache_get(&cache, 4096, 64));
    assert(cache && cache->live == 0 && cache->idle);
    fail_create = 0; ref = within_packet_cache_get(&cache, 4096, 64); zeroed(ref);
    av_buffer_unref(&ref); within_packet_cache_close(&cache); balanced();
    puts("{\"status\":\"actual-libavutil-packet-cache-lifecycle-not-conversion\",\"reuseIterations\":200000,\"maximumIdleLeases\":1,\"payloadLimitBytes\":1048576,\"ownedAllocationsBalanced\":true,\"aliasesAndDeferredClose\":true,\"injectedFailureCases\":4}");
    return 0;
}

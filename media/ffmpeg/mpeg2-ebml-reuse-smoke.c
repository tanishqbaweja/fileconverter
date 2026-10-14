/* Real pinned libavutil test, not a conversion or Chromium acceptance. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <libavutil/buffer.h>
#include <libavutil/mem.h>
static unsigned owned_allocations, owned_frees, allocation_calls, payload_calls;
static size_t payload_bytes;
static unsigned fail_allocation, fail_create;
static void *checked_alloc(size_t size, int zero)
{
    if (++allocation_calls == fail_allocation) return NULL;
    void *p = zero ? av_mallocz(size) : av_malloc(size);
    if (p) {
        owned_allocations++;
        if (!zero) { payload_calls++; payload_bytes += size; }
    }
    return p;
}
static void *checked_malloc(size_t size) { return checked_alloc(size, 0); }
static void *checked_mallocz(size_t size) { return checked_alloc(size, 1); }
static void checked_free(void *p) { if (p) owned_frees++; av_free(p); }
static AVBufferRef *checked_create(uint8_t *data, size_t size,
    void (*release)(void *, uint8_t *), void *opaque, int flags)
{
    return fail_create ? NULL : av_buffer_create(data, size, release, opaque, flags);
}
#define av_malloc checked_malloc
#define av_mallocz checked_mallocz
#define av_free checked_free
#define av_buffer_create checked_create
#include "mpeg2-ebml-reuse.h"
#undef av_malloc
#undef av_mallocz
#undef av_free
#undef av_buffer_create
static void balanced(void) { assert(owned_allocations == owned_frees); }
static void padding(AVBufferRef *ref, size_t size)
{
    assert(ref && ref->size == size);
    for (size_t i = size - 64; i < size; i++) assert(ref->data[i] == 0);
}
static void content(AVBufferRef *ref, size_t bytes, unsigned char value)
{
    for (size_t i = 0; i < bytes; i++) assert(ref->data[i] == value);
}
int main(void)
{
    WithinEbmlCache *cache = NULL;
    AVBufferRef *ref = NULL;
    assert(within_ebml_buffer_realloc(&cache, &ref, 273954) == 0);
    padding(ref, 273954); memset(ref->data, 0x51, ref->size);
    uint8_t *first = ref->data;
    av_buffer_unref(&ref);
    unsigned before_calls = payload_calls;
    for (unsigned i = 0; i < 200000; i++) {
        size_t size = i % 3 == 0 ? 64 : i % 3 == 1 ? 96 : 273954;
        assert(within_ebml_buffer_realloc(&cache, &ref, size) == 0);
        assert(ref->data == first && cache->live == 1 && !cache->idle);
        padding(ref, size);
        memset(ref->data, 0x63, size);
        av_buffer_unref(&ref);
        assert(cache->live == 0 && cache->idle->capacity == 273954);
    }
    assert(payload_calls == before_calls);
    assert(within_ebml_buffer_realloc(&cache, &ref, 1048640) == 0);
    padding(ref, 1048640); memset(ref->data, 0x72, ref->size);
    AVBufferRef *alias = av_buffer_ref(ref); assert(alias);
    av_buffer_unref(&ref);
    assert(cache->live == 1 && !cache->idle);
    assert(within_ebml_buffer_realloc(&cache, &ref, 96) == 0);
    assert(ref->data != alias->data); padding(ref, 96); content(alias, 1048640, 0x72);
    av_buffer_unref(&ref); assert(cache->idle->capacity == 96);
    av_buffer_unref(&alias); assert(cache->idle->capacity == 1048640);

    /* Existing unique/aliased refs delegate to real libavutil. Internal buffer
     * size is logical, so copy-on-write does not copy unused cached capacity. */
    assert(within_ebml_buffer_realloc(&cache, &ref, 4096) == 0);
    memset(ref->data, 0x5a, ref->size);
    first = ref->data;
    assert(within_ebml_buffer_realloc(&cache, &ref, 4096) == 0 && ref->data == first);
    assert(within_ebml_buffer_realloc(&cache, &ref, 8192) == 0);
    content(ref, 4096, 0x5a);
    assert(cache->live == 0 && cache->idle->capacity == 1048640);
    alias = av_buffer_ref(ref); assert(alias);
    assert(within_ebml_buffer_realloc(&cache, &ref, 16384) == 0);
    assert(ref->data != alias->data); content(ref, 4096, 0x5a); content(alias, 4096, 0x5a);
    assert(within_ebml_buffer_realloc(&cache, &ref, 2048) == 0); content(ref, 2048, 0x5a);
    av_buffer_unref(&ref); av_buffer_unref(&alias);
    /* Above the retention limit and zero-size calls are not rejected. */
    assert(within_ebml_buffer_realloc(&cache, &ref, 1048641) == 0);
    assert(ref->size == 1048641 && cache->live == 0); av_buffer_unref(&ref);
    assert(within_ebml_buffer_realloc(&cache, &ref, 0) == 0);
    assert(ref->size == 0); av_buffer_unref(&ref);
    within_ebml_cache_close(&cache); assert(!cache); balanced();

    ref = NULL;
    assert(within_ebml_buffer_realloc(&cache, &ref, 4096) == 0);
    alias = av_buffer_ref(ref); assert(alias); av_buffer_unref(&ref);
    within_ebml_cache_close(&cache); assert(!cache);
    memset(alias->data, 0x31, alias->size); content(alias, alias->size, 0x31);
    av_buffer_unref(&alias); balanced(); within_ebml_cache_close(&cache);
    for (unsigned i = 1; i <= 3; i++) {
        allocation_calls = 0; fail_allocation = i;
        assert(within_ebml_buffer_realloc(&cache, &ref, 4096) == AVERROR(ENOMEM));
        assert(!ref); within_ebml_cache_close(&cache); balanced();
    }
    fail_allocation = 0; fail_create = 1;
    assert(within_ebml_buffer_realloc(&cache, &ref, 4096) == AVERROR(ENOMEM));
    assert(!ref && cache && cache->live == 0 && cache->idle);
    fail_create = 0;
    assert(within_ebml_buffer_realloc(&cache, &ref, 4096) == 0); padding(ref, 4096);
    av_buffer_unref(&ref); within_ebml_cache_close(&cache); balanced();

    /* Identical logical requests/content, separate real allocator paths. These
     * timings measure only this workload, not media or end-to-end speed. */
    const unsigned rounds = 20000;
    unsigned start_calls = payload_calls;
    size_t start_bytes = payload_bytes;
    clock_t started = clock();
    for (unsigned i = 0; i < rounds; i++) {
        size_t size = i % 3 == 0 ? 273954 : i % 3 == 1 ? 96 : 123456;
        assert(within_ebml_buffer_realloc(&cache, &ref, size) == 0);
        padding(ref, size); memset(ref->data, 0x42, size - 64);
        content(ref, size - 64, 0x42); av_buffer_unref(&ref);
    }
    double candidate_ms = 1000.0 * (clock() - started) / CLOCKS_PER_SEC;
    unsigned workload_calls = payload_calls - start_calls;
    size_t workload_bytes = payload_bytes - start_bytes;
    assert(workload_calls == 1 && workload_bytes == 273954);
    within_ebml_cache_close(&cache); balanced();
    started = clock();
    for (unsigned i = 0; i < rounds; i++) {
        size_t size = i % 3 == 0 ? 273954 : i % 3 == 1 ? 96 : 123456;
        assert(av_buffer_realloc(&ref, size) == 0);
        memset(ref->data + size - 64, 0, 64); padding(ref, size);
        memset(ref->data, 0x42, size - 64); content(ref, size - 64, 0x42);
        av_buffer_unref(&ref);
    }
    double control_ms = 1000.0 * (clock() - started) / CLOCKS_PER_SEC;
    printf("{\"scope\":\"actual-libavutil-ebml-reuse-not-conversion\",\"reuseIterations\":200000,\"maximumIdleLeases\":1,\"maximumIdleCapacityBytes\":1048640,\"logicalSizesPreserved\":true,\"aliasesAndDeferredClose\":true,\"existingReallocContentPreserved\":true,\"oversizedAndZeroDelegate\":true,\"injectedFailureCases\":4,\"ownedAllocationsBalanced\":true,\"matchedWorkloadRounds\":%u,\"candidatePayloadAllocationCalls\":%u,\"candidatePayloadAllocatedBytes\":%zu,\"upstreamInitialRequests\":%u,\"candidateElapsedMs\":%.3f,\"controlElapsedMs\":%.3f,\"conversionSpeedGainProven\":false,\"conversionsPerformed\":0}\n", rounds, workload_calls, workload_bytes, rounds, candidate_ms, control_ms);
    return 0;
}

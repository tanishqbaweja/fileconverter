/* Compile against actual patched libavutil; no codec or media conversion. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <libavutil/buffer_internal.h>
#include <libavutil/mem.h>
#include "mpeg2-encoder-plane-policy.h"
AVBufferPool *ff_within_mpeg2_single_idle_plane_pool(size_t size);
typedef struct Counts { unsigned allocated, freed; int fail; } Counts;
static void free_plane(void *opaque, uint8_t *data)
{
    Counts *counts = opaque; counts->freed++; av_free(data);
}
static AVBufferRef *allocate_plane(void *opaque, size_t size)
{
    Counts *counts = opaque;
    if (counts->fail) return NULL;
    uint8_t *data = av_malloc(size);
    if (!data) return NULL;
    memset(data, 0x73, size);
    AVBufferRef *ref = av_buffer_create(data, size, free_plane, counts, 0);
    if (!ref) { av_free(data); return NULL; }
    counts->allocated++; return ref;
}
static AVBufferPool *make_pool(Counts *counts, int selected)
{
    AVBufferPool *pool = selected ? ff_within_mpeg2_single_idle_plane_pool(1024)
                                : av_buffer_pool_init2(1024, counts, allocate_plane, NULL);
    assert(pool);
    if (selected) { pool->opaque = counts; pool->alloc2 = allocate_plane; }
    return pool;
}
static unsigned idle_count(AVBufferPool *pool)
{
    unsigned count = 0;
    for (BufferPoolEntry *entry = pool->pool; entry; entry = entry->next) {
        assert(++count <= 3);
    }
    return count;
}
static void expect_zero(AVBufferRef *ref)
{
    assert(ref && ref->size == 1024);
    for (size_t i = 0; i < ref->size; i++) assert(ref->data[i] == 0);
}
int main(void)
{
    enum AVCodecID codecs[] = { AV_CODEC_ID_MPEG2VIDEO, AV_CODEC_ID_HEVC, AV_CODEC_ID_H264, AV_CODEC_ID_NONE };
    int threads[] = { -1, 0, 1, 2, 16 }; unsigned selectors = 0;
    for (unsigned i = 0; i < 4; i++) for (unsigned j = 0; j < 5; j++)
        for (int encoder = 0; encoder < 2; encoder++) for (int poison = 0; poison < 2; poison++) {
            int expected = codecs[i] == AV_CODEC_ID_MPEG2VIDEO && threads[j] == 1 && encoder && !poison;
            assert(within_mpeg2_plane_single_idle(codecs[i], threads[j], encoder, poison) == expected);
            selectors++;
        }
    for (int selected = 0; selected < 2; selected++) {
        Counts counts = {0}; AVBufferPool *pool = make_pool(&counts, selected);
        AVBufferRef *a = av_buffer_pool_get(pool), *b = av_buffer_pool_get(pool), *c = av_buffer_pool_get(pool);
        assert(a && b && c && counts.allocated == 3);
        if (selected) { expect_zero(a); expect_zero(b); expect_zero(c); }
        AVBufferRef *alias = av_buffer_ref(a); assert(alias && av_buffer_get_ref_count(a) == 2);
        memset(a->data, 91, a->size); av_buffer_unref(&a);
        assert(alias->data[1000] == 91 && counts.freed == 0 && idle_count(pool) == 0);
        uint8_t *first_idle = b->data;
        av_buffer_unref(&b); av_buffer_unref(&c);
        assert(idle_count(pool) == (selected ? 1u : 2u));
        assert(counts.freed == (selected ? 1u : 0u));
        AVBufferRef *d = av_buffer_pool_get(pool); assert(d);
        if (selected) { assert(d->data == first_idle); expect_zero(d); }
        av_buffer_unref(&alias); av_buffer_unref(&d);
        assert(idle_count(pool) == (selected ? 1u : 3u));
        av_buffer_pool_uninit(&pool); assert(!pool && counts.allocated == counts.freed);
    }
    Counts delayed = {0}; AVBufferPool *pool = make_pool(&delayed, 1);
    AVBufferRef *live = av_buffer_pool_get(pool), *alias = av_buffer_ref(live), *idle = av_buffer_pool_get(pool);
    assert(live && alias && idle); memset(live->data, 44, live->size);
    av_buffer_unref(&idle); av_buffer_pool_uninit(&pool);
    assert(!pool && delayed.freed == 1 && alias->data[1023] == 44);
    av_buffer_unref(&live); assert(delayed.freed == 1 && alias->data[1023] == 44);
    av_buffer_unref(&alias); assert(delayed.allocated == delayed.freed);
    Counts failure = { .fail = 1 }; pool = make_pool(&failure, 1);
    assert(!av_buffer_pool_get(pool)); assert(atomic_load(&pool->refcount) == 1 && idle_count(pool) == 0);
    failure.fail = 0; live = av_buffer_pool_get(pool); expect_zero(live);
    av_buffer_unref(&live); av_buffer_pool_uninit(&pool); assert(failure.allocated == failure.freed);
    Counts reuse = {0}; pool = make_pool(&reuse, 1); uint8_t *address = NULL;
    for (unsigned i = 0; i < 200000; i++) {
        live = av_buffer_pool_get(pool); expect_zero(live);
        if (!i) address = live->data; else assert(live->data == address);
        memset(live->data, 0xa5, live->size); av_buffer_unref(&live);
        assert(reuse.allocated == 1 && reuse.freed == 0 && idle_count(pool) == 1);
    }
    av_buffer_pool_uninit(&pool); assert(reuse.freed == 1);
    assert(selectors == 80);
    puts("{\"status\":\"passed\",\"scope\":\"actual-libavutil-encoder-plane-lifecycle-not-conversion\","
         "\"selectorConfigurations\":80,\"sequentialReuses\":200000,\"sequentialFreshAllocations\":1,"
         "\"maximumIdleEntriesPerSelectedPool\":1,\"liveReferencesUnchanged\":true,"
         "\"uninitWithLiveReferencesPassed\":true,\"allocatorCallbackFailurePassed\":true,"
         "\"zeroEveryAcquisitionPassed\":true,\"nonselectedCacheUnchanged\":true,\"conversionsPerformed\":0}");
    return 0;
}

/* Synthetic lifecycle unit against the actual compiled private libavutil.
 * No decoder, encoder, media fixture or native conversion is involved. */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <libavutil/error.h>
#include <libavutil/refstruct.h>

#define WITHIN_MPEG2_POOL_UNCACHED (1u << 30)
#define PAYLOAD 64

typedef struct Counts {
    unsigned init, reset, entry_free, pool_free;
    int expect_initial_zero, fail_init;
} Counts;

static void bytes_equal(const void *obj, unsigned char value)
{
    const unsigned char *bytes = obj;
    for (unsigned i = 0; i < PAYLOAD; i++) assert(bytes[i] == value);
}

static int entry_init(AVRefStructOpaque opaque, void *obj)
{
    Counts *counts = opaque.nc;
    counts->init++;
    if (counts->expect_initial_zero) bytes_equal(obj, 0);
    memset(obj, counts->fail_init ? 0x37 : 0xa5, PAYLOAD);
    return counts->fail_init ? AVERROR(EINVAL) : 0;
}

static void entry_reset(AVRefStructOpaque opaque, void *obj)
{
    Counts *counts = opaque.nc;
    bytes_equal(obj, 0x37);
    counts->reset++;
    memset(obj, 0x52, PAYLOAD);
}

static void entry_free(AVRefStructOpaque opaque, void *obj)
{
    Counts *counts = opaque.nc;
    bytes_equal(obj, 0x52); /* Normal reset precedes the free callback. */
    counts->entry_free++;
    assert(counts->entry_free <= counts->reset);
}

static void pool_free(AVRefStructOpaque opaque)
{
    Counts *counts = opaque.nc;
    assert(counts->entry_free == counts->init);
    counts->pool_free++;
}

static AVRefStructPool *make_pool(Counts *counts, unsigned flags)
{
    AVRefStructPool *pool = av_refstruct_pool_alloc_ext(PAYLOAD, flags, counts,
        entry_init, entry_reset, entry_free, pool_free);
    assert(pool);
    return pool;
}

int main(void)
{
    Counts cached = {.expect_initial_zero = 1};
    AVRefStructPool *pool = make_pool(&cached, 0);
    void *first = av_refstruct_pool_get(pool);
    assert(first); bytes_equal(first, 0xa5); memset(first, 0x37, PAYLOAD);
    void *extra = av_refstruct_ref(first);
    av_refstruct_unref(&first);
    assert(cached.init == 1 && cached.reset == 0 && cached.entry_free == 0);
    bytes_equal(extra, 0x37);
    av_refstruct_unref(&extra);
    assert(cached.reset == 1 && cached.entry_free == 0);
    first = av_refstruct_pool_get(pool);
    assert(first && cached.init == 1); bytes_equal(first, 0x52);
    memset(first, 0x37, PAYLOAD); av_refstruct_unref(&first);
    assert(cached.reset == 2 && cached.entry_free == 0);
    av_refstruct_pool_uninit(&pool);
    assert(!pool && cached.entry_free == 1 && cached.pool_free == 1);

    Counts uncached = {.expect_initial_zero = 1};
    pool = make_pool(&uncached, WITHIN_MPEG2_POOL_UNCACHED);
    first = av_refstruct_pool_get(pool);
    assert(first); bytes_equal(first, 0xa5); memset(first, 0x37, PAYLOAD);
    extra = av_refstruct_ref(first); av_refstruct_unref(&first);
    assert(uncached.reset == 0 && uncached.entry_free == 0 && uncached.pool_free == 0);
    bytes_equal(extra, 0x37); av_refstruct_unref(&extra);
    assert(uncached.reset == 1 && uncached.entry_free == 1 && uncached.pool_free == 0);
    first = av_refstruct_pool_get(pool);
    assert(first && uncached.init == 2); bytes_equal(first, 0xa5);
    memset(first, 0x37, PAYLOAD); extra = av_refstruct_ref(first);
    av_refstruct_pool_uninit(&pool);
    assert(!pool && uncached.pool_free == 0 && uncached.entry_free == 1);
    av_refstruct_unref(&first);
    assert(uncached.reset == 1 && uncached.entry_free == 1 && uncached.pool_free == 0);
    bytes_equal(extra, 0x37); av_refstruct_unref(&extra);
    assert(uncached.reset == 2 && uncached.entry_free == 2 && uncached.pool_free == 1);

    Counts zero = {0};
    pool = make_pool(&zero, WITHIN_MPEG2_POOL_UNCACHED | AV_REFSTRUCT_POOL_FLAG_ZERO_EVERY_TIME);
    for (unsigned i = 0; i < 2; i++) {
        first = av_refstruct_pool_get(pool); assert(first); bytes_equal(first, 0);
        memset(first, 0x37, PAYLOAD); av_refstruct_unref(&first);
        assert(zero.init == i + 1 && zero.reset == i + 1 && zero.entry_free == i + 1);
    }
    av_refstruct_pool_uninit(&pool); assert(!pool && zero.pool_free == 1);

    Counts failed = {.expect_initial_zero = 1, .fail_init = 1};
    pool = make_pool(&failed, WITHIN_MPEG2_POOL_UNCACHED |
        AV_REFSTRUCT_POOL_FLAG_RESET_ON_INIT_ERROR | AV_REFSTRUCT_POOL_FLAG_FREE_ON_INIT_ERROR);
    first = av_refstruct_pool_get(pool);
    assert(!first && failed.init == 1 && failed.reset == 1 && failed.entry_free == 1);
    assert(failed.pool_free == 0);
    av_refstruct_pool_uninit(&pool); assert(!pool && failed.pool_free == 1);

    pool = av_refstruct_pool_alloc(PAYLOAD, WITHIN_MPEG2_POOL_UNCACHED); assert(pool);
    for (unsigned i = 0; i < 2; i++) {
        first = av_refstruct_pool_get(pool); assert(first); bytes_equal(first, 0);
        memset(first, 0x37, PAYLOAD); av_refstruct_unref(&first);
    }
    av_refstruct_pool_uninit(&pool); assert(!pool);
    pool = av_refstruct_pool_alloc(SIZE_MAX, WITHIN_MPEG2_POOL_UNCACHED); assert(pool);
    first = av_refstruct_pool_get(pool); assert(!first);
    av_refstruct_pool_uninit(&pool); assert(!pool);

    puts("{\"status\":\"passed\",\"scope\":\"synthetic-lifecycle-unit-not-conversion\","
         "\"payloadBytes\":64,\"defaultCacheReusePreserved\":true,"
         "\"onlyFinalReferenceReleased\":true,\"uncachedNewEntryInitCount\":2,"
         "\"resetBeforeFree\":true,\"ownerUninitWithLiveRefs\":true,"
         "\"zeroingPreserved\":true,\"initFailureCallbacksPreserved\":true,"
         "\"overflowRefused\":true}");
    return 0;
}

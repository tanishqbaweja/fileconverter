/* Actual Wasm32 libavutil lifetime unit, no codec or media conversion. */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <libavutil/refstruct.h>
#include "mpeg2-hevc-single-idle-policy.h"
extern volatile uint32_t within_refstruct_abort_words[16];
#define UNCACHED (1u << 30)
#define SINGLE_IDLE (1u << 29)
typedef struct Counts { unsigned init, reset, freed, pool_freed; int fail_init; } Counts;
static int init_entry(AVRefStructOpaque opaque, void *object)
{
    Counts *counts = opaque.nc; counts->init++;
    assert(((uint8_t *)object)[0] == 0);
    return counts->fail_init ? -12 : 0;
}
static void reset_entry(AVRefStructOpaque opaque, void *object)
{
    Counts *counts = opaque.nc; counts->reset++;
    ((uint8_t *)object)[0] = 0;
}
static void free_entry(AVRefStructOpaque opaque, void *object)
{
    Counts *counts = opaque.nc; counts->freed++; (void)object;
}
static void free_pool(AVRefStructOpaque opaque)
{
    Counts *counts = opaque.nc; counts->pool_freed++;
}
static AVRefStructPool *make_pool(Counts *counts, unsigned flags, size_t size)
{
    AVRefStructPool *pool = av_refstruct_pool_alloc_ext(size, flags, counts,
        init_entry, reset_entry, free_entry, free_pool);
    assert(pool); return pool;
}
static void lifecycle(unsigned flags)
{
    Counts counts = {0}; AVRefStructPool *pool = make_pool(&counts, flags, 1024);
    void *a = av_refstruct_pool_get(pool), *b = av_refstruct_pool_get(pool), *c = av_refstruct_pool_get(pool);
    assert(a && b && c); assert(counts.init == 3);
    void *extra = av_refstruct_ref(a), *old_b = b;
    ((uint8_t *)extra)[0] = 73;
    av_refstruct_unref(&a); assert(!a && counts.reset == 0 && counts.freed == 0);
    assert(((uint8_t *)extra)[0] == 73); /* Live ref never reset/released. */
    av_refstruct_unref(&b); av_refstruct_unref(&c); assert(counts.reset == 2);
    unsigned expected_freed = flags & UNCACHED ? 2 : flags & SINGLE_IDLE ? 1 : 0;
    assert(counts.freed == expected_freed);
    unsigned sequence = within_refstruct_abort_words[2];
    void *d = av_refstruct_pool_get(pool); assert(d);
    if (flags & UNCACHED) { assert(counts.init == 4); assert(within_refstruct_abort_words[2] == sequence + 1); }
    else { assert(counts.init == 3); assert(within_refstruct_abort_words[2] == sequence); }
    if ((flags & SINGLE_IDLE) && !(flags & UNCACHED)) assert(d == old_b);
    av_refstruct_unref(&extra); assert(counts.reset == 3);
    av_refstruct_unref(&d); assert(counts.reset == 4);
    if ((flags & SINGLE_IDLE) && !(flags & UNCACHED)) assert(counts.init - counts.freed == 1);
    av_refstruct_pool_uninit(&pool); assert(!pool && counts.pool_freed == 1 && counts.init == counts.freed);
}
int main(void)
{
    assert(within_hevc_auxiliary_pool_flags(AV_CODEC_ID_HEVC, 1, 0) == SINGLE_IDLE);
    enum AVCodecID codecs[] = { AV_CODEC_ID_HEVC, AV_CODEC_ID_H264, AV_CODEC_ID_MPEG2VIDEO, AV_CODEC_ID_NONE };
    int threads[] = { -1, 0, 1, 2, 16 }; unsigned selectors = 0;
    for (unsigned i = 0; i < 4; i++) for (unsigned j = 0; j < 5; j++) for (int encoder = 0; encoder < 2; encoder++) {
        unsigned expected = codecs[i] == AV_CODEC_ID_HEVC && threads[j] == 1 && !encoder ? SINGLE_IDLE : 0;
        assert(within_hevc_auxiliary_pool_flags(codecs[i], threads[j], encoder) == expected); selectors++;
    }
    lifecycle(0); lifecycle(UNCACHED); lifecycle(SINGLE_IDLE); lifecycle(SINGLE_IDLE | UNCACHED);
    /* Uninit flushes only idle entry; outstanding multiply-referenced entry survives. */
    Counts delayed = {0}; AVRefStructPool *pool = make_pool(&delayed, SINGLE_IDLE, 1024);
    void *live = av_refstruct_pool_get(pool), *alias = av_refstruct_ref(live), *idle = av_refstruct_pool_get(pool);
    av_refstruct_unref(&idle); av_refstruct_pool_uninit(&pool);
    assert(!pool && delayed.freed == 1 && delayed.pool_freed == 0);
    av_refstruct_unref(&live); assert(delayed.reset == 1 && delayed.freed == 1);
    av_refstruct_unref(&alias); assert(delayed.reset == 2 && delayed.freed == 2 && delayed.pool_freed == 1);
    /* Upstream reset/free-on-init-error semantics retained. */
    Counts error = { .fail_init = 1 };
    pool = make_pool(&error, SINGLE_IDLE | AV_REFSTRUCT_POOL_FLAG_RESET_ON_INIT_ERROR | AV_REFSTRUCT_POOL_FLAG_FREE_ON_INIT_ERROR, 1024);
    assert(!av_refstruct_pool_get(pool)); assert(error.init == 1 && error.reset == 1 && error.freed == 1);
    av_refstruct_pool_uninit(&pool); assert(error.pool_freed == 1);
    /* Preserve zero-on-every-get flag. */
    Counts zero = {0}; pool = make_pool(&zero, SINGLE_IDLE | AV_REFSTRUCT_POOL_FLAG_ZERO_EVERY_TIME, 1024);
    void *entry = av_refstruct_pool_get(pool); assert(entry); ((uint8_t *)entry)[17] = 91;
    av_refstruct_unref(&entry); entry = av_refstruct_pool_get(pool); assert(entry && ((uint8_t *)entry)[17] == 0);
    av_refstruct_unref(&entry); av_refstruct_pool_uninit(&pool); assert(zero.init == 1 && zero.freed == 1);
    /* Original late payload class:200000 reuses, exactly ONE fresh allocation. */
    Counts reuse = {0}; pool = make_pool(&reuse, SINGLE_IDLE, 1163520);
    unsigned before = within_refstruct_abort_words[2]; void *first_address = NULL;
    for (unsigned i = 0; i < 200000; i++) {
        entry = av_refstruct_pool_get(pool); assert(entry);
        if (!i) first_address = entry; else assert(entry == first_address);
        ((uint8_t *)entry)[0] = (uint8_t)i; av_refstruct_unref(&entry);
        assert(reuse.init == 1 && reuse.freed == 0 && reuse.reset == i + 1);
    }
    assert(within_refstruct_abort_words[2] == before + 1);
    av_refstruct_pool_uninit(&pool); assert(reuse.freed == 1 && reuse.pool_freed == 1);
    puts("{\"status\":\"passed\",\"scope\":\"actual-wasm32-libavutil-single-idle-lifecycle-not-conversion\","
         "\"selectorConfigurations\":40,\"policyConfigurations\":4,\"latePayloadBytes\":1163520,"
         "\"sequentialReuses\":200000,\"sequentialFreshAllocations\":1,\"maximumIdleEntriesPerSelectedPool\":1,"
         "\"liveReferencesUnchanged\":true,\"uninitWithLiveReferencesPassed\":true,\"initErrorPassed\":true,"
         "\"zeroEveryTimePassed\":true,\"conversionsPerformed\":0}");
    assert(selectors == 40); return 0;
}

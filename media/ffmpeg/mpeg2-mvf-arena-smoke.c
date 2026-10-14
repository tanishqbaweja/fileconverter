/* Compile the actual patched refstruct implementation against pinned libavutil.
 * Allocation seams observe this implementation only; no substitute pool model. */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <libavutil/mem.h>
#include <libavutil/refstruct.h>

static void *owned[32];
static unsigned allocation_calls, free_calls, fail_call;
static void *observe_malloc(size_t size)
{
    void *ptr;
    allocation_calls++;
    if (allocation_calls == fail_call) return NULL;
    ptr = av_malloc(size);
    if (ptr) {
        unsigned i;
        for (i = 0; i < 32 && owned[i]; i++) {}
        assert(i < 32); owned[i] = ptr;
    }
    return ptr;
}
static void observe_free(void *ptr)
{
    if (ptr) {
        unsigned i;
        for (i = 0; i < 32 && owned[i] != ptr; i++) {}
        assert(i < 32); owned[i] = NULL; free_calls++;
    }
    av_free(ptr);
}
#define av_malloc observe_malloc
#define av_free observe_free
#include "libavutil/refstruct.c"
#undef av_malloc
#undef av_free

#define FLAGS (WITHIN_HEVC_MVF_ARENA | WITHIN_HEVC_POOL_SINGLE_IDLE)
typedef struct Counts { unsigned init, reset, freed, closed; int fail_init; } Counts;
static int init_entry(AVRefStructOpaque opaque, void *object)
{
    Counts *c = opaque.nc; c->init++;
    assert(((uint8_t *)object)[0] == 0);
    return c->fail_init ? -12 : 0;
}
static void reset_entry(AVRefStructOpaque opaque, void *object)
{
    Counts *c = opaque.nc; c->reset++; (void)object;
}
static void free_entry(AVRefStructOpaque opaque, void *object)
{
    Counts *c = opaque.nc; c->freed++; (void)object;
}
static void free_pool(AVRefStructOpaque opaque) { ((Counts *)opaque.nc)->closed++; }
static AVRefStructPool *make_pool(Counts *c, unsigned flags, size_t size)
{
    return av_refstruct_pool_alloc_ext(size, flags, c, init_entry, reset_entry, free_entry, free_pool);
}
static unsigned active_allocations(void)
{
    unsigned n = 0; for (unsigned i = 0; i < 32; i++) n += owned[i] != NULL; return n;
}
static int in_arena(AVRefStructPool *pool, void *object)
{
    uintptr_t raw = (uintptr_t)get_refcount(object), base = (uintptr_t)pool->within_mvf_arena;
    return pool->within_mvf_arena && raw >= base && raw - base < pool->within_mvf_stride * 6;
}
int main(void)
{
    assert(sizeof(size_t) == 4 && REFCOUNT_OFFSET == 16);
    Counts c = {0}; unsigned before = allocation_calls;
    AVRefStructPool *pool = make_pool(&c, FLAGS, 1163520);
    assert(pool && pool->within_mvf_arena && pool->within_mvf_stride == 1163536);
    assert(pool->within_mvf_stride * 6 == 6981216);
    assert(allocation_calls == before + 2); /* Header + raw arena, not six payload mallocs. */
    void *entries[7];
    for (unsigned i = 0; i < 7; i++) {
        entries[i] = av_refstruct_pool_get(pool); assert(entries[i]);
        assert(((uintptr_t)entries[i] & 15) == 0);
        assert(in_arena(pool, entries[i]) == (i < 6));
        memset(entries[i], (int)(i + 1), 1163520);
        for (unsigned j = 0; j < i; j++) assert(entries[i] != entries[j]);
    }
    assert(pool->within_mvf_used == 63 && allocation_calls == before + 3);
    void *alias = av_refstruct_ref(entries[0]);
    av_refstruct_unref(&entries[0]); assert(c.reset == 0 && pool->within_mvf_used == 63);
    for (unsigned i = 1; i < 7; i++) av_refstruct_unref(&entries[i]);
    assert(c.reset == 6 && c.freed == 5 && pool->within_mvf_used == 3);
    for (unsigned i = 0; i < 1163520; i++) assert(((uint8_t *)alias)[i] == 1);
    entries[1] = av_refstruct_pool_get(pool); entries[2] = av_refstruct_pool_get(pool);
    assert(entries[1] && entries[2] && entries[1] != alias && entries[2] != alias);
    assert(in_arena(pool, entries[1]) && in_arena(pool, entries[2]));
    assert(allocation_calls == before + 3);
    av_refstruct_unref(&entries[1]); av_refstruct_unref(&entries[2]);
    av_refstruct_pool_uninit(&pool); assert(!pool && c.closed == 0);
    assert(active_allocations() == 2); /* Both backing blocks await final live alias. */
    assert(((uint8_t *)alias)[1163519] == 1);
    av_refstruct_unref(&alias); assert(c.closed == 1 && c.init == c.freed);
    assert(active_allocations() == 0);

    /* Constructor failures must not consume caller opaque ownership. */
    for (unsigned stage = 1; stage <= 2; stage++) {
        Counts failure = {0}; fail_call = allocation_calls + stage;
        assert(!make_pool(&failure, FLAGS, 1024)); fail_call = 0;
        assert(failure.closed == 0 && failure.init == 0 && active_allocations() == 0);
    }
    /* All reset/free-on-init-error combinations release the raw slot, not arena. */
    for (unsigned bits = 0; bits < 4; bits++) {
        Counts failure = { .fail_init = 1 };
        unsigned flags = FLAGS | ((bits & 1) ? AV_REFSTRUCT_POOL_FLAG_RESET_ON_INIT_ERROR : 0)
                               | ((bits & 2) ? AV_REFSTRUCT_POOL_FLAG_FREE_ON_INIT_ERROR : 0);
        pool = make_pool(&failure, flags, 1024); assert(pool);
        for (unsigned i = 0; i < 10; i++) {
            assert(!av_refstruct_pool_get(pool)); assert(!pool->within_mvf_used);
        }
        assert(failure.reset == ((bits & 1) ? 10u : 0u));
        assert(failure.freed == ((bits & 2) ? 10u : 0u));
        failure.fail_init = 0; void *entry = av_refstruct_pool_get(pool); assert(entry);
        av_refstruct_unref(&entry); av_refstruct_pool_uninit(&pool);
        assert(failure.closed == 1 && active_allocations() == 0);
    }
    Counts zero = {0}; pool = make_pool(&zero, FLAGS | AV_REFSTRUCT_POOL_FLAG_ZERO_EVERY_TIME, 1024);
    assert(pool); void *entry = av_refstruct_pool_get(pool); assert(entry);
    memset(entry, 91, 1024); av_refstruct_unref(&entry);
    entry = av_refstruct_pool_get(pool); assert(entry);
    for (unsigned i = 0; i < 1024; i++) assert(((uint8_t *)entry)[i] == 0);
    av_refstruct_unref(&entry); av_refstruct_pool_uninit(&pool); assert(active_allocations() == 0);

    /* Untagged and oversized pools preserve upstream allocation/size behavior. */
    for (unsigned kind = 0; kind < 2; kind++) {
        Counts original = {0}; size_t size = kind ? 1398112 : 1024;
        pool = make_pool(&original, kind ? FLAGS : WITHIN_HEVC_POOL_SINGLE_IDLE, size);
        assert(pool && !pool->within_mvf_arena);
        entry = av_refstruct_pool_get(pool); assert(entry);
        ((uint8_t *)entry)[size - 1] = 77; assert(((uint8_t *)entry)[size - 1] == 77);
        av_refstruct_unref(&entry); av_refstruct_pool_uninit(&pool); assert(active_allocations() == 0);
    }
    Counts reuse = {0}; before = allocation_calls; pool = make_pool(&reuse, FLAGS, 1163520); assert(pool);
    void *first = NULL;
    for (unsigned i = 0; i < 200000; i++) {
        entry = av_refstruct_pool_get(pool); assert(entry);
        if (!i) first = entry; else assert(entry == first);
        ((uint8_t *)entry)[0] = (uint8_t)i; av_refstruct_unref(&entry);
    }
    assert(allocation_calls == before + 2 && reuse.init == 1 && reuse.reset == 200000);
    av_refstruct_pool_uninit(&pool); assert(active_allocations() == 0);
    assert(free_calls + 2 == allocation_calls); /* Exactly two injected malloc failures. */
    puts("{\"status\":\"passed\",\"scope\":\"actual-wasm32-mvf-arena-refstruct-not-conversion\","
         "\"maximumRawSlots\":6,\"maximumReservedBytes\":8388608,\"measuredPayloadBytes\":1163520,"
         "\"measuredReservedBytes\":6981216,\"sequentialReuses\":200000,\"constructorFailureCases\":2,"
         "\"initErrorFlagCases\":4,\"overflowPreserved\":true,\"liveAliasesPreserved\":true,"
         "\"deferredClosePassed\":true,\"zeroEveryTimePassed\":true,\"nonselectedAndOversizeUnchanged\":true,"
         "\"ownedAllocationsBalanced\":true,\"conversionsPerformed\":0,\"conversionSpeedGainProven\":false}");
    return 0;
}

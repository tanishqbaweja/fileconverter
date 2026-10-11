/* Synthetic dispatch only. Mock allocator failures are not real media OOMs. */
#include <assert.h>
#include <errno.h>
#include <setjmp.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
static _Alignas(16) unsigned char arena[32];
static void *next_pointer, *freed;
static int malloc_calls, free_calls, upstream_calls, upstream_error, abort_stage;
static size_t malloc_bytes, upstream_bytes, upstream_alignment;
static jmp_buf abort_jump;
static void *mock_malloc(size_t bytes)
{
    malloc_calls++; malloc_bytes = bytes;
    if (abort_stage == 1) longjmp(abort_jump, 1);
    return next_pointer;
}
static void mock_free(void *pointer) { free_calls++; freed = pointer; }
static int mock_upstream(void **pointer, size_t alignment, size_t bytes)
{
    upstream_calls++; upstream_alignment = alignment; upstream_bytes = bytes;
    if (abort_stage == 4) longjmp(abort_jump, 4);
    if (upstream_error) return upstream_error;
    *pointer = arena + 16;
    return 0;
}
#define WITHIN_ATTEMPT_MALLOC mock_malloc
#define WITHIN_ATTEMPT_FREE mock_free
#define WITHIN_ATTEMPT_UPSTREAM mock_upstream
#include "mpeg2-allocation-attempt.c"
static void reset(void)
{
    next_pointer = arena; freed = NULL;
    malloc_calls = free_calls = upstream_calls = upstream_error = abort_stage = 0;
    malloc_bytes = upstream_bytes = upstream_alignment = 0;
}
static void complete(int result, size_t bytes)
{
    assert(within_allocator_attempt_words[0] == ATTEMPT_MAGIC);
    assert(within_allocator_attempt_words[1] == ATTEMPT_VERSION);
    assert(within_allocator_attempt_words[3] == WRAPPER_COMPLETED);
    assert(within_allocator_attempt_words[5] == (uint32_t)bytes);
    assert(within_allocator_attempt_words[12] == (uint32_t)result);
    assert(within_allocator_attempt_words[13] == 1);
    assert(within_allocator_attempt_words[14] == 0 && within_allocator_attempt_words[15] == 0);
}
#ifdef __EMSCRIPTEN__
EM_JS(void, within_assert_allocator_attempt_binding, (uintptr_t address), {
    if (Module["withinAllocatorAttemptAddress"] !== address || Module["withinAllocatorAttemptWords"] !== 16)
        throw new Error("Actual constructor slot binding failed");
});
#endif
int main(void)
{
    void *pointer;
    reset(); pointer = NULL;
    assert(__wrap_posix_memalign(&pointer, 16, 1597463) == 0);
    assert(pointer == arena && malloc_bytes == 1597463 && malloc_calls == 1 && upstream_calls == 0 && free_calls == 0);
    complete(0, 1597463);
    reset(); next_pointer = arena + 8; pointer = NULL;
    assert(__wrap_posix_memalign(&pointer, 16, 1597463) == 0);
    assert(pointer == arena + 16 && freed == arena + 8 && malloc_calls == 1 && free_calls == 1 && upstream_calls == 1);
    assert(upstream_alignment == 16 && upstream_bytes == 1597463 && within_allocator_attempt_words[10] == 1);
    complete(0, 1597463);
    reset(); pointer = NULL;
    assert(__wrap_posix_memalign(&pointer, 32, 1597463) == 0);
    assert(malloc_calls == 0 && free_calls == 0 && upstream_calls == 1 && upstream_alignment == 32);
    complete(0, 1597463);
    reset(); pointer = NULL;
    assert(__wrap_posix_memalign(&pointer, 16, 128) == 0);
    assert(malloc_calls == 0 && upstream_calls == 1 && upstream_bytes == 128);
    complete(0, 128);
    reset(); next_pointer = NULL; upstream_error = ENOMEM; pointer = arena + 1;
    assert(__wrap_posix_memalign(&pointer, 16, 1597463) == ENOMEM);
    assert(pointer == arena + 1 && malloc_calls == 1 && free_calls == 0 && upstream_calls == 1);
    complete(ENOMEM, 1597463);
    reset(); next_pointer = arena + 8; upstream_error = ENOMEM; pointer = arena + 1;
    assert(__wrap_posix_memalign(&pointer, 16, 1597463) == ENOMEM);
    assert(pointer == arena + 1 && free_calls == 1 && upstream_calls == 1);
    complete(ENOMEM, 1597463);
    reset(); abort_stage = 1;
    if (!setjmp(abort_jump)) {
        __wrap_posix_memalign(&pointer, 16, 1597463);
        assert(0 && "Expected synthetic fast allocation abort");
    }
    assert(within_allocator_attempt_words[3] == FAST_MALLOC_PENDING);
    assert(within_allocator_attempt_words[5] == 1597463 && within_allocator_attempt_words[13] == 0);
    assert(malloc_calls == 1 && upstream_calls == 0 && free_calls == 0);
    reset(); next_pointer = arena + 8; abort_stage = 4;
    if (!setjmp(abort_jump)) {
        __wrap_posix_memalign(&pointer, 16, 1597463);
        assert(0 && "Expected synthetic aligned allocation abort");
    }
    assert(within_allocator_attempt_words[3] == UPSTREAM_PENDING && within_allocator_attempt_words[10] == 1);
    assert(within_allocator_attempt_words[5] == 1597463 && within_allocator_attempt_words[13] == 0);
    assert(malloc_calls == 1 && upstream_calls == 1 && free_calls == 1);
    reset(); within_allocator_attempt_words[2] = UINT32_MAX;
    assert(__wrap_posix_memalign(&pointer, 16, 128) == 0);
    assert(within_allocator_attempt_words[2] == UINT32_MAX);
    complete(0, 128);
#ifdef __EMSCRIPTEN__
    within_assert_allocator_attempt_binding((uintptr_t)within_allocator_attempt_words);
#endif
    puts("{\"scope\":\"synthetic-allocator-attempt-dispatch-not-media-oom\",\"cases\":9,\"passed\":9,\"slotBytes\":64,\"failurePhasesObserved\":[1,4],\"originalDispatchPreserved\":true,\"conversionsPerformed\":0}");
    return 0;
}

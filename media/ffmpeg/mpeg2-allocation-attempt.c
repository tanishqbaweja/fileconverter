/* Private diagnostic: exactly one 64-byte scalar slot. No allocation, logging,
 * payload reads, heap growth, reference changes or allocator policy changes.
 * The original wrapper is included unchanged; record BEFORE calls that can abort.
 */
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

#ifndef WITHIN_ATTEMPT_MALLOC
#define WITHIN_ATTEMPT_MALLOC malloc
#define WITHIN_ATTEMPT_FREE free
#define WITHIN_ATTEMPT_UPSTREAM __real_posix_memalign
#endif

int __real_posix_memalign(void **pointer, size_t alignment, size_t bytes);
volatile uint32_t within_allocator_attempt_words[16];
enum { ATTEMPT_MAGIC = 0x414c4c31, ATTEMPT_VERSION = 1 };
enum { FAST_MALLOC_PENDING = 1, FAST_MALLOC_RETURNED = 2,
       FRESH_FREE_PENDING = 3, UPSTREAM_PENDING = 4,
       UPSTREAM_RETURNED = 5, WRAPPER_COMPLETED = 6 };

#ifdef __EMSCRIPTEN__
EM_JS(void, within_bind_allocator_attempt_slot, (uintptr_t address), {
  Module["withinAllocatorAttemptAddress"] = address;
  Module["withinAllocatorAttemptWords"] = 16;
});
__attribute__((constructor))
static void within_allocator_attempt_init(void)
{
    within_bind_allocator_attempt_slot((uintptr_t)within_allocator_attempt_words);
}
#endif

static void *within_attempt_malloc(size_t bytes)
{
    within_allocator_attempt_words[3] = FAST_MALLOC_PENDING;
    void *result = WITHIN_ATTEMPT_MALLOC(bytes);
    uint64_t address = (uint64_t)(uintptr_t)result;
    within_allocator_attempt_words[7] = (uint32_t)address;
    within_allocator_attempt_words[8] = (uint32_t)(address >> 32);
    within_allocator_attempt_words[9] = (uint32_t)(address & 15);
    within_allocator_attempt_words[3] = FAST_MALLOC_RETURNED;
    return result;
}
static void within_attempt_free(void *pointer)
{
    within_allocator_attempt_words[10] = 1;
    within_allocator_attempt_words[3] = FRESH_FREE_PENDING;
    WITHIN_ATTEMPT_FREE(pointer);
}
static int within_attempt_upstream(void **pointer, size_t alignment, size_t bytes)
{
    within_allocator_attempt_words[3] = UPSTREAM_PENDING;
    int result = WITHIN_ATTEMPT_UPSTREAM(pointer, alignment, bytes);
    within_allocator_attempt_words[11] = (uint32_t)result;
    within_allocator_attempt_words[3] = UPSTREAM_RETURNED;
    return result;
}

#define malloc within_attempt_malloc
#define free within_attempt_free
#define __real_posix_memalign within_attempt_upstream
#define __wrap_posix_memalign within_preserved_posix_memalign
#include "mpeg2-aligned-reuse.c"
#undef malloc
#undef free
#undef __real_posix_memalign
#undef __wrap_posix_memalign

int __wrap_posix_memalign(void **pointer, size_t alignment, size_t bytes)
{
    uint32_t sequence = within_allocator_attempt_words[2];
    for (unsigned i = 0; i < 16; i++) within_allocator_attempt_words[i] = 0;
    within_allocator_attempt_words[1] = ATTEMPT_VERSION;
    within_allocator_attempt_words[2] = sequence == UINT32_MAX ? sequence : sequence + 1;
    within_allocator_attempt_words[4] = (uint32_t)alignment;
    within_allocator_attempt_words[5] = (uint32_t)bytes;
    within_allocator_attempt_words[6] = (uint32_t)((uint64_t)bytes >> 32);
    within_allocator_attempt_words[0] = ATTEMPT_MAGIC;
    int result = within_preserved_posix_memalign(pointer, alignment, bytes);
    within_allocator_attempt_words[12] = (uint32_t)result;
    within_allocator_attempt_words[3] = WRAPPER_COMPLETED;
    within_allocator_attempt_words[13] = 1;
    return result;
}

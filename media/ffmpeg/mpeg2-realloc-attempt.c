/* Private fixed scalar diagnostic, not an allocator or conversion change.
 * The decoder is single-threaded. A fatal abort leaves the CURRENT pending
 * slot intact; the browser observer must qualify binary/schema/path first.
 * No allocations, logging, payload inspection or extra buffer references.
 * Pointer words are Wasm32 addresses; host synthetic controls never dereference
 * truncated host pointer words or pretend they are actual Wasm addresses.
 */
#include <stddef.h>
#include <stdint.h>
#ifndef WITHIN_REALLOC_BUFFER_TYPES_DEFINED
#include <libavutil/buffer.h>
#endif
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
_Static_assert(sizeof(size_t) == 4 && sizeof(void *) == 4, "Wasm32 diagnostic only");
#endif

int __real_av_buffer_realloc(AVBufferRef **buffer, size_t bytes);
void *__real_av_realloc(void *pointer, size_t bytes);
#ifndef WITHIN_REALLOC_REAL_BUFFER
#define WITHIN_REALLOC_REAL_BUFFER __real_av_buffer_realloc
#define WITHIN_REALLOC_REAL_CALL __real_av_realloc
#endif

/* [0]magic [1]version [2]sequence [3]phase [4]outer-AVBuffer scope
 * [5:6]outer requested size [7]old AVBufferRef [8]old data [9:10]old size
 * [11]old refcount [12]av_realloc pointer [13:14]av_realloc requested size
 * [15]returned pointer/direct, or final AVBuffer return code; ZERO pending.
 * Size values are argument bytes, not allocator chunk/heap extent bytes.
 */
volatile uint32_t within_realloc_attempt_words[16];
_Static_assert(sizeof(within_realloc_attempt_words) == 64, "Fixed one-slot cap");
enum { REALLOC_ATTEMPT_MAGIC = 0x52414c31, REALLOC_ATTEMPT_VERSION = 1 };
enum { BUFFER_REALLOC_PENDING = 1, REALLOC_CALL_PENDING = 2,
       REALLOC_CALL_RETURNED = 3, BUFFER_REALLOC_RETURNED = 4 };

#ifdef __EMSCRIPTEN__
EM_JS(void, within_bind_realloc_attempt_slot, (uintptr_t address), {
    Module["withinReallocAttemptAddress"] = address;
    Module["withinReallocAttemptWords"] = 16;
});
__attribute__((constructor))
static void within_realloc_attempt_init(void)
{
    within_bind_realloc_attempt_slot((uintptr_t)within_realloc_attempt_words);
}
#endif

static void within_realloc_attempt_begin(size_t bytes, uint32_t buffer_scope)
{
    uint32_t sequence = within_realloc_attempt_words[2];
    for (unsigned i = 0; i < 16; i++) within_realloc_attempt_words[i] = 0;
    within_realloc_attempt_words[1] = REALLOC_ATTEMPT_VERSION;
    within_realloc_attempt_words[2] = sequence == UINT32_MAX ? sequence : sequence + 1;
    within_realloc_attempt_words[4] = buffer_scope;
    within_realloc_attempt_words[5] = (uint32_t)bytes;
    within_realloc_attempt_words[6] = (uint32_t)((uint64_t)bytes >> 32);
    within_realloc_attempt_words[0] = REALLOC_ATTEMPT_MAGIC;
}

int __wrap_av_buffer_realloc(AVBufferRef **buffer, size_t bytes)
{
    /* av_buffer_realloc may recurse with a fresh private buffer when the old
     * storage is aliased. Preserve the OUTER owner scalars; the inner real
     * av_realloc still records its current pointer/size in the same slot. */
    uint32_t phase = within_realloc_attempt_words[3];
    if (within_realloc_attempt_words[4] == 1 &&
        (phase == BUFFER_REALLOC_PENDING || phase == REALLOC_CALL_RETURNED))
        return WITHIN_REALLOC_REAL_BUFFER(buffer, bytes);
    within_realloc_attempt_begin(bytes, 1);
    /* Valid upstream arguments remain valid; do not add payload/ref retention. */
    AVBufferRef *old = buffer ? *buffer : NULL;
    if (old) {
        within_realloc_attempt_words[7] = (uint32_t)(uintptr_t)old;
        within_realloc_attempt_words[8] = (uint32_t)(uintptr_t)old->data;
        within_realloc_attempt_words[9] = (uint32_t)old->size;
        within_realloc_attempt_words[10] = (uint32_t)((uint64_t)old->size >> 32);
        within_realloc_attempt_words[11] = (uint32_t)av_buffer_get_ref_count(old);
    }
    within_realloc_attempt_words[3] = BUFFER_REALLOC_PENDING;
    int result = WITHIN_REALLOC_REAL_BUFFER(buffer, bytes);
    within_realloc_attempt_words[15] = (uint32_t)result;
    within_realloc_attempt_words[3] = BUFFER_REALLOC_RETURNED;
    return result;
}

void *__wrap_av_realloc(void *pointer, size_t bytes)
{
    uint32_t phase = within_realloc_attempt_words[3];
    if (!(within_realloc_attempt_words[4] == 1 &&
          (phase == BUFFER_REALLOC_PENDING || phase == REALLOC_CALL_RETURNED)))
        within_realloc_attempt_begin(bytes, 0);
    within_realloc_attempt_words[12] = (uint32_t)(uintptr_t)pointer;
    within_realloc_attempt_words[13] = (uint32_t)bytes;
    within_realloc_attempt_words[14] = (uint32_t)((uint64_t)bytes >> 32);
    within_realloc_attempt_words[15] = 0;
    within_realloc_attempt_words[3] = REALLOC_CALL_PENDING;
    void *result = WITHIN_REALLOC_REAL_CALL(pointer, bytes);
    within_realloc_attempt_words[15] = (uint32_t)(uintptr_t)result;
    within_realloc_attempt_words[3] = REALLOC_CALL_RETURNED;
    return result;
}

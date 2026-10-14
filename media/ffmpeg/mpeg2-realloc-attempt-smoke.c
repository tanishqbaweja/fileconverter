/* Synthetic dispatch ONLY. Not real libavutil, Wasm or original-file OOM. */
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <setjmp.h>
typedef struct AVBufferRef { unsigned char *data; size_t size; unsigned refs; } AVBufferRef;
static int av_buffer_get_ref_count(const AVBufferRef *buffer) { return (int)buffer->refs; }
static unsigned char arena[16], replacement[16];
static int calls, buffer_calls, fail_phase, return_error;
static void *received_pointer;
static size_t received_bytes;
static jmp_buf jump;
static void *mock_realloc(void *pointer, size_t bytes);
static int mock_buffer(AVBufferRef **buffer, size_t bytes);
#define WITHIN_REALLOC_BUFFER_TYPES_DEFINED 1
#define WITHIN_REALLOC_REAL_BUFFER mock_buffer
#define WITHIN_REALLOC_REAL_CALL mock_realloc
#include "mpeg2-realloc-attempt.c"
static void *mock_realloc(void *pointer, size_t bytes)
{
    calls++; received_pointer = pointer; received_bytes = bytes;
    if (fail_phase == 2) longjmp(jump, 2);
    return return_error ? NULL : replacement;
}
static int mock_buffer(AVBufferRef **buffer, size_t bytes)
{
    buffer_calls++;
    if (fail_phase == 1) longjmp(jump, 1);
    void *pointer = __wrap_av_realloc(*buffer ? (*buffer)->data : NULL, bytes);
    if (!pointer) return -12;
    if (*buffer) { (*buffer)->data = pointer; (*buffer)->size = bytes; }
    return 0;
}
static void reset(void)
{
    calls = buffer_calls = fail_phase = return_error = 0;
    received_pointer = NULL; received_bytes = 0;
    for (unsigned i = 0; i < 16; i++) within_realloc_attempt_words[i] = 0;
}
static void schema(unsigned phase)
{
    assert(within_realloc_attempt_words[0] == REALLOC_ATTEMPT_MAGIC);
    assert(within_realloc_attempt_words[1] == 1);
    assert(within_realloc_attempt_words[2] > 0);
    assert(within_realloc_attempt_words[3] == phase);
    assert(sizeof(within_realloc_attempt_words) == 64);
}
int main(void)
{
    AVBufferRef value = { arena, 4096, 3 }, *buffer;
    reset(); assert(__wrap_av_realloc(arena, 32768) == replacement);
    schema(3); assert(calls == 1 && !buffer_calls && received_pointer == arena && received_bytes == 32768);
    assert(within_realloc_attempt_words[4] == 0 && within_realloc_attempt_words[13] == 32768);
    reset(); buffer = &value; assert(__wrap_av_buffer_realloc(&buffer, 8192) == 0);
    schema(4); assert(calls == 1 && buffer_calls == 1 && received_pointer == arena);
    assert(value.data == replacement && value.size == 8192 && value.refs == 3);
    assert(within_realloc_attempt_words[4] == 1 && within_realloc_attempt_words[5] == 8192);
    assert(within_realloc_attempt_words[9] == 4096 && within_realloc_attempt_words[11] == 3);
    reset(); buffer = NULL; assert(__wrap_av_buffer_realloc(&buffer, 273950) == 0);
    schema(4); assert(received_pointer == NULL && received_bytes == 273950);
    assert(within_realloc_attempt_words[7] == 0 && within_realloc_attempt_words[11] == 0);
    reset(); return_error = 1; buffer = &value;
    assert(__wrap_av_buffer_realloc(&buffer, 4096) == -12); schema(4);
    assert(within_realloc_attempt_words[15] == (uint32_t)-12 && value.size == 8192);
    reset(); fail_phase = 2; buffer = &value;
    if (!setjmp(jump)) { __wrap_av_buffer_realloc(&buffer, 273950); assert(0); }
    schema(2); assert(within_realloc_attempt_words[4] == 1 && within_realloc_attempt_words[13] == 273950);
    assert(within_realloc_attempt_words[9] == 8192 && within_realloc_attempt_words[11] == 3 && within_realloc_attempt_words[15] == 0);
    reset(); fail_phase = 1; buffer = &value;
    if (!setjmp(jump)) { __wrap_av_buffer_realloc(&buffer, 1024); assert(0); }
    schema(1); assert(calls == 0 && within_realloc_attempt_words[13] == 0);
    reset(); fail_phase = 2;
    if (!setjmp(jump)) { __wrap_av_realloc(NULL, 330918); assert(0); }
    schema(2); assert(within_realloc_attempt_words[4] == 0 && within_realloc_attempt_words[13] == 330918);
    reset(); within_realloc_attempt_words[2] = UINT32_MAX;
    assert(__wrap_av_realloc(NULL, 0) == replacement); schema(3);
    assert(within_realloc_attempt_words[2] == UINT32_MAX && received_bytes == 0);
    reset(); assert(__wrap_av_buffer_realloc(&buffer, 128) == 0); schema(4);
    assert(__wrap_av_realloc(arena, 64) == replacement); schema(3);
    assert(within_realloc_attempt_words[4] == 0 && within_realloc_attempt_words[7] == 0 && within_realloc_attempt_words[13] == 64);
#ifdef __EMSCRIPTEN__
    /* Production constructor binding itself is checked by the hosted real test. */
#endif
    puts("{\"scope\":\"synthetic-realloc-dispatch-not-real-libavutil-or-media-oom\",\"cases\":9,\"passed\":9,\"slotBytes\":64,\"pendingPhases\":[1,2],\"conversionsPerformed\":0}");
    return 0;
}

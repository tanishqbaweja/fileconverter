/* Real pinned libavutil contract test. Not media or Chromium memory acceptance. */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <libavutil/buffer.h>
#include <libavutil/mem.h>
#ifndef __EMSCRIPTEN__
#error "This real-library control requires actual Wasm and constructor binding"
#endif
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif
extern volatile uint32_t within_realloc_attempt_words[16];
static void completed(void)
{
    assert(within_realloc_attempt_words[0] == 0x52414c31);
    assert(within_realloc_attempt_words[1] == 1);
    assert(within_realloc_attempt_words[3] == 4);
    assert(within_realloc_attempt_words[15] == 0);
}
#ifdef __EMSCRIPTEN__
EM_JS(void, within_assert_realloc_binding, (uintptr_t address), {
    if (Module["withinReallocAttemptAddress"] !== address || Module["withinReallocAttemptWords"] !== 16)
        throw new Error("Actual realloc slot constructor binding mismatch");
});
#endif
int main(void)
{
    AVBufferRef *buffer = NULL;
    assert(av_buffer_realloc(&buffer, 4096) == 0); completed();
    assert(within_realloc_attempt_words[5] == 4096 && within_realloc_attempt_words[13] == 4096);
    assert(within_realloc_attempt_words[7] == 0 && within_realloc_attempt_words[12] == 0);
    memset(buffer->data, 0x5a, buffer->size);
    uint8_t *old = buffer->data;
    assert(av_buffer_realloc(&buffer, 8192) == 0); completed();
    assert(within_realloc_attempt_words[9] == 4096 && within_realloc_attempt_words[11] == 1);
    assert(within_realloc_attempt_words[12] == (uint32_t)(uintptr_t)old);
    for (unsigned i = 0; i < 4096; i++) assert(buffer->data[i] == 0x5a);
    AVBufferRef *alias = av_buffer_ref(buffer); assert(alias);
    old = alias->data;
    assert(av_buffer_realloc(&buffer, 16384) == 0); completed();
    assert(within_realloc_attempt_words[9] == 8192 && within_realloc_attempt_words[11] == 2);
    assert(within_realloc_attempt_words[12] == 0 && buffer->data != alias->data && alias->data == old);
    for (unsigned i = 0; i < 4096; i++) assert(buffer->data[i] == 0x5a && alias->data[i] == 0x5a);
    av_buffer_unref(&alias);
    assert(av_buffer_realloc(&buffer, 2048) == 0); completed();
    for (unsigned i = 0; i < 2048; i++) assert(buffer->data[i] == 0x5a);
    assert(av_buffer_realloc(&buffer, 2048) == 0); completed();
    assert(within_realloc_attempt_words[13] == 0); // No allocator call for equal size.
    av_buffer_unref(&buffer); assert(buffer == NULL);
    void *pointer = av_realloc(NULL, 1024); assert(pointer);
    assert(within_realloc_attempt_words[4] == 0 && within_realloc_attempt_words[3] == 3 && within_realloc_attempt_words[13] == 1024);
    av_free(pointer);
#ifdef __EMSCRIPTEN__
    within_assert_realloc_binding((uintptr_t)within_realloc_attempt_words);
#endif
    puts("{\"scope\":\"actual-libavutil-realloc-lifetime-not-conversion\",\"cases\":6,\"passed\":6,\"slotBytes\":64,\"aliasContentPreserved\":true,\"constructorBindingVerified\":true,\"conversionsPerformed\":0}");
    return 0;
}

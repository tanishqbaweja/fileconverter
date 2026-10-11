/* Genuine Wasm allocation contracts. No media conversion or acceptance claim. */
#define _POSIX_C_SOURCE 200112L
#include <assert.h>
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten/heap.h>
extern volatile uint32_t within_allocator_attempt_words[16];
int main(void)
{
    const size_t sizes[] = {0, 1, 7, 8, 15, 16, 17, 262144, 1597463};
    unsigned cases = 0;
    assert(emscripten_get_heap_size() == 33554432);
    for (unsigned i = 0; i < sizeof(sizes) / sizeof(sizes[0]); ++i) {
        size_t bytes = sizes[i];
        unsigned char *p = malloc(bytes);
        assert(p && ((uintptr_t)p & 15) == 0);
        memset(p, 0x5a, bytes);
        for (size_t j = 0; j < bytes; ++j) assert(p[j] == 0x5a);
        free(p); ++cases;
    }
    unsigned char *p = calloc(257, 3); assert(p && ((uintptr_t)p & 15) == 0);
    for (unsigned i = 0; i < 771; ++i) assert(p[i] == 0);
    memset(p, 0x37, 771); p = realloc(p, 262144); assert(p && ((uintptr_t)p & 15) == 0);
    for (unsigned i = 0; i < 771; ++i) assert(p[i] == 0x37);
    free(p); cases += 2;
    void *aligned = NULL;
    assert(posix_memalign(&aligned, 16, 1597463) == 0);
    assert(aligned && ((uintptr_t)aligned & 15) == 0);
    assert(within_allocator_attempt_words[3] == 6);
    assert(within_allocator_attempt_words[5] == 1597463);
    assert(within_allocator_attempt_words[7] == (uintptr_t)aligned);
    assert(within_allocator_attempt_words[9] == 0);
    assert(within_allocator_attempt_words[10] == 0); /* No rejected fresh pointer. */
    memset(aligned, 0x48, 1597463); free(aligned); ++cases;
    assert(posix_memalign(&aligned, 32, 1024) == 0);
    assert(((uintptr_t)aligned & 31) == 0); free(aligned); ++cases;
    assert(emscripten_get_heap_size() == 33554432);
    printf("{\"cases\":%u,\"passed\":%u,\"mallocAlignment\":16,\"observedRequestBytes\":1597463,\"largeWrapperRejectedFreshPointer\":false,\"heapBytes\":33554432,\"conversionsPerformed\":0}\n", cases, cases);
    return 0;
}

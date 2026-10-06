/* Synthetic allocator dispatch only. No FFmpeg/media/Wasm/source video. */
#include <assert.h>
#include <errno.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
static _Alignas(16) unsigned char arena[32];
static void *next_malloc;
static int malloc_calls, free_calls, upstream_calls, upstream_error;
static size_t requested, upstream_alignment, upstream_bytes;
static void *freed;
static void *mock_malloc(size_t bytes) { malloc_calls++; requested = bytes; return next_malloc; }
static void mock_free(void *pointer) { free_calls++; freed = pointer; }
static int mock_upstream(void **pointer, size_t alignment, size_t bytes) {
    upstream_calls++; upstream_alignment = alignment; upstream_bytes = bytes;
    if (upstream_error) return upstream_error;
    *pointer = arena + 16; return 0;
}
#define malloc mock_malloc
#define free mock_free
#define __real_posix_memalign mock_upstream
#include "mpeg2-aligned-reuse.c"
#undef malloc
#undef free
#undef __real_posix_memalign
static void reset(void) {
    malloc_calls = free_calls = upstream_calls = upstream_error = 0;
    requested = upstream_alignment = upstream_bytes = 0; freed = NULL; next_malloc = arena;
}
int main(void) {
    void *pointer;
    reset(); pointer = NULL;
    assert(__wrap_posix_memalign(&pointer, 16, 1597463) == 0);
    assert(pointer == arena && ((uintptr_t)pointer & 15) == 0 && requested == 1597463);
    assert(malloc_calls == 1 && free_calls == 0 && upstream_calls == 0);
    reset(); next_malloc = arena + 8; pointer = NULL;
    assert(__wrap_posix_memalign(&pointer, 16, 1597463) == 0);
    assert(free_calls == 1 && freed == arena + 8 && upstream_calls == 1 && pointer == arena + 16);
    assert(upstream_alignment == 16 && upstream_bytes == 1597463);
    reset(); pointer = NULL;
    assert(__wrap_posix_memalign(&pointer, 32, 1597463) == 0);
    assert(malloc_calls == 0 && free_calls == 0 && upstream_calls == 1 && upstream_alignment == 32);
    reset(); pointer = NULL;
    assert(__wrap_posix_memalign(&pointer, 16, 128) == 0);
    assert(malloc_calls == 0 && upstream_calls == 1 && upstream_bytes == 128);
    reset(); next_malloc = NULL; upstream_error = ENOMEM; pointer = arena + 1;
    assert(__wrap_posix_memalign(&pointer, 16, 1597463) == ENOMEM);
    assert(pointer == arena + 1 && malloc_calls == 1 && free_calls == 0 && upstream_calls == 1);
    reset(); next_malloc = arena + 8; upstream_error = ENOMEM; pointer = arena + 1;
    assert(__wrap_posix_memalign(&pointer, 16, 1597463) == ENOMEM);
    assert(pointer == arena + 1 && free_calls == 1 && freed == arena + 8 && upstream_calls == 1);
    puts("{\"scope\":\"synthetic-allocator-dispatch-only-no-media-no-browser\",\"cases\":6,\"passed\":6,\"alignment\":16,\"minimumBytes\":262144,\"conversionsPerformed\":0}");
    return 0;
}

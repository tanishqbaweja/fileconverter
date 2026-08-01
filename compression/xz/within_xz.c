#include <emscripten/emscripten.h>
#include <lzma.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#ifndef WITHIN_XZ_DECODER_MEMORY_LIMIT
#define WITHIN_XZ_DECODER_MEMORY_LIMIT (32ULL * 1024ULL * 1024ULL)
#endif

typedef struct {
  lzma_stream stream;
  int decompress;
  int finished;
  int last_consumed;
  int last_produced;
} WithinXz;

EMSCRIPTEN_KEEPALIVE
uintptr_t within_xz_create(int decompress) {
  WithinXz *context = (WithinXz *)calloc(1, sizeof(WithinXz));
  if (!context) return 0;

  lzma_stream initialized = LZMA_STREAM_INIT;
  context->stream = initialized;
  context->decompress = decompress != 0;
  lzma_ret result;
#ifdef WITHIN_XZ_DECODER_ONLY
  if (!context->decompress) {
    free(context);
    return 0;
  }
  result = lzma_stream_decoder(&context->stream,
                               WITHIN_XZ_DECODER_MEMORY_LIMIT,
                               LZMA_FAIL_FAST);
#else
  result = context->decompress
               ? lzma_stream_decoder(&context->stream,
                                     WITHIN_XZ_DECODER_MEMORY_LIMIT,
                                     LZMA_FAIL_FAST)
               : lzma_easy_encoder(&context->stream, 0, LZMA_CHECK_CRC64);
#endif
  if (result != LZMA_OK) {
    free(context);
    return 0;
  }
  return (uintptr_t)context;
}

EMSCRIPTEN_KEEPALIVE
int within_xz_process(uintptr_t handle, const uint8_t *input,
                      int input_length, int finish, uint8_t *output,
                      int output_capacity) {
  WithinXz *context = (WithinXz *)handle;
  if (!context || input_length < 0 || output_capacity <= 0 ||
      (input_length > 0 && !input) || !output || context->finished) {
    return LZMA_PROG_ERROR;
  }

  context->stream.next_in = input;
  context->stream.avail_in = (size_t)input_length;
  context->stream.next_out = output;
  context->stream.avail_out = (size_t)output_capacity;

  lzma_ret result = lzma_code(&context->stream,
                              finish ? LZMA_FINISH : LZMA_RUN);
  context->last_consumed =
      input_length - (int)context->stream.avail_in;
  context->last_produced =
      output_capacity - (int)context->stream.avail_out;
  if (result == LZMA_STREAM_END) context->finished = 1;
  return result;
}

EMSCRIPTEN_KEEPALIVE
int within_xz_last_consumed(uintptr_t handle) {
  WithinXz *context = (WithinXz *)handle;
  return context ? context->last_consumed : 0;
}

EMSCRIPTEN_KEEPALIVE
int within_xz_last_produced(uintptr_t handle) {
  WithinXz *context = (WithinXz *)handle;
  return context ? context->last_produced : 0;
}

EMSCRIPTEN_KEEPALIVE
int within_xz_finished(uintptr_t handle) {
  WithinXz *context = (WithinXz *)handle;
  return context ? context->finished : 0;
}

EMSCRIPTEN_KEEPALIVE
uint64_t within_xz_memusage(uintptr_t handle) {
  WithinXz *context = (WithinXz *)handle;
  return context ? lzma_memusage(&context->stream) : 0;
}

EMSCRIPTEN_KEEPALIVE
void within_xz_destroy(uintptr_t handle) {
  WithinXz *context = (WithinXz *)handle;
  if (!context) return;
  lzma_end(&context->stream);
  memset(context, 0, sizeof(*context));
  free(context);
}

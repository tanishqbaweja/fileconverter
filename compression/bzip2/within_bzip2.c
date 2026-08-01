#include <bzlib.h>
#include <emscripten/emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  bz_stream stream;
  int decompress;
  int finished;
  int last_consumed;
  int last_produced;
} WithinBzip2;

void bz_internal_error(int error_code) {
  (void)error_code;
  abort();
}

EMSCRIPTEN_KEEPALIVE
uintptr_t within_bzip2_create(int decompress) {
  WithinBzip2 *context = (WithinBzip2 *)calloc(1, sizeof(WithinBzip2));
  if (!context) return 0;

  context->decompress = decompress != 0;
  int result = context->decompress
                   ? BZ2_bzDecompressInit(&context->stream, 0, 0)
                   : BZ2_bzCompressInit(&context->stream, 1, 0, 30);
  if (result != BZ_OK) {
    free(context);
    return 0;
  }
  return (uintptr_t)context;
}

EMSCRIPTEN_KEEPALIVE
int within_bzip2_process(uintptr_t handle, const uint8_t *input,
                         int input_length, int finish, uint8_t *output,
                         int output_capacity) {
  WithinBzip2 *context = (WithinBzip2 *)handle;
  if (!context || input_length < 0 || output_capacity <= 0 ||
      (input_length > 0 && !input) || !output || context->finished) {
    return BZ_PARAM_ERROR;
  }

  context->stream.next_in = (char *)input;
  context->stream.avail_in = (unsigned int)input_length;
  context->stream.next_out = (char *)output;
  context->stream.avail_out = (unsigned int)output_capacity;

  int result = context->decompress
                   ? BZ2_bzDecompress(&context->stream)
                   : BZ2_bzCompress(&context->stream,
                                    finish ? BZ_FINISH : BZ_RUN);
  context->last_consumed = input_length - (int)context->stream.avail_in;
  context->last_produced =
      output_capacity - (int)context->stream.avail_out;
  if (result == BZ_STREAM_END) context->finished = 1;

  if (context->decompress && finish && result == BZ_OK &&
      context->last_consumed == 0 && context->last_produced == 0) {
    return BZ_UNEXPECTED_EOF;
  }
  return result;
}

EMSCRIPTEN_KEEPALIVE
int within_bzip2_last_consumed(uintptr_t handle) {
  WithinBzip2 *context = (WithinBzip2 *)handle;
  return context ? context->last_consumed : 0;
}

EMSCRIPTEN_KEEPALIVE
int within_bzip2_last_produced(uintptr_t handle) {
  WithinBzip2 *context = (WithinBzip2 *)handle;
  return context ? context->last_produced : 0;
}

EMSCRIPTEN_KEEPALIVE
int within_bzip2_finished(uintptr_t handle) {
  WithinBzip2 *context = (WithinBzip2 *)handle;
  return context ? context->finished : 0;
}

EMSCRIPTEN_KEEPALIVE
void within_bzip2_destroy(uintptr_t handle) {
  WithinBzip2 *context = (WithinBzip2 *)handle;
  if (!context) return;
  if (context->decompress) {
    BZ2_bzDecompressEnd(&context->stream);
  } else {
    BZ2_bzCompressEnd(&context->stream);
  }
  memset(context, 0, sizeof(*context));
  free(context);
}

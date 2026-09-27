#include <emscripten.h>
#include <jxl/codestream_header.h>
#include <jxl/decode.h>
#include <jxl/memory_manager.h>

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WITHIN_INPUT_READ (64U * 1024U)
#define WITHIN_INPUT_WINDOW (128U * 1024U)
#define WITHIN_MAX_INSPECTION (1024U * 1024U)
#define WITHIN_MAX_INPUT (64U * 1024U * 1024U)
#define WITHIN_DECODER_ALLOCATION_LIMIT (8U * 1024U * 1024U)
#define WITHIN_SINGLE_ALLOCATION_LIMIT (4U * 1024U * 1024U)

typedef union {
  max_align_t alignment;
  struct {
    size_t size;
  } value;
} within_allocation_header;

typedef struct {
  size_t current;
  size_t peak;
  int rejected;
} within_memory_state;

static char within_error_message[512];
static uint32_t within_width;
static uint32_t within_height;
static uint32_t within_intrinsic_width;
static uint32_t within_intrinsic_height;
static uint32_t within_bits;
static uint32_t within_color_channels;
static uint32_t within_alpha_bits;
static uint32_t within_orientation;
static uint32_t within_has_animation;
static uint32_t within_tps_numerator;
static uint32_t within_tps_denominator;
static uint32_t within_num_loops;
static uint32_t within_have_timecodes;
static uint32_t within_inspected_bytes;
static within_memory_state within_memory;

EM_ASYNC_JS(int, within_jxl_inspector_input_read,
            (uint64_t offset, unsigned char *destination, int length), {
  try {
    return await Module.withinBridge.read(
      Number(offset), HEAPU8.subarray(destination, destination + length));
  } catch (error) {
    Module.withinBridge.message(
      String(error && error.message ? error.message : error));
    return -1;
  }
});

static void within_set_error(const char *message) {
  if (!message) message = "JPEG XL header inspection failed.";
  snprintf(within_error_message, sizeof(within_error_message), "%s", message);
}

static void *within_allocate(void *opaque, size_t size) {
  within_memory_state *state = (within_memory_state *)opaque;
  if (size == 0) size = 1;
  if (size > WITHIN_SINGLE_ALLOCATION_LIMIT ||
      state->current > WITHIN_DECODER_ALLOCATION_LIMIT - size ||
      size > SIZE_MAX - sizeof(within_allocation_header)) {
    state->rejected = 1;
    return NULL;
  }
  within_allocation_header *header =
      (within_allocation_header *)malloc(sizeof(within_allocation_header) + size);
  if (!header) {
    state->rejected = 1;
    return NULL;
  }
  header->value.size = size;
  state->current += size;
  if (state->current > state->peak) state->peak = state->current;
  return (void *)(header + 1);
}

static void within_free(void *opaque, void *address) {
  if (!address) return;
  within_memory_state *state = (within_memory_state *)opaque;
  within_allocation_header *header =
      ((within_allocation_header *)address) - 1;
  if (header->value.size <= state->current) state->current -= header->value.size;
  free(header);
}

EMSCRIPTEN_KEEPALIVE int within_jxl_inspect(uint32_t input_size) {
  memset(within_error_message, 0, sizeof(within_error_message));
  within_width = 0;
  within_height = 0;
  within_intrinsic_width = 0;
  within_intrinsic_height = 0;
  within_bits = 0;
  within_color_channels = 0;
  within_alpha_bits = 0;
  within_orientation = 0;
  within_has_animation = 0;
  within_tps_numerator = 0;
  within_tps_denominator = 0;
  within_num_loops = 0;
  within_have_timecodes = 0;
  within_inspected_bytes = 0;
  memset(&within_memory, 0, sizeof(within_memory));
  if (input_size < 2 || input_size > WITHIN_MAX_INPUT) {
    within_set_error("JPEG XL input must be between 2 bytes and 64 MiB.");
    return 1;
  }

  uint8_t *input = (uint8_t *)malloc(WITHIN_INPUT_WINDOW);
  if (!input) {
    within_set_error("Could not allocate the bounded JPEG XL header window.");
    return 2;
  }
  JxlMemoryManager manager;
  manager.opaque = &within_memory;
  manager.alloc = within_allocate;
  manager.free = within_free;
  JxlDecoder *decoder = JxlDecoderCreate(&manager);
  if (!decoder) {
    free(input);
    within_set_error("Could not initialize the bounded JPEG XL header decoder.");
    return 3;
  }
  if (JxlDecoderSubscribeEvents(decoder, JXL_DEC_BASIC_INFO) != JXL_DEC_SUCCESS) {
    JxlDecoderDestroy(decoder);
    free(input);
    within_set_error("Could not configure JPEG XL basic-information inspection.");
    return 4;
  }

  uint64_t source_position = 0;
  size_t available = 0;
  int input_is_set = 0;
  int input_closed = 0;
  int result = 0;
  for (;;) {
    if (!input_is_set) {
      while (available < WITHIN_INPUT_WINDOW && source_position < input_size &&
             source_position < WITHIN_MAX_INSPECTION) {
        size_t wanted = WITHIN_INPUT_WINDOW - available;
        if (wanted > WITHIN_INPUT_READ) wanted = WITHIN_INPUT_READ;
        uint64_t remaining_file = input_size - source_position;
        uint64_t remaining_budget = WITHIN_MAX_INSPECTION - source_position;
        if ((uint64_t)wanted > remaining_file) wanted = (size_t)remaining_file;
        if ((uint64_t)wanted > remaining_budget) wanted = (size_t)remaining_budget;
        int completed = within_jxl_inspector_input_read(
            source_position, input + available, (int)wanted);
        if (completed <= 0 || (size_t)completed > wanted) {
          within_set_error("JPEG XL inspection bridge rejected a bounded read.");
          result = 5;
          goto cleanup;
        }
        source_position += (uint64_t)completed;
        available += (size_t)completed;
        within_inspected_bytes = (uint32_t)source_position;
        if ((size_t)completed < wanted) break;
      }
      if (available == 0) {
        within_set_error("JPEG XL basic information was not found inside the 1 MiB inspection ceiling.");
        result = 6;
        goto cleanup;
      }
      if (JxlDecoderSetInput(decoder, input, available) != JXL_DEC_SUCCESS) {
        within_set_error("JPEG XL decoder rejected the bounded header window.");
        result = 7;
        goto cleanup;
      }
      input_is_set = 1;
      if (source_position == input_size && !input_closed) {
        JxlDecoderCloseInput(decoder);
        input_closed = 1;
      }
    }

    JxlDecoderStatus status = JxlDecoderProcessInput(decoder);
    if (status == JXL_DEC_BASIC_INFO) {
      JxlBasicInfo info;
      if (JxlDecoderGetBasicInfo(decoder, &info) != JXL_DEC_SUCCESS ||
          info.xsize < 1 || info.ysize < 1 || info.bits_per_sample < 1 ||
          info.num_color_channels < 1 || info.num_color_channels > 4 ||
          info.orientation < 1 || info.orientation > 8) {
        within_set_error("JPEG XL basic information is invalid.");
        result = 8;
        goto cleanup;
      }
      within_width = info.xsize;
      within_height = info.ysize;
      within_intrinsic_width = info.intrinsic_xsize;
      within_intrinsic_height = info.intrinsic_ysize;
      within_bits = info.bits_per_sample;
      within_color_channels = info.num_color_channels;
      within_alpha_bits = info.alpha_bits;
      within_orientation = info.orientation;
      within_has_animation = info.have_animation ? 1U : 0U;
      if (info.have_animation) {
        within_tps_numerator = info.animation.tps_numerator;
        within_tps_denominator = info.animation.tps_denominator;
        within_num_loops = info.animation.num_loops;
        within_have_timecodes = info.animation.have_timecodes ? 1U : 0U;
      }
      goto cleanup;
    }
    if (status == JXL_DEC_NEED_MORE_INPUT) {
      size_t remaining = JxlDecoderReleaseInput(decoder);
      input_is_set = 0;
      if (remaining > available) {
        within_set_error("JPEG XL decoder returned invalid input accounting.");
        result = 9;
        goto cleanup;
      }
      memmove(input, input + available - remaining, remaining);
      available = remaining;
      if (source_position >= WITHIN_MAX_INSPECTION && source_position < input_size) {
        within_set_error("JPEG XL basic information was not found inside the 1 MiB inspection ceiling.");
        result = 10;
        goto cleanup;
      }
      continue;
    }
    if (status == JXL_DEC_ERROR) {
      within_set_error(within_memory.rejected
                           ? "JPEG XL header parsing exceeded the 8 MiB decoder allocation limit."
                           : "JPEG XL header is invalid or unsupported.");
      result = 11;
      goto cleanup;
    }
    if (status == JXL_DEC_SUCCESS) {
      within_set_error("JPEG XL stream ended before basic information was reported.");
      result = 12;
      goto cleanup;
    }
  }

cleanup:
  JxlDecoderDestroy(decoder);
  free(input);
  return result;
}

EMSCRIPTEN_KEEPALIVE const char *within_jxl_inspector_error(void) {
  return within_error_message;
}
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_width(void) { return within_width; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_height(void) { return within_height; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_intrinsic_width(void) { return within_intrinsic_width; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_intrinsic_height(void) { return within_intrinsic_height; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_bits(void) { return within_bits; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_color_channels(void) { return within_color_channels; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_alpha_bits(void) { return within_alpha_bits; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_orientation(void) { return within_orientation; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_has_animation(void) { return within_has_animation; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_tps_numerator(void) { return within_tps_numerator; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_tps_denominator(void) { return within_tps_denominator; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_num_loops(void) { return within_num_loops; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_have_timecodes(void) { return within_have_timecodes; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_inspected_bytes(void) { return within_inspected_bytes; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_inspector_peak_allocation(void) { return (uint32_t)within_memory.peak; }

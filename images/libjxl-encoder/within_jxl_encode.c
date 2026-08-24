#include <emscripten.h>
#include <jxl/encode.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WITHIN_ENCODER_ALLOCATION_LIMIT (44U * 1024U * 1024U)
#define WITHIN_SINGLE_ALLOCATION_LIMIT (32U * 1024U * 1024U)
#define WITHIN_PIXEL_ALLOCATION_LIMIT (16U * 1024U * 1024U)
#define WITHIN_OUTPUT_BUFFER_BYTES (64U * 1024U)
#define WITHIN_MAX_OUTPUT_BYTES (128U * 1024U * 1024U)
#define WITHIN_MAX_DIMENSION 8192U
#define WITHIN_MAX_PIXELS 8388608U

typedef union {
  max_align_t alignment;
  size_t size;
} within_allocation_header;

typedef struct {
  size_t current;
  size_t peak;
  int rejected;
  size_t rejected_current;
  size_t rejected_size;
} within_memory_state;

typedef struct {
  uint8_t *buffer;
  size_t current;
  size_t peak;
  uint32_t width;
  uint32_t height;
  uint32_t channels;
  int failed;
} within_pixel_state;

typedef struct {
  uint8_t *buffer;
  uint64_t position;
  uint64_t finalized;
  int failed;
} within_output_state;

static char within_error_message[1024];
static within_memory_state within_memory;
static within_pixel_state within_pixels;
static within_output_state within_output;
static JxlEncoder *within_encoder;
static JxlEncoderFrameSettings *within_settings;
static int within_has_animation;

EM_JS(int, within_jxl_pixel_region,
      (uint32_t destination, uint32_t x, uint32_t y, uint32_t width,
       uint32_t height, uint32_t channels), {
  try {
    return Module.withinBridge.region(destination, x, y, width, height, channels);
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

EM_ASYNC_JS(int, within_jxl_output_write,
            (double offset, uint32_t source, uint32_t length), {
  try {
    const view = Module.HEAPU8.subarray(source, source + length);
    return await Module.withinBridge.write(offset, view);
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

static void within_set_error(const char *message) {
  if (!message) message = "JPEG XL encoding failed.";
  snprintf(within_error_message, sizeof(within_error_message), "%s", message);
}

static void *within_allocate(void *opaque, size_t size) {
  within_memory_state *state = (within_memory_state *)opaque;
  if (size == 0) size = 1;
  if (size > WITHIN_SINGLE_ALLOCATION_LIMIT ||
      state->current > WITHIN_ENCODER_ALLOCATION_LIMIT - size ||
      size > SIZE_MAX - sizeof(within_allocation_header)) {
    state->rejected = 1;
    state->rejected_current = state->current;
    state->rejected_size = size;
    return NULL;
  }
  within_allocation_header *header =
      (within_allocation_header *)malloc(sizeof(within_allocation_header) + size);
  if (!header) {
    state->rejected = 1;
    state->rejected_current = state->current;
    state->rejected_size = size;
    return NULL;
  }
  header->size = size;
  state->current += size;
  if (state->current > state->peak) state->peak = state->current;
  return (void *)(header + 1);
}

static void within_free(void *opaque, void *address) {
  if (!address) return;
  within_memory_state *state = (within_memory_state *)opaque;
  within_allocation_header *header =
      ((within_allocation_header *)address) - 1;
  if (header->size <= state->current) state->current -= header->size;
  free(header);
}

static void within_get_pixel_format(void *opaque, JxlPixelFormat *format) {
  within_pixel_state *state = (within_pixel_state *)opaque;
  format->num_channels = state->channels;
  format->data_type = JXL_TYPE_UINT8;
  format->endianness = JXL_NATIVE_ENDIAN;
  format->align = 0;
}

static const void *within_get_pixel_region(void *opaque, size_t x, size_t y,
                                           size_t width, size_t height,
                                           size_t *row_offset) {
  within_pixel_state *state = (within_pixel_state *)opaque;
  if (state->failed || width == 0 || height == 0 || x > state->width ||
      y > state->height || width > state->width - x ||
      height > state->height - y || width > SIZE_MAX / state->channels ||
      width * state->channels > SIZE_MAX / height) {
    state->failed = 1;
    return NULL;
  }
  size_t bytes = width * height * state->channels;
  if (bytes > WITHIN_PIXEL_ALLOCATION_LIMIT ||
      state->current > WITHIN_PIXEL_ALLOCATION_LIMIT - bytes ||
      bytes > SIZE_MAX - sizeof(within_allocation_header)) {
    state->failed = 1;
    within_set_error("JPEG XL pixel callbacks exceeded the 16 MiB in-flight limit.");
    return NULL;
  }
  within_allocation_header *header =
      (within_allocation_header *)malloc(sizeof(within_allocation_header) + bytes);
  if (!header) {
    state->failed = 1;
    within_set_error("Could not allocate a bounded JPEG XL pixel rectangle.");
    return NULL;
  }
  header->size = bytes;
  uint8_t *destination = (uint8_t *)(header + 1);
  if (within_jxl_pixel_region((uint32_t)(uintptr_t)destination, (uint32_t)x,
                              (uint32_t)y, (uint32_t)width, (uint32_t)height,
                              state->channels) != (int)bytes) {
    free(header);
    state->failed = 1;
    within_set_error("The browser rejected a bounded JPEG XL pixel request.");
    return NULL;
  }
  state->current += bytes;
  if (state->current > state->peak) state->peak = state->current;
  *row_offset = width * state->channels;
  return destination;
}

static void within_release_pixel_region(void *opaque, const void *buffer) {
  if (!buffer) return;
  within_pixel_state *state = (within_pixel_state *)opaque;
  within_allocation_header *header =
      ((within_allocation_header *)buffer) - 1;
  if (header->size <= state->current) state->current -= header->size;
  free(header);
}

static void within_get_extra_format(void *opaque, size_t index,
                                    JxlPixelFormat *format) {
  (void)opaque;
  (void)index;
  memset(format, 0, sizeof(*format));
}

static const void *within_get_extra_region(void *opaque, size_t index, size_t x,
                                           size_t y, size_t width, size_t height,
                                           size_t *row_offset) {
  (void)opaque;
  (void)index;
  (void)x;
  (void)y;
  (void)width;
  (void)height;
  (void)row_offset;
  return NULL;
}

static void *within_output_get_buffer(void *opaque, size_t *size) {
  within_output_state *state = (within_output_state *)opaque;
  if (state->failed || !state->buffer) {
    *size = 0;
    return NULL;
  }
  *size = WITHIN_OUTPUT_BUFFER_BYTES;
  return state->buffer;
}

static void within_output_release_buffer(void *opaque, size_t written) {
  within_output_state *state = (within_output_state *)opaque;
  if (state->failed || written == 0) return;
  if (written > WITHIN_OUTPUT_BUFFER_BYTES ||
      state->position > WITHIN_MAX_OUTPUT_BYTES - written) {
    state->failed = 1;
    within_set_error("JPEG XL output exceeds the 128 MiB safety limit.");
    return;
  }
  int result = within_jxl_output_write((double)state->position,
                                       (uint32_t)(uintptr_t)state->buffer,
                                       (uint32_t)written);
  if (result != (int)written) {
    state->failed = 1;
    within_set_error("JPEG XL destination rejected a bounded write.");
    return;
  }
  state->position += written;
}

static void within_output_finalized(void *opaque, uint64_t position) {
  within_output_state *state = (within_output_state *)opaque;
  if (position < state->finalized || position > state->position) {
    state->failed = 1;
    within_set_error("JPEG XL encoder returned an invalid finalized position.");
    return;
  }
  state->finalized = position;
}

static void within_destroy_internal(void) {
  if (within_encoder) JxlEncoderDestroy(within_encoder);
  within_encoder = NULL;
  within_settings = NULL;
  free(within_output.buffer);
  within_output.buffer = NULL;
  within_pixels.buffer = NULL;
  within_pixels.current = 0;
}

EMSCRIPTEN_KEEPALIVE int within_jxl_encoder_start(
    uint32_t width, uint32_t height, int has_alpha, int has_animation,
    uint32_t num_loops) {
  within_destroy_internal();
  memset(&within_memory, 0, sizeof(within_memory));
  memset(&within_pixels, 0, sizeof(within_pixels));
  memset(&within_output, 0, sizeof(within_output));
  memset(within_error_message, 0, sizeof(within_error_message));
  if (width < 1 || height < 1 || width > WITHIN_MAX_DIMENSION ||
      height > WITHIN_MAX_DIMENSION ||
      (uint64_t)width * height > WITHIN_MAX_PIXELS ||
      (has_alpha != 0 && has_alpha != 1) ||
      (has_animation != 0 && has_animation != 1)) {
    within_set_error("JPEG XL dimensions or flags exceed the bounded limits.");
    return -1;
  }
  within_memory_state *memory = &within_memory;
  JxlMemoryManager manager = {memory, within_allocate, within_free};
  within_encoder = JxlEncoderCreate(&manager);
  if (!within_encoder) {
    within_set_error("Could not create the bounded JPEG XL encoder.");
    return -2;
  }
  within_output.buffer = (uint8_t *)malloc(WITHIN_OUTPUT_BUFFER_BYTES);
  if (!within_output.buffer) {
    within_set_error("Could not allocate the bounded JPEG XL output buffer.");
    within_destroy_internal();
    return -3;
  }
  struct JxlEncoderOutputProcessor processor;
  memset(&processor, 0, sizeof(processor));
  processor.opaque = &within_output;
  processor.get_buffer = within_output_get_buffer;
  processor.release_buffer = within_output_release_buffer;
  processor.set_finalized_position = within_output_finalized;
  if (JxlEncoderSetOutputProcessor(within_encoder, processor) != JXL_ENC_SUCCESS) {
    within_set_error("Could not install the bounded JPEG XL output processor.");
    within_destroy_internal();
    return -4;
  }
  JxlBasicInfo info;
  JxlEncoderInitBasicInfo(&info);
  info.xsize = width;
  info.ysize = height;
  info.bits_per_sample = 8;
  info.num_color_channels = 3;
  info.uses_original_profile = JXL_TRUE;
  info.have_animation = has_animation ? JXL_TRUE : JXL_FALSE;
  if (has_animation) {
    info.animation.tps_numerator = 1000000U;
    info.animation.tps_denominator = 1U;
    info.animation.num_loops = num_loops;
    info.animation.have_timecodes = JXL_FALSE;
  }
  if (has_alpha) {
    info.alpha_bits = 8;
    info.alpha_exponent_bits = 0;
    info.alpha_premultiplied = JXL_FALSE;
    info.num_extra_channels = 1;
  }
  if (JxlEncoderSetBasicInfo(within_encoder, &info) != JXL_ENC_SUCCESS) {
    within_set_error("Could not set bounded JPEG XL image metadata.");
    within_destroy_internal();
    return -5;
  }
  if (has_alpha) {
    JxlExtraChannelInfo alpha;
    JxlEncoderInitExtraChannelInfo(JXL_CHANNEL_ALPHA, &alpha);
    alpha.bits_per_sample = 8;
    alpha.exponent_bits_per_sample = 0;
    alpha.alpha_premultiplied = JXL_FALSE;
    if (JxlEncoderSetExtraChannelInfo(within_encoder, 0, &alpha) !=
        JXL_ENC_SUCCESS) {
      within_set_error("Could not set JPEG XL alpha metadata.");
      within_destroy_internal();
      return -6;
    }
  }
  JxlColorEncoding color;
  JxlColorEncodingSetToSRGB(&color, JXL_FALSE);
  if (JxlEncoderSetColorEncoding(within_encoder, &color) != JXL_ENC_SUCCESS) {
    within_set_error("Could not set the JPEG XL sRGB profile.");
    within_destroy_internal();
    return -7;
  }
  within_settings = JxlEncoderFrameSettingsCreate(within_encoder, NULL);
  if (!within_settings ||
      JxlEncoderFrameSettingsSetOption(
          within_settings, JXL_ENC_FRAME_SETTING_EFFORT, 1) != JXL_ENC_SUCCESS ||
      JxlEncoderSetFrameLossless(within_settings, JXL_TRUE) != JXL_ENC_SUCCESS) {
    within_set_error("Could not select the fastest lossless JPEG XL settings.");
    within_destroy_internal();
    return -8;
  }
  within_pixels.width = width;
  within_pixels.height = height;
  within_pixels.channels = has_alpha ? 4U : 3U;
  within_has_animation = has_animation;
  return 0;
}

EMSCRIPTEN_KEEPALIVE int within_jxl_encoder_add_frame(uint32_t duration_micros,
                                                      int is_last) {
  if (!within_encoder || !within_settings || (is_last != 0 && is_last != 1)) {
    within_set_error("JPEG XL encoder is not ready for a frame.");
    return -1;
  }
  if ((within_has_animation && duration_micros < 1) ||
      (!within_has_animation && duration_micros != 0)) {
    within_set_error("JPEG XL frame duration is invalid for this stream.");
    return -2;
  }
  JxlFrameHeader header;
  JxlEncoderInitFrameHeader(&header);
  header.duration = duration_micros;
  if (JxlEncoderSetFrameHeader(within_settings, &header) != JXL_ENC_SUCCESS) {
    within_set_error("Could not set JPEG XL frame timing.");
    return -3;
  }
  struct JxlChunkedFrameInputSource input;
  memset(&input, 0, sizeof(input));
  input.opaque = &within_pixels;
  input.get_color_channels_pixel_format = within_get_pixel_format;
  input.get_color_channel_data_at = within_get_pixel_region;
  input.get_extra_channel_pixel_format = within_get_extra_format;
  input.get_extra_channel_data_at = within_get_extra_region;
  input.release_buffer = within_release_pixel_region;
  JxlEncoderStatus status = JxlEncoderAddChunkedFrame(
      within_settings, is_last ? JXL_TRUE : JXL_FALSE, input);
  if (status != JXL_ENC_SUCCESS || within_pixels.failed ||
      within_output.failed) {
    if (!within_error_message[0]) {
      if (within_memory.rejected) {
        snprintf(within_error_message, sizeof(within_error_message),
                 "JPEG XL encoder rejected allocation %zu at %zu bytes.",
                 within_memory.rejected_size, within_memory.rejected_current);
      } else {
        within_set_error("libjxl rejected the bounded frame encoding.");
      }
    }
    return -4;
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE int within_jxl_encoder_finish(void) {
  if (!within_encoder) {
    within_set_error("JPEG XL encoder is not ready to finish.");
    return -1;
  }
  JxlEncoderCloseInput(within_encoder);
  JxlEncoderStatus status = JxlEncoderFlushInput(within_encoder);
  if (status != JXL_ENC_SUCCESS || within_pixels.failed ||
      within_output.failed) {
    if (!within_error_message[0]) within_set_error("Could not finalize JPEG XL output.");
    return -2;
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE void within_jxl_encoder_destroy(void) {
  within_destroy_internal();
}

EMSCRIPTEN_KEEPALIVE const char *within_jxl_encoder_error(void) {
  return within_error_message;
}

EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_encoder_peak_allocation(void) {
  return (uint32_t)within_memory.peak;
}

EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_encoder_peak_pixel_bytes(void) {
  return (uint32_t)within_pixels.peak;
}

EMSCRIPTEN_KEEPALIVE double within_jxl_encoder_output_bytes(void) {
  return (double)within_output.position;
}

#include <emscripten.h>
#include <jxl/codestream_header.h>
#include <jxl/color_encoding.h>
#include <jxl/decode.h>
#include <jxl/memory_manager.h>
#include <png.h>

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WITHIN_INPUT_READ (256U * 1024U)
#define WITHIN_INPUT_WINDOW (1024U * 1024U)
#define WITHIN_OUTPUT_WRITE (64U * 1024U)
#define WITHIN_MAX_INPUT (64U * 1024U * 1024U)
#define WITHIN_MAX_OUTPUT (96U * 1024U * 1024U)
#define WITHIN_MAX_DIMENSION 8192U
#define WITHIN_MAX_PIXELS 8388608ULL
#define WITHIN_MAX_ICC (4U * 1024U * 1024U)
#define WITHIN_MAX_FRAMES 1000U
#define WITHIN_STRIPE_ROWS 256U
#define WITHIN_MAX_STRIPE (16U * 1024U * 1024U)
#define WITHIN_DECODER_ALLOCATION_LIMIT (102U * 1024U * 1024U)
#define WITHIN_SINGLE_ALLOCATION_LIMIT (32U * 1024U * 1024U)

typedef union {
  max_align_t alignment;
  struct {
    size_t size;
  } value;
} within_allocation_header;

typedef struct {
  size_t current;
  size_t peak;
  size_t rejected_current;
  size_t rejected_size;
  int rejected;
} within_memory_state;

typedef struct {
  png_structp png;
  png_infop info;
  uint8_t *stripe;
  uint8_t *coverage;
  uint32_t *row_counts;
  uint32_t width;
  uint32_t height;
  uint32_t channels;
  uint32_t bytes_per_sample;
  uint32_t row_bytes;
  uint32_t stripe_rows;
  uint32_t stripe_start;
  uint32_t stripe_height;
  int initialized;
  int failed;
} within_output_state;

static char within_error_message[1024];
static uint64_t within_output_position;
static uint32_t within_image_width;
static uint32_t within_image_height;
static uint32_t within_image_bits;
static uint32_t within_image_channels;
static int within_image_has_animation;
static uint32_t within_animation_tps_numerator;
static uint32_t within_animation_tps_denominator;
static uint32_t within_animation_num_loops;
static int within_animation_have_timecodes;
static uint32_t within_completed_frames;
static int within_archive_frames;
static within_memory_state within_decoder_memory;

EM_ASYNC_JS(int, within_jxl_input_read,
            (uint64_t offset, unsigned char *destination, int length), {
  try {
    return await Module.withinBridge.read(Number(offset), HEAPU8.subarray(destination, destination + length));
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

EM_ASYNC_JS(int, within_png_output_write,
            (uint64_t offset, const unsigned char *source, int length), {
  try {
    return await Module.withinBridge.write(Number(offset), HEAPU8.slice(source, source + length));
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

EM_ASYNC_JS(int, within_jxl_frame_start,
            (uint32_t index, uint32_t duration, uint32_t timecode, int is_last,
             uint32_t width, uint32_t height, uint32_t bits,
             uint32_t channels, uint32_t tps_numerator,
             uint32_t tps_denominator, uint32_t num_loops,
             int have_timecodes), {
  try {
    return await Module.withinBridge.frameStart(
      index, duration, timecode, is_last, width, height, bits, channels,
      tps_numerator, tps_denominator, num_loops, have_timecodes);
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

EM_ASYNC_JS(int, within_jxl_frame_end, (uint32_t index), {
  try {
    return await Module.withinBridge.frameEnd(index);
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

static void within_set_error(const char *message) {
  if (!message) message = "JPEG XL conversion failed.";
  snprintf(within_error_message, sizeof(within_error_message), "%s", message);
}

static void *within_jxl_allocate(void *opaque, size_t size) {
  within_memory_state *state = (within_memory_state *)opaque;
  if (size == 0) size = 1;
  if (size > WITHIN_SINGLE_ALLOCATION_LIMIT ||
      state->current > WITHIN_DECODER_ALLOCATION_LIMIT - size ||
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
  header->value.size = size;
  state->current += size;
  if (state->current > state->peak) state->peak = state->current;
  return (void *)(header + 1);
}

static void within_jxl_free(void *opaque, void *address) {
  if (!address) return;
  within_memory_state *state = (within_memory_state *)opaque;
  within_allocation_header *header =
      ((within_allocation_header *)address) - 1;
  if (header->value.size <= state->current) state->current -= header->value.size;
  free(header);
}

static void within_png_write(png_structp png, png_bytep data,
                             png_size_t length) {
  within_output_state *output = (within_output_state *)png_get_io_ptr(png);
  if (!output || output->failed) return;
  while (length > 0) {
    int part =
        (int)(length > WITHIN_OUTPUT_WRITE ? WITHIN_OUTPUT_WRITE : length);
    if (within_output_position + (uint64_t)part > WITHIN_MAX_OUTPUT) {
      output->failed = 1;
      within_set_error("PNG output exceeds the 96 MiB safety limit.");
      return;
    }
    int result = within_png_output_write(within_output_position, data, part);
    if (result != part) {
      output->failed = 1;
      within_set_error("PNG destination rejected a bounded write.");
      return;
    }
    within_output_position += (uint64_t)part;
    data += part;
    length -= (png_size_t)part;
  }
}

static void within_png_flush(png_structp png) { (void)png; }

static int within_flush_stripe(within_output_state *output) {
  if (!output->initialized || output->stripe_height == 0) return 1;
  for (uint32_t row = 0; row < output->stripe_height; row++) {
    if (output->row_counts[row] != output->width) {
      within_set_error("JPEG XL decoder emitted out-of-order incomplete scanlines.");
      output->failed = 1;
      return 0;
    }
  }
  if (setjmp(png_jmpbuf(output->png))) {
    if (!within_error_message[0])
      within_set_error("libpng rejected a decoded JPEG XL scanline.");
    output->failed = 1;
    return 0;
  }
  for (uint32_t row = 0; row < output->stripe_height; row++) {
    png_write_row(output->png, output->stripe + (size_t)row * output->row_bytes);
    if (output->failed) return 0;
  }
  memset(output->row_counts, 0,
         (size_t)output->stripe_rows * sizeof(*output->row_counts));
  memset(output->coverage, 0,
         ((size_t)output->width * output->stripe_rows + 7U) / 8U);
  return 1;
}

static int within_finish_png(within_output_state *output) {
  if (setjmp(png_jmpbuf(output->png))) {
    if (!within_error_message[0])
      within_set_error("libpng rejected the completed JPEG XL image.");
    output->failed = 1;
    return 0;
  }
  png_write_end(output->png, output->info);
  return output->failed ? 0 : 1;
}

static void within_image_callback(void *opaque, size_t x, size_t y,
                                  size_t num_pixels, const void *pixels) {
  within_output_state *output = (within_output_state *)opaque;
  if (!output || output->failed || !pixels || num_pixels == 0) return;
  if (x > output->width || num_pixels > output->width - x || y >= output->height) {
    output->failed = 1;
    within_set_error("JPEG XL decoder returned an invalid pixel stripe.");
    return;
  }
  uint32_t target_start =
      ((uint32_t)y / output->stripe_rows) * output->stripe_rows;
  if (target_start != output->stripe_start) {
    if (target_start < output->stripe_start || !within_flush_stripe(output)) {
      output->failed = 1;
      return;
    }
    output->stripe_start = target_start;
    output->stripe_height = output->height - target_start;
    if (output->stripe_height > output->stripe_rows)
      output->stripe_height = output->stripe_rows;
  }
  uint32_t local_y = (uint32_t)y - output->stripe_start;
  if (local_y >= output->stripe_height) {
    output->failed = 1;
    within_set_error("JPEG XL decoder exceeded the bounded output stripe.");
    return;
  }
  size_t first_pixel = (size_t)local_y * output->width + x;
  for (size_t index = 0; index < num_pixels; index++) {
    size_t pixel = first_pixel + index;
    uint8_t mask = (uint8_t)(1U << (pixel & 7U));
    uint8_t *entry = output->coverage + (pixel >> 3U);
    if ((*entry & mask) != 0) {
      output->failed = 1;
      within_set_error("JPEG XL decoder returned overlapping pixel stripes.");
      return;
    }
    *entry |= mask;
  }
  memcpy(output->stripe + (size_t)local_y * output->row_bytes +
             x * output->channels * output->bytes_per_sample,
         pixels, num_pixels * output->channels * output->bytes_per_sample);
  output->row_counts[local_y] += (uint32_t)num_pixels;
}

static void within_output_release(within_output_state *output) {
  if (!output) return;
  free(output->stripe);
  free(output->coverage);
  free(output->row_counts);
  output->stripe = NULL;
  output->coverage = NULL;
  output->row_counts = NULL;
  if (output->png || output->info) png_destroy_write_struct(&output->png, &output->info);
}

static int within_start_png(within_output_state *output, const uint8_t *icc,
                            size_t icc_size) {
  size_t row_bytes = (size_t)within_image_width * within_image_channels *
                     (within_image_bits / 8U);
  uint32_t stripe_height = within_image_height;
  uint32_t stripe_rows = within_archive_frames ? within_image_height : WITHIN_STRIPE_ROWS;
  if (stripe_height > stripe_rows) stripe_height = stripe_rows;
  size_t stripe_bytes = row_bytes * stripe_height;
  size_t coverage_bytes =
      ((size_t)within_image_width * stripe_rows + 7U) / 8U;
  if (row_bytes == 0 || stripe_bytes == 0 || stripe_bytes > WITHIN_MAX_STRIPE) {
    within_set_error("JPEG XL output stripe exceeds the 16 MiB safety limit.");
    return 0;
  }
  output->stripe = (uint8_t *)malloc(stripe_bytes);
  output->coverage = (uint8_t *)calloc(coverage_bytes, 1);
  output->row_counts =
      (uint32_t *)calloc(stripe_rows, sizeof(*output->row_counts));
  if (!output->stripe || !output->coverage || !output->row_counts) {
    within_set_error("Could not allocate the bounded JPEG XL output stripe.");
    return 0;
  }
  output->png = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
  output->info = output->png ? png_create_info_struct(output->png) : NULL;
  if (!output->png || !output->info) {
    within_set_error("Could not initialize the bounded PNG encoder.");
    return 0;
  }
  if (setjmp(png_jmpbuf(output->png))) {
    within_set_error("libpng rejected the decoded JPEG XL image.");
    return 0;
  }
  png_set_write_fn(output->png, output, within_png_write, within_png_flush);
  int color_type = PNG_COLOR_TYPE_RGB;
  if (within_image_channels == 1) color_type = PNG_COLOR_TYPE_GRAY;
  if (within_image_channels == 2) color_type = PNG_COLOR_TYPE_GRAY_ALPHA;
  if (within_image_channels == 4) color_type = PNG_COLOR_TYPE_RGBA;
  png_set_IHDR(output->png, output->info, within_image_width, within_image_height,
               (int)within_image_bits, color_type, PNG_INTERLACE_NONE,
               PNG_COMPRESSION_TYPE_BASE, PNG_FILTER_TYPE_BASE);
  if (within_archive_frames) png_set_compression_level(output->png, 1);
  if (icc && icc_size > 0) {
    png_set_iCCP(output->png, output->info, "JPEG XL output profile",
                 PNG_COMPRESSION_TYPE_BASE, icc, (png_uint_32)icc_size);
  }
  png_write_info(output->png, output->info);
  if (output->failed) return 0;
  output->width = within_image_width;
  output->height = within_image_height;
  output->channels = within_image_channels;
  output->bytes_per_sample = within_image_bits / 8U;
  output->row_bytes = (uint32_t)row_bytes;
  output->stripe_rows = stripe_rows;
  output->stripe_start = 0;
  output->stripe_height = stripe_height;
  output->initialized = 1;
  return 1;
}

static int within_jxl_convert(uint32_t input_size, int archive_frames) {
  within_error_message[0] = '\0';
  within_output_position = 0;
  within_image_width = 0;
  within_image_height = 0;
  within_image_bits = 0;
  within_image_channels = 0;
  within_image_has_animation = 0;
  within_animation_tps_numerator = 1;
  within_animation_tps_denominator = 1;
  within_animation_num_loops = 1;
  within_animation_have_timecodes = 0;
  within_completed_frames = 0;
  within_archive_frames = archive_frames;
  memset(&within_decoder_memory, 0, sizeof(within_decoder_memory));
  if (input_size < 2 || input_size > WITHIN_MAX_INPUT) {
    within_set_error("JPEG XL input must be between 2 bytes and 64 MiB.");
    return 1;
  }

  uint8_t *input = (uint8_t *)malloc(WITHIN_INPUT_WINDOW);
  uint8_t *icc = NULL;
  size_t icc_size = 0;
  within_output_state output;
  memset(&output, 0, sizeof(output));
  if (!input) {
    within_set_error("Could not allocate the bounded JPEG XL input window.");
    return 2;
  }

  JxlMemoryManager memory_manager;
  memory_manager.opaque = &within_decoder_memory;
  memory_manager.alloc = within_jxl_allocate;
  memory_manager.free = within_jxl_free;
  JxlDecoder *decoder = JxlDecoderCreate(&memory_manager);
  if (!decoder) {
    within_set_error("Could not initialize the bounded JPEG XL decoder.");
    free(input);
    return 3;
  }
  if (JxlDecoderSubscribeEvents(decoder, JXL_DEC_BASIC_INFO |
                                             JXL_DEC_COLOR_ENCODING |
                                             JXL_DEC_FRAME |
                                             JXL_DEC_FULL_IMAGE) !=
          JXL_DEC_SUCCESS ||
      JxlDecoderSetKeepOrientation(decoder, JXL_FALSE) != JXL_DEC_SUCCESS ||
      JxlDecoderSetUnpremultiplyAlpha(decoder, JXL_TRUE) != JXL_DEC_SUCCESS ||
      JxlDecoderSetCoalescing(decoder, JXL_TRUE) != JXL_DEC_SUCCESS) {
    within_set_error("Could not configure the bounded JPEG XL decoder.");
    JxlDecoderDestroy(decoder);
    free(input);
    return 4;
  }

  uint64_t source_position = 0;
  size_t available = 0;
  int input_is_set = 0;
  int input_closed = 0;
  int frame_is_open = 0;
  int result = 0;
  for (;;) {
    if (!input_is_set) {
      while (available < WITHIN_INPUT_WINDOW && source_position < input_size) {
        size_t wanted = WITHIN_INPUT_WINDOW - available;
        if (wanted > WITHIN_INPUT_READ) wanted = WITHIN_INPUT_READ;
        uint64_t remaining = input_size - source_position;
        if ((uint64_t)wanted > remaining) wanted = (size_t)remaining;
        int completed = within_jxl_input_read(source_position, input + available,
                                              (int)wanted);
        if (completed <= 0 || (size_t)completed > wanted) {
          within_set_error("JPEG XL input bridge rejected a bounded read.");
          result = 5;
          goto cleanup;
        }
        source_position += (uint64_t)completed;
        available += (size_t)completed;
        if ((size_t)completed < wanted) break;
      }
      if (available == 0) {
        within_set_error("JPEG XL input ended before a complete image was decoded.");
        result = 6;
        goto cleanup;
      }
      if (JxlDecoderSetInput(decoder, input, available) != JXL_DEC_SUCCESS) {
        within_set_error("JPEG XL decoder rejected the bounded input window.");
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
    if (output.failed) {
      result = 8;
      goto cleanup;
    }
    if (status == JXL_DEC_BASIC_INFO) {
      JxlBasicInfo info;
      if (JxlDecoderGetBasicInfo(decoder, &info) != JXL_DEC_SUCCESS ||
          info.xsize < 1 || info.ysize < 1 ||
          info.xsize > WITHIN_MAX_DIMENSION ||
          info.ysize > WITHIN_MAX_DIMENSION ||
          (uint64_t)info.xsize * info.ysize > WITHIN_MAX_PIXELS ||
          (info.num_color_channels != 1 && info.num_color_channels != 3) ||
          info.bits_per_sample < 1 || info.bits_per_sample > 16 ||
          info.exponent_bits_per_sample != 0 || info.alpha_bits > 16 ||
          info.alpha_exponent_bits != 0) {
        within_set_error("JPEG XL dimensions, channels, or sample depth exceed the bounded decoder policy.");
        result = 9;
        goto cleanup;
      }
      within_image_width = info.xsize;
      within_image_height = info.ysize;
      within_image_bits =
          (info.bits_per_sample > 8 || info.alpha_bits > 8) ? 16U : 8U;
      within_image_channels = info.num_color_channels + (info.alpha_bits ? 1U : 0U);
      within_image_has_animation = info.have_animation ? 1 : 0;
      if (info.have_animation) {
        if (info.animation.tps_numerator == 0 ||
            info.animation.tps_denominator == 0) {
          within_set_error("JPEG XL animation has an invalid zero timebase.");
          result = 21;
          goto cleanup;
        }
        within_animation_tps_numerator = info.animation.tps_numerator;
        within_animation_tps_denominator = info.animation.tps_denominator;
        within_animation_num_loops = info.animation.num_loops;
        within_animation_have_timecodes = info.animation.have_timecodes ? 1 : 0;
      }
    } else if (status == JXL_DEC_COLOR_ENCODING) {
      if (JxlDecoderGetICCProfileSize(decoder, JXL_COLOR_PROFILE_TARGET_DATA,
                                      &icc_size) == JXL_DEC_SUCCESS) {
        if (icc_size < 128 || icc_size > WITHIN_MAX_ICC) {
          within_set_error("JPEG XL ICC profile exceeds the 4 MiB safety limit.");
          result = 10;
          goto cleanup;
        }
        icc = (uint8_t *)malloc(icc_size);
        if (!icc || JxlDecoderGetColorAsICCProfile(
                        decoder, JXL_COLOR_PROFILE_TARGET_DATA, icc,
                        icc_size) != JXL_DEC_SUCCESS) {
          within_set_error("Could not preserve the JPEG XL output color profile.");
          result = 11;
          goto cleanup;
        }
      } else {
        icc_size = 0;
      }
    } else if (status == JXL_DEC_FRAME) {
      JxlFrameHeader frame_header;
      if (JxlDecoderGetFrameHeader(decoder, &frame_header) != JXL_DEC_SUCCESS) {
        within_set_error("Could not read JPEG XL frame timing metadata.");
        result = 22;
        goto cleanup;
      }
      if (archive_frames) {
        if (frame_is_open || within_completed_frames >= WITHIN_MAX_FRAMES) {
          within_set_error("JPEG XL animation exceeds the 1,000-frame safety limit.");
          result = 23;
          goto cleanup;
        }
        within_output_position = 0;
        if (within_jxl_frame_start(
                within_completed_frames, frame_header.duration,
                frame_header.timecode, frame_header.is_last ? 1 : 0,
                within_image_width, within_image_height, within_image_bits,
                within_image_channels, within_animation_tps_numerator,
                within_animation_tps_denominator, within_animation_num_loops,
                within_animation_have_timecodes) != 0) {
          within_set_error("JPEG XL destination rejected the next frame.");
          result = 24;
          goto cleanup;
        }
        frame_is_open = 1;
      }
    } else if (status == JXL_DEC_NEED_IMAGE_OUT_BUFFER) {
      if (!within_image_width || output.initialized ||
          !within_start_png(&output, icc, icc_size)) {
        if (!within_error_message[0])
          within_set_error("Could not start the bounded JPEG XL pixel output.");
        result = 12;
        goto cleanup;
      }
      JxlPixelFormat format;
      format.num_channels = within_image_channels;
      format.data_type = within_image_bits == 16 ? JXL_TYPE_UINT16 : JXL_TYPE_UINT8;
      format.endianness = within_image_bits == 16 ? JXL_BIG_ENDIAN : JXL_NATIVE_ENDIAN;
      format.align = 0;
      if (JxlDecoderSetImageOutCallback(decoder, &format, within_image_callback,
                                        &output) != JXL_DEC_SUCCESS) {
        within_set_error("JPEG XL decoder rejected the bounded scanline callback.");
        result = 13;
        goto cleanup;
      }
    } else if (status == JXL_DEC_FULL_IMAGE) {
      if (!output.initialized || !within_flush_stripe(&output)) {
        if (!within_error_message[0]) within_set_error("JPEG XL image output is incomplete.");
        result = 14;
        goto cleanup;
      }
      if (!within_finish_png(&output) || within_output_position == 0) {
        if (!within_error_message[0]) within_set_error("JPEG XL conversion produced no PNG output.");
        result = 15;
        goto cleanup;
      }
      within_completed_frames++;
      if (!archive_frames) break;
      if (!frame_is_open ||
          within_jxl_frame_end(within_completed_frames - 1U) != 0) {
        within_set_error("JPEG XL destination could not finalize a frame.");
        result = 25;
        goto cleanup;
      }
      frame_is_open = 0;
      within_output_release(&output);
      memset(&output, 0, sizeof(output));
      within_output_position = 0;
    } else if (status == JXL_DEC_NEED_MORE_INPUT) {
      size_t unused = JxlDecoderReleaseInput(decoder);
      input_is_set = 0;
      if (unused > available) {
        within_set_error("JPEG XL decoder returned an invalid input remainder.");
        result = 16;
        goto cleanup;
      }
      if (unused == available && available == WITHIN_INPUT_WINDOW) {
        within_set_error("JPEG XL header requires more than the 1 MiB bounded input window.");
        result = 17;
        goto cleanup;
      }
      if (unused > 0) memmove(input, input + available - unused, unused);
      available = unused;
    } else if (status == JXL_DEC_ERROR) {
      if (within_decoder_memory.rejected) {
        snprintf(within_error_message, sizeof(within_error_message),
                 "JPEG XL decoder exceeded its 102 MiB allocation limit "
                 "(requested %zu bytes with %zu bytes active).",
                 within_decoder_memory.rejected_size,
                 within_decoder_memory.rejected_current);
      } else {
        within_set_error("JPEG XL codestream or container is invalid.");
      }
      result = 18;
      goto cleanup;
    } else if (status == JXL_DEC_SUCCESS) {
      if (archive_frames && within_completed_frames > 0 && !frame_is_open) break;
      within_set_error("JPEG XL decoder ended before producing a complete image.");
      result = 19;
      goto cleanup;
    }
  }

cleanup:
  if (input_is_set) JxlDecoderReleaseInput(decoder);
  JxlDecoderDestroy(decoder);
  free(icc);
  free(input);
  within_output_release(&output);
  if (within_completed_frames == 0 && result == 0) result = 20;
  return result;
}

EMSCRIPTEN_KEEPALIVE int within_jxl_to_png(uint32_t input_size) {
  return within_jxl_convert(input_size, 0);
}

EMSCRIPTEN_KEEPALIVE int within_jxl_to_png_frames(uint32_t input_size) {
  return within_jxl_convert(input_size, 1);
}

EMSCRIPTEN_KEEPALIVE const char *within_jxl_error(void) {
  return within_error_message;
}
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_width(void) { return within_image_width; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_height(void) { return within_image_height; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_bits(void) { return within_image_bits; }
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_channels(void) { return within_image_channels; }
EMSCRIPTEN_KEEPALIVE int within_jxl_has_animation(void) {
  return within_image_has_animation;
}
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_frame_count(void) {
  return within_completed_frames;
}
EMSCRIPTEN_KEEPALIVE uint32_t within_jxl_peak_decoder_allocation(void) {
  return (uint32_t)within_decoder_memory.peak;
}

#include <avif/avif.h>
#include <emscripten.h>
#include <libavutil/pixfmt.h>
#include <libswscale/swscale.h>
#include <png.h>

#include <inttypes.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WITHIN_INPUT_READ (256U * 1024U)
#define WITHIN_MAX_INPUT_REQUEST (16U * 1024U * 1024U)
#define WITHIN_OUTPUT_WRITE (64U * 1024U)
#define WITHIN_MAX_INPUT (64U * 1024U * 1024U)
#define WITHIN_MAX_OUTPUT (96U * 1024U * 1024U)
#define WITHIN_MAX_DIMENSION 8192U
#define WITHIN_MAX_PIXELS 8388608ULL
#define WITHIN_MAX_FRAME_SURFACE (16U * 1024U * 1024U)
#define WITHIN_MAX_ICC (4U * 1024U * 1024U)
#define WITHIN_MAX_FRAMES 1000U

typedef struct {
  avifIO io;
  uint64_t input_size;
  uint8_t *buffer;
  size_t capacity;
} within_avif_io;

typedef struct {
  png_structp png;
  png_infop info;
  int failed;
} within_png_output;

static char within_error_message[1024];
static uint64_t within_output_position;
static uint32_t within_image_width;
static uint32_t within_image_height;
static uint32_t within_image_depth;
static uint32_t within_image_channels;
static uint32_t within_completed_frames;

EM_ASYNC_JS(int, within_avif_input_read,
            (uint64_t offset, unsigned char *destination, int length), {
  try {
    return await Module.withinBridge.read(
      Number(offset), HEAPU8.subarray(destination, destination + length));
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

EM_ASYNC_JS(int, within_png_output_write,
            (uint64_t offset, const unsigned char *source, int length), {
  try {
    return await Module.withinBridge.write(
      Number(offset), HEAPU8.slice(source, source + length));
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

EM_ASYNC_JS(int, within_avif_frame_start,
            (uint32_t index, uint32_t width, uint32_t height, uint32_t depth,
             uint32_t channels, uint32_t frame_count, int repetition_count,
             double timescale, double pts, double duration), {
  try {
    return await Module.withinBridge.frameStart(
      index, width, height, depth, channels, frame_count, repetition_count,
      timescale, pts, duration);
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

EM_ASYNC_JS(int, within_avif_frame_end,
            (uint32_t index, double output_size), {
  try {
    return await Module.withinBridge.frameEnd(index, output_size);
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

static void within_set_error(const char *message) {
  if (!message) message = "AVIF conversion failed.";
  snprintf(within_error_message, sizeof(within_error_message), "%s", message);
}

static void within_set_avif_error(const char *prefix, avifResult result,
                                  const avifDiagnostics *diagnostics) {
  const char *detail = diagnostics ? diagnostics->error : NULL;
  if (detail && detail[0]) {
    snprintf(within_error_message, sizeof(within_error_message), "%s: %s (%s).",
             prefix, avifResultToString(result), detail);
  } else {
    snprintf(within_error_message, sizeof(within_error_message), "%s: %s.",
             prefix, avifResultToString(result));
  }
}

static avifResult within_io_read(struct avifIO *base, uint32_t read_flags,
                                 uint64_t offset, size_t size,
                                 avifROData *output) {
  within_avif_io *io = (within_avif_io *)base;
  if (!io || !output || read_flags != 0 || offset > io->input_size) {
    return AVIF_RESULT_IO_ERROR;
  }
  if (offset == io->input_size) {
    output->data = io->buffer;
    output->size = 0;
    return AVIF_RESULT_OK;
  }
  uint64_t available = io->input_size - offset;
  if ((uint64_t)size > available) size = (size_t)available;
  if (size > WITHIN_MAX_INPUT_REQUEST) {
    within_set_error("AVIF frame data exceeds the 16 MiB bounded input-request limit.");
    return AVIF_RESULT_IO_ERROR;
  }
  if (size > io->capacity) {
    uint8_t *replacement = (uint8_t *)realloc(io->buffer, size ? size : 1U);
    if (!replacement) {
      within_set_error("Could not allocate the bounded AVIF input window.");
      return AVIF_RESULT_OUT_OF_MEMORY;
    }
    io->buffer = replacement;
    io->capacity = size;
  }
  size_t completed = 0;
  while (completed < size) {
    size_t wanted = size - completed;
    if (wanted > WITHIN_INPUT_READ) wanted = WITHIN_INPUT_READ;
    int result = within_avif_input_read(offset + completed,
                                        io->buffer + completed, (int)wanted);
    if (result <= 0 || (size_t)result > wanted) {
      within_set_error("AVIF input bridge rejected a bounded read.");
      return AVIF_RESULT_IO_ERROR;
    }
    completed += (size_t)result;
  }
  output->data = io->buffer;
  output->size = size;
  return AVIF_RESULT_OK;
}

static void within_png_write(png_structp png, png_bytep data,
                             png_size_t length) {
  within_png_output *output = (within_png_output *)png_get_io_ptr(png);
  if (!output || output->failed) return;
  while (length > 0) {
    int part = (int)(length > WITHIN_OUTPUT_WRITE ? WITHIN_OUTPUT_WRITE : length);
    if (within_output_position + (uint64_t)part > WITHIN_MAX_OUTPUT) {
      output->failed = 1;
      within_set_error("AVIF frame PNG exceeds the 96 MiB output limit.");
      return;
    }
    int result = within_png_output_write(within_output_position, data, part);
    if (result != part) {
      output->failed = 1;
      within_set_error("AVIF frame destination rejected a bounded PNG write.");
      return;
    }
    within_output_position += (uint64_t)part;
    data += part;
    length -= (png_size_t)part;
  }
}

static void within_png_flush(png_structp png) { (void)png; }

static int within_write_png(const avifImage *image, const avifRGBImage *rgb) {
  within_png_output output;
  memset(&output, 0, sizeof(output));
  output.png = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
  if (!output.png) {
    within_set_error("Could not create the bounded AVIF PNG encoder.");
    return 0;
  }
  output.info = png_create_info_struct(output.png);
  if (!output.info) {
    png_destroy_write_struct(&output.png, NULL);
    within_set_error("Could not create AVIF PNG metadata.");
    return 0;
  }
  if (setjmp(png_jmpbuf(output.png))) {
    png_destroy_write_struct(&output.png, &output.info);
    if (!within_error_message[0])
      within_set_error("libpng rejected a decoded AVIF frame.");
    return 0;
  }
  png_set_write_fn(output.png, &output, within_png_write, within_png_flush);
  int color_type =
      rgb->format == AVIF_RGB_FORMAT_RGBA ? PNG_COLOR_TYPE_RGBA : PNG_COLOR_TYPE_RGB;
  png_set_IHDR(output.png, output.info, rgb->width, rgb->height,
               rgb->depth > 8 ? 16 : 8, color_type, PNG_INTERLACE_NONE,
               PNG_COMPRESSION_TYPE_DEFAULT, PNG_FILTER_TYPE_DEFAULT);
  png_set_compression_level(output.png, 1);
  if (image->icc.size >= 128 && image->icc.size <= WITHIN_MAX_ICC) {
    png_set_iCCP(output.png, output.info, "AVIF ICC", PNG_COMPRESSION_TYPE_BASE,
                 image->icc.data, (png_uint_32)image->icc.size);
  }
  png_write_info(output.png, output.info);
  if (rgb->depth > 8) png_set_swap(output.png);
  for (uint32_t row = 0; row < rgb->height; ++row) {
    png_write_row(output.png, rgb->pixels + (size_t)row * rgb->rowBytes);
    if (output.failed) break;
  }
  if (!output.failed) png_write_end(output.png, output.info);
  png_destroy_write_struct(&output.png, &output.info);
  return output.failed || within_output_position == 0 ? 0 : 1;
}

static enum AVPixelFormat within_input_pixel_format(const avifImage *image) {
  int alpha = image->alphaPlane != NULL;
  if (image->yuvFormat == AVIF_PIXEL_FORMAT_YUV400) {
    if (alpha) return image->depth == 8 ? AV_PIX_FMT_YA8 : AV_PIX_FMT_NONE;
    if (image->depth == 8) return AV_PIX_FMT_GRAY8;
    if (image->depth == 10) return AV_PIX_FMT_GRAY10LE;
    if (image->depth == 12) return AV_PIX_FMT_GRAY12LE;
    return AV_PIX_FMT_GRAY16LE;
  }
  if (image->yuvFormat == AVIF_PIXEL_FORMAT_YUV420) {
    if (alpha) {
      if (image->depth == 8) return AV_PIX_FMT_YUVA420P;
      if (image->depth == 10) return AV_PIX_FMT_YUVA420P10LE;
      if (image->depth == 12) return AV_PIX_FMT_NONE;
      return AV_PIX_FMT_YUVA420P16LE;
    }
    if (image->depth == 8) return AV_PIX_FMT_YUV420P;
    if (image->depth == 10) return AV_PIX_FMT_YUV420P10LE;
    if (image->depth == 12) return AV_PIX_FMT_YUV420P12LE;
    return AV_PIX_FMT_YUV420P16LE;
  }
  if (image->yuvFormat == AVIF_PIXEL_FORMAT_YUV422) {
    if (alpha) {
      if (image->depth == 8) return AV_PIX_FMT_YUVA422P;
      if (image->depth == 10) return AV_PIX_FMT_YUVA422P10LE;
      if (image->depth == 12) return AV_PIX_FMT_YUVA422P12LE;
      return AV_PIX_FMT_YUVA422P16LE;
    }
    if (image->depth == 8) return AV_PIX_FMT_YUV422P;
    if (image->depth == 10) return AV_PIX_FMT_YUV422P10LE;
    if (image->depth == 12) return AV_PIX_FMT_YUV422P12LE;
    return AV_PIX_FMT_YUV422P16LE;
  }
  if (image->yuvFormat == AVIF_PIXEL_FORMAT_YUV444) {
    if (alpha) {
      if (image->depth == 8) return AV_PIX_FMT_YUVA444P;
      if (image->depth == 10) return AV_PIX_FMT_YUVA444P10LE;
      if (image->depth == 12) return AV_PIX_FMT_YUVA444P12LE;
      return AV_PIX_FMT_YUVA444P16LE;
    }
    if (image->depth == 8) return AV_PIX_FMT_YUV444P;
    if (image->depth == 10) return AV_PIX_FMT_YUV444P10LE;
    if (image->depth == 12) return AV_PIX_FMT_YUV444P12LE;
    return AV_PIX_FMT_YUV444P16LE;
  }
  return AV_PIX_FMT_NONE;
}

static int within_sws_colorspace(const avifImage *image) {
  switch (image->matrixCoefficients) {
    case AVIF_MATRIX_COEFFICIENTS_BT709:
      return SWS_CS_ITU709;
    case AVIF_MATRIX_COEFFICIENTS_BT2020_NCL:
    case AVIF_MATRIX_COEFFICIENTS_BT2020_CL:
      return SWS_CS_BT2020;
    case AVIF_MATRIX_COEFFICIENTS_SMPTE240:
      return SWS_CS_SMPTE240M;
    case AVIF_MATRIX_COEFFICIENTS_BT470BG:
    case AVIF_MATRIX_COEFFICIENTS_BT601:
    case AVIF_MATRIX_COEFFICIENTS_UNSPECIFIED:
    default:
      return SWS_CS_ITU601;
  }
}

static avifResult within_yuv_to_rgb(const avifImage *image,
                                    avifRGBImage *rgb) {
  enum AVPixelFormat input_format = within_input_pixel_format(image);
  enum AVPixelFormat output_format;
  if (rgb->depth > 8) {
    output_format = rgb->format == AVIF_RGB_FORMAT_RGBA
                        ? AV_PIX_FMT_RGBA64LE
                        : AV_PIX_FMT_RGB48LE;
  } else {
    output_format = rgb->format == AVIF_RGB_FORMAT_RGBA ? AV_PIX_FMT_RGBA
                                                        : AV_PIX_FMT_RGB24;
  }
  if (input_format == AV_PIX_FMT_NONE) return AVIF_RESULT_NOT_IMPLEMENTED;
  struct SwsContext *sws =
      sws_getContext((int)image->width, (int)image->height, input_format,
                     (int)image->width, (int)image->height, output_format,
                     SWS_BICUBIC, NULL, NULL, NULL);
  if (!sws) return AVIF_RESULT_OUT_OF_MEMORY;
  int colorspace = within_sws_colorspace(image);
  const int *coefficients = sws_getCoefficients(colorspace);
  if (!coefficients ||
      sws_setColorspaceDetails(sws, coefficients,
                               image->yuvRange == AVIF_RANGE_FULL ? 1 : 0,
                               coefficients, 1, 0, 1 << 16, 1 << 16) < 0) {
    sws_freeContext(sws);
    return AVIF_RESULT_NOT_IMPLEMENTED;
  }
  const uint8_t *source[4] = {image->yuvPlanes[0], image->yuvPlanes[1],
                              image->yuvPlanes[2], image->alphaPlane};
  int source_strides[4] = {(int)image->yuvRowBytes[0],
                           (int)image->yuvRowBytes[1],
                           (int)image->yuvRowBytes[2],
                           (int)image->alphaRowBytes};
  uint8_t *destination[4] = {rgb->pixels, NULL, NULL, NULL};
  int destination_strides[4] = {(int)rgb->rowBytes, 0, 0, 0};
  int rows = sws_scale(sws, source, source_strides, 0, (int)image->height,
                       destination, destination_strides);
  sws_freeContext(sws);
  return rows == (int)image->height ? AVIF_RESULT_OK
                                    : AVIF_RESULT_REFORMAT_FAILED;
}

EMSCRIPTEN_KEEPALIVE int within_avif_to_png_frames(uint32_t input_size) {
  within_error_message[0] = '\0';
  within_output_position = 0;
  within_image_width = 0;
  within_image_height = 0;
  within_image_depth = 0;
  within_image_channels = 0;
  within_completed_frames = 0;
  if (input_size < 1 || input_size > WITHIN_MAX_INPUT) {
    within_set_error("AVIF input must be between 1 byte and 64 MiB.");
    return 1;
  }

  int result_code = 0;
  avifDecoder *decoder = avifDecoderCreate();
  within_avif_io io;
  memset(&io, 0, sizeof(io));
  if (!decoder) {
    within_set_error("Could not allocate the AVIF decoder.");
    return 2;
  }
  io.io.read = within_io_read;
  io.io.sizeHint = input_size;
  io.io.persistent = AVIF_FALSE;
  io.input_size = input_size;
  decoder->codecChoice = AVIF_CODEC_CHOICE_AOM;
  decoder->maxThreads = 1;
  decoder->allowProgressive = AVIF_FALSE;
  decoder->allowIncremental = AVIF_FALSE;
  decoder->ignoreExif = AVIF_TRUE;
  decoder->ignoreXMP = AVIF_TRUE;
  decoder->imageSizeLimit = (uint32_t)WITHIN_MAX_PIXELS;
  decoder->imageDimensionLimit = WITHIN_MAX_DIMENSION;
  decoder->imageCountLimit = WITHIN_MAX_FRAMES;
  decoder->imageContentToDecode = AVIF_IMAGE_CONTENT_COLOR_AND_ALPHA;
  avifDecoderSetIO(decoder, &io.io);
  avifResult avif_result = avifDecoderSetSource(decoder, AVIF_DECODER_SOURCE_TRACKS);
  if (avif_result != AVIF_RESULT_OK) {
    within_set_avif_error("Could not select the AVIF animation track", avif_result,
                          &decoder->diag);
    result_code = 3;
    goto cleanup;
  }
  avif_result = avifDecoderParse(decoder);
  if (avif_result != AVIF_RESULT_OK) {
    if (!within_error_message[0])
      within_set_avif_error("Could not parse the bounded AVIF input", avif_result,
                            &decoder->diag);
    result_code = 4;
    goto cleanup;
  }
  if (decoder->imageCount < 1 || decoder->imageCount > (int)WITHIN_MAX_FRAMES ||
      decoder->timescale == 0) {
    within_set_error("AVIF animation has an invalid frame count or timebase.");
    result_code = 5;
    goto cleanup;
  }

  for (int index = 0; index < decoder->imageCount; ++index) {
    avif_result = avifDecoderNextImage(decoder);
    if (avif_result != AVIF_RESULT_OK) {
      if (!within_error_message[0])
        within_set_avif_error("Could not decode the next AVIF frame", avif_result,
                              &decoder->diag);
      result_code = 6;
      goto cleanup;
    }
    const avifImage *image = decoder->image;
    if (!image || image->width < 1 || image->height < 1 ||
        image->width > WITHIN_MAX_DIMENSION ||
        image->height > WITHIN_MAX_DIMENSION ||
        (uint64_t)image->width * image->height > WITHIN_MAX_PIXELS ||
        (image->depth != 8 && image->depth != 10 && image->depth != 12 &&
         image->depth != 16)) {
      within_set_error("Decoded AVIF frame exceeds the bounded dimension or depth policy.");
      result_code = 7;
      goto cleanup;
    }
    if (image->icc.size > WITHIN_MAX_ICC) {
      within_set_error("AVIF ICC profile exceeds the 4 MiB safety limit.");
      result_code = 8;
      goto cleanup;
    }
    if (image->transformFlags & (AVIF_TRANSFORM_CLAP | AVIF_TRANSFORM_IROT |
                                 AVIF_TRANSFORM_IMIR)) {
      within_set_error("AVIF crop, rotation, and mirror transforms are not yet supported by frame extraction.");
      result_code = 9;
      goto cleanup;
    }

    avifRGBImage rgb;
    avifRGBImageSetDefaults(&rgb, image);
    rgb.format = image->alphaPlane ? AVIF_RGB_FORMAT_RGBA : AVIF_RGB_FORMAT_RGB;
    rgb.depth = image->depth > 8 ? 16 : 8;
    rgb.chromaUpsampling = AVIF_CHROMA_UPSAMPLING_BEST_QUALITY;
    rgb.avoidLibYUV = AVIF_TRUE;
    rgb.maxThreads = 1;
    uint32_t channels = avifRGBFormatChannelCount(rgb.format);
    size_t bytes_per_sample = rgb.depth > 8 ? 2U : 1U;
    uint64_t row_bytes = (uint64_t)image->width * channels * bytes_per_sample;
    uint64_t surface_bytes = row_bytes * image->height;
    if (row_bytes > UINT32_MAX || surface_bytes < 1 ||
        surface_bytes > WITHIN_MAX_FRAME_SURFACE) {
      within_set_error("Decoded AVIF frame exceeds the 16 MiB frame-surface limit.");
      result_code = 10;
      goto cleanup;
    }
    rgb.rowBytes = (uint32_t)row_bytes;
    rgb.pixels = (uint8_t *)malloc((size_t)surface_bytes);
    if (!rgb.pixels) {
      within_set_error("Could not allocate the bounded AVIF RGB frame surface.");
      result_code = 11;
      goto cleanup;
    }
    avif_result = within_yuv_to_rgb(image, &rgb);
    if (avif_result != AVIF_RESULT_OK) {
      free(rgb.pixels);
      within_set_avif_error("Could not convert AVIF YUV samples to RGB", avif_result,
                            &decoder->diag);
      result_code = 12;
      goto cleanup;
    }

    within_image_width = image->width;
    within_image_height = image->height;
    within_image_depth = rgb.depth;
    within_image_channels = channels;
    within_output_position = 0;
    if (within_avif_frame_start(
            (uint32_t)index, image->width, image->height, rgb.depth, channels,
            (uint32_t)decoder->imageCount, decoder->repetitionCount,
            (double)decoder->timescale,
            (double)decoder->imageTiming.ptsInTimescales,
            (double)decoder->imageTiming.durationInTimescales) != 0) {
      free(rgb.pixels);
      within_set_error("AVIF destination rejected the next frame.");
      result_code = 13;
      goto cleanup;
    }
    if (!within_write_png(image, &rgb)) {
      free(rgb.pixels);
      if (!within_error_message[0])
        within_set_error("Could not encode the decoded AVIF frame as PNG.");
      result_code = 14;
      goto cleanup;
    }
    free(rgb.pixels);
    if (within_avif_frame_end((uint32_t)index,
                              (double)within_output_position) != 0) {
      within_set_error("AVIF destination could not finalize a frame.");
      result_code = 15;
      goto cleanup;
    }
    within_completed_frames++;
  }

cleanup:
  free(io.buffer);
  avifDecoderDestroy(decoder);
  if (result_code == 0 && within_completed_frames == 0) {
    within_set_error("AVIF conversion produced no complete frames.");
    return 16;
  }
  return result_code;
}

EMSCRIPTEN_KEEPALIVE const char *within_avif_error(void) {
  return within_error_message;
}
EMSCRIPTEN_KEEPALIVE uint32_t within_avif_width(void) {
  return within_image_width;
}
EMSCRIPTEN_KEEPALIVE uint32_t within_avif_height(void) {
  return within_image_height;
}
EMSCRIPTEN_KEEPALIVE uint32_t within_avif_depth(void) {
  return within_image_depth;
}
EMSCRIPTEN_KEEPALIVE uint32_t within_avif_channels(void) {
  return within_image_channels;
}
EMSCRIPTEN_KEEPALIVE uint32_t within_avif_frame_count(void) {
  return within_completed_frames;
}

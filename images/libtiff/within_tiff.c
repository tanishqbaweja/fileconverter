#include <emscripten.h>
#include <png.h>
#include <tiffio.h>

#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WITHIN_INPUT_CHUNK (256U * 1024U)
#define WITHIN_OUTPUT_CHUNK (64U * 1024U)
#define WITHIN_MAX_INPUT (64U * 1024U * 1024U)
#define WITHIN_MAX_OUTPUT (64U * 1024U * 1024U)
#define WITHIN_MAX_DIMENSION 8192U
#define WITHIN_MAX_PIXELS 16777216ULL
#define WITHIN_MAX_STRIP_BYTES (4U * 1024U * 1024U)
#define WITHIN_MAX_RATIO 1000ULL

typedef struct {
  uint64_t size;
  uint64_t position;
} within_input;

static char within_error_message[1024];
static uint64_t within_output_position;

EM_ASYNC_JS(int, within_tiff_input_read,
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

static void within_set_error(const char *format, ...) {
  va_list arguments;
  va_start(arguments, format);
  vsnprintf(within_error_message, sizeof(within_error_message), format, arguments);
  va_end(arguments);
}

static void within_tiff_error_handler(const char *module, const char *format,
                                      va_list arguments) {
  size_t offset = 0;
  if (module && module[0]) {
    offset = (size_t)snprintf(within_error_message, sizeof(within_error_message),
                              "%s: ", module);
    if (offset >= sizeof(within_error_message)) offset = 0;
  }
  vsnprintf(within_error_message + offset, sizeof(within_error_message) - offset,
            format, arguments);
}

static tmsize_t within_read(thandle_t handle, void *buffer, tmsize_t requested) {
  within_input *input = (within_input *)handle;
  if (requested <= 0 || input->position >= input->size) return 0;
  uint64_t remaining = input->size - input->position;
  uint64_t wanted = (uint64_t)requested < remaining ? (uint64_t)requested : remaining;
  uint64_t completed = 0;
  while (completed < wanted) {
    uint64_t pending = wanted - completed;
    int part = (int)(pending > WITHIN_INPUT_CHUNK ? WITHIN_INPUT_CHUNK : pending);
    int result = within_tiff_input_read(input->position,
                                        (unsigned char *)buffer + completed, part);
    if (result < 0) return -1;
    if (result == 0) break;
    if (result > part) {
      within_set_error("TIFF input bridge exceeded its bounded read.");
      return -1;
    }
    input->position += (uint64_t)result;
    completed += (uint64_t)result;
    if (result < part) break;
  }
  return (tmsize_t)completed;
}

static tmsize_t within_write_disabled(thandle_t handle, void *buffer,
                                     tmsize_t size) {
  (void)handle;
  (void)buffer;
  (void)size;
  return -1;
}

static toff_t within_seek(thandle_t handle, toff_t offset, int whence) {
  within_input *input = (within_input *)handle;
  uint64_t target;
  if (whence == SEEK_SET) {
    target = (uint64_t)offset;
  } else if (whence == SEEK_CUR) {
    if ((uint64_t)offset > UINT64_MAX - input->position) return (toff_t)-1;
    target = input->position + (uint64_t)offset;
  } else if (whence == SEEK_END) {
    if ((uint64_t)offset > UINT64_MAX - input->size) return (toff_t)-1;
    target = input->size + (uint64_t)offset;
  } else {
    return (toff_t)-1;
  }
  if (target > input->size) return (toff_t)-1;
  input->position = target;
  return (toff_t)target;
}

static int within_close(thandle_t handle) {
  (void)handle;
  return 0;
}

static toff_t within_size(thandle_t handle) {
  return (toff_t)((within_input *)handle)->size;
}

static int within_map(thandle_t handle, void **base, toff_t *size) {
  (void)handle;
  (void)base;
  (void)size;
  return 0;
}

static void within_unmap(thandle_t handle, void *base, toff_t size) {
  (void)handle;
  (void)base;
  (void)size;
}

static void within_png_write(png_structp png, png_bytep data, png_size_t length) {
  while (length > 0) {
    int part = (int)(length > WITHIN_OUTPUT_CHUNK ? WITHIN_OUTPUT_CHUNK : length);
    if (within_output_position + (uint64_t)part > WITHIN_MAX_OUTPUT) {
      png_error(png, "PNG output exceeds the 64 MiB safety limit");
    }
    int result = within_png_output_write(within_output_position, data, part);
    if (result != part) png_error(png, "PNG destination rejected a bounded write");
    within_output_position += (uint64_t)part;
    data += part;
    length -= (png_size_t)part;
  }
}

static void within_png_flush(png_structp png) { (void)png; }

static int within_supported_compression(uint16_t compression) {
  return compression == COMPRESSION_NONE || compression == COMPRESSION_PACKBITS ||
         compression == COMPRESSION_LZW || compression == COMPRESSION_ADOBE_DEFLATE ||
         compression == COMPRESSION_DEFLATE;
}

EMSCRIPTEN_KEEPALIVE const char *within_tiff_error(void) {
  return within_error_message;
}

EMSCRIPTEN_KEEPALIVE int within_tiff_to_png(uint32_t input_size) {
  TIFF *tiff = NULL;
  png_structp png = NULL;
  png_infop info = NULL;
  unsigned char *row = NULL;
  unsigned char *converted = NULL;
  png_color *palette = NULL;
  int result = 1;
  within_input input = {(uint64_t)input_size, 0};
  within_error_message[0] = '\0';
  within_output_position = 0;

  if (input_size < 8 || input_size > WITHIN_MAX_INPUT) {
    within_set_error("TIFF input must be between 8 bytes and 64 MiB.");
    return 2;
  }

  TIFFSetErrorHandler(within_tiff_error_handler);
  TIFFSetWarningHandler(NULL);
  TIFFOpenOptions *options = TIFFOpenOptionsAlloc();
  if (!options) {
    within_set_error("Could not allocate bounded TIFF open options.");
    return 3;
  }
  TIFFOpenOptionsSetMaxSingleMemAlloc(options, 8U * 1024U * 1024U);
  TIFFOpenOptionsSetWarnAboutUnknownTags(options, 0);
  tiff = TIFFClientOpenExt("within-input.tiff", "r", (thandle_t)&input,
                           within_read, within_write_disabled, within_seek,
                           within_close, within_size, within_map, within_unmap,
                           options);
  TIFFOpenOptionsFree(options);
  if (!tiff) {
    if (!within_error_message[0]) within_set_error("TIFF header or directory is invalid.");
    return 4;
  }

  uint32_t width = 0, height = 0;
  uint16_t bits = 0, samples = 0, photometric = 0, planar = 0;
  uint16_t compression = 0, orientation = ORIENTATION_TOPLEFT;
  if (!TIFFGetField(tiff, TIFFTAG_IMAGEWIDTH, &width) ||
      !TIFFGetField(tiff, TIFFTAG_IMAGELENGTH, &height) ||
      !TIFFGetFieldDefaulted(tiff, TIFFTAG_BITSPERSAMPLE, &bits) ||
      !TIFFGetFieldDefaulted(tiff, TIFFTAG_SAMPLESPERPIXEL, &samples) ||
      !TIFFGetField(tiff, TIFFTAG_PHOTOMETRIC, &photometric) ||
      !TIFFGetFieldDefaulted(tiff, TIFFTAG_PLANARCONFIG, &planar) ||
      !TIFFGetFieldDefaulted(tiff, TIFFTAG_COMPRESSION, &compression) ||
      !TIFFGetFieldDefaulted(tiff, TIFFTAG_ORIENTATION, &orientation)) {
    within_set_error("TIFF is missing required image tags.");
    goto cleanup;
  }
  uint64_t pixels = (uint64_t)width * (uint64_t)height;
  if (width == 0 || height == 0 || width > WITHIN_MAX_DIMENSION ||
      height > WITHIN_MAX_DIMENSION || pixels > WITHIN_MAX_PIXELS) {
    within_set_error("TIFF dimensions exceed the 8,192-pixel edge or 16-megapixel safety limit.");
    goto cleanup;
  }
  if (bits != 8 || planar != PLANARCONFIG_CONTIG || orientation != ORIENTATION_TOPLEFT) {
    within_set_error("TIFF profile requires 8-bit contiguous top-left scanlines.");
    goto cleanup;
  }
  if (TIFFIsTiled(tiff)) {
    within_set_error("Tiled TIFF images are outside the bounded scanline profile.");
    goto cleanup;
  }
  if (!TIFFLastDirectory(tiff)) {
    within_set_error("Multipage TIFF images are outside the single-image profile.");
    goto cleanup;
  }
  if (!within_supported_compression(compression)) {
    within_set_error("TIFF compression is not supported; use none, PackBits, LZW, or Deflate.");
    goto cleanup;
  }
  uint64_t decoded_bytes = pixels * (uint64_t)samples;
  if (input_size >= 1024U * 1024U && decoded_bytes > (uint64_t)input_size * WITHIN_MAX_RATIO) {
    within_set_error("TIFF decompression ratio exceeds the 1,000:1 safety limit.");
    goto cleanup;
  }
  uint64_t scanline_size = TIFFScanlineSize64(tiff);
  uint64_t strip_size = TIFFStripSize64(tiff);
  if (scanline_size == 0 || scanline_size > WITHIN_MAX_STRIP_BYTES ||
      strip_size == 0 || strip_size > WITHIN_MAX_STRIP_BYTES) {
    within_set_error("TIFF scanline or decoded strip exceeds the 4 MiB safety limit.");
    goto cleanup;
  }

  int color_type;
  int output_samples;
  int associated_alpha = 0;
  uint16_t *red = NULL, *green = NULL, *blue = NULL;
  if ((photometric == PHOTOMETRIC_MINISBLACK || photometric == PHOTOMETRIC_MINISWHITE) && samples == 1) {
    color_type = PNG_COLOR_TYPE_GRAY;
    output_samples = 1;
  } else if (photometric == PHOTOMETRIC_PALETTE && samples == 1) {
    if (!TIFFGetField(tiff, TIFFTAG_COLORMAP, &red, &green, &blue)) {
      within_set_error("Palette TIFF is missing its color map.");
      goto cleanup;
    }
    color_type = PNG_COLOR_TYPE_PALETTE;
    output_samples = 1;
  } else if (photometric == PHOTOMETRIC_RGB && (samples == 3 || samples == 4)) {
    color_type = samples == 4 ? PNG_COLOR_TYPE_RGBA : PNG_COLOR_TYPE_RGB;
    output_samples = samples;
    if (samples == 4) {
      uint16_t extra_count = 0;
      uint16_t *extra_types = NULL;
      if (!TIFFGetField(tiff, TIFFTAG_EXTRASAMPLES, &extra_count, &extra_types) || extra_count != 1 ||
          (extra_types[0] != EXTRASAMPLE_ASSOCALPHA && extra_types[0] != EXTRASAMPLE_UNASSALPHA)) {
        within_set_error("Four-channel TIFF requires one associated or unassociated alpha sample.");
        goto cleanup;
      }
      associated_alpha = extra_types[0] == EXTRASAMPLE_ASSOCALPHA;
    }
  } else {
    within_set_error("TIFF photometric layout is outside the grayscale, palette, RGB, or RGBA profile.");
    goto cleanup;
  }
  if (scanline_size != (uint64_t)width * (uint64_t)samples) {
    within_set_error("TIFF scanline byte count does not match its declared 8-bit pixel layout.");
    goto cleanup;
  }

  row = (unsigned char *)_TIFFmalloc((tmsize_t)scanline_size);
  if (!row) {
    within_set_error("Could not allocate the bounded TIFF scanline.");
    goto cleanup;
  }
  if (associated_alpha || photometric == PHOTOMETRIC_MINISWHITE) {
    converted = (unsigned char *)malloc((size_t)width * (size_t)output_samples);
    if (!converted) {
      within_set_error("Could not allocate the bounded PNG scanline.");
      goto cleanup;
    }
  }

  png = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
  if (!png) {
    within_set_error("Could not create the PNG encoder.");
    goto cleanup;
  }
  info = png_create_info_struct(png);
  if (!info) {
    within_set_error("Could not create PNG metadata.");
    goto cleanup;
  }
  if (setjmp(png_jmpbuf(png))) {
    if (!within_error_message[0]) within_set_error("PNG encoding failed.");
    goto cleanup;
  }
  png_set_write_fn(png, NULL, within_png_write, within_png_flush);
  png_set_compression_buffer_size(png, 32U * 1024U);
  png_set_compression_level(png, 6);
  png_set_IHDR(png, info, width, height, 8, color_type, PNG_INTERLACE_NONE,
               PNG_COMPRESSION_TYPE_DEFAULT, PNG_FILTER_TYPE_DEFAULT);
  if (color_type == PNG_COLOR_TYPE_PALETTE) {
    palette = (png_color *)malloc(256U * sizeof(png_color));
    if (!palette) {
      within_set_error("Could not allocate the bounded PNG palette.");
      goto cleanup;
    }
    for (int index = 0; index < 256; ++index) {
      palette[index].red = (png_byte)(red[index] >> 8);
      palette[index].green = (png_byte)(green[index] >> 8);
      palette[index].blue = (png_byte)(blue[index] >> 8);
    }
    png_set_PLTE(png, info, palette, 256);
  }
  png_write_info(png, info);

  for (uint32_t y = 0; y < height; ++y) {
    if (TIFFReadScanline(tiff, row, y, 0) < 0) {
      if (!within_error_message[0]) within_set_error("TIFF scanline decoding failed at row %u.", y);
      goto cleanup;
    }
    png_bytep output_row = row;
    if (photometric == PHOTOMETRIC_MINISWHITE) {
      for (uint32_t x = 0; x < width; ++x) converted[x] = (unsigned char)(255U - row[x]);
      output_row = converted;
    } else if (associated_alpha) {
      for (uint32_t x = 0; x < width; ++x) {
        unsigned char alpha = row[x * 4U + 3U];
        converted[x * 4U + 3U] = alpha;
        for (uint32_t channel = 0; channel < 3; ++channel) {
          unsigned int value = row[x * 4U + channel];
          converted[x * 4U + channel] = alpha == 0 ? 0 :
              (unsigned char)((value * 255U + alpha / 2U) / alpha > 255U ? 255U :
                              (value * 255U + alpha / 2U) / alpha);
        }
      }
      output_row = converted;
    }
    png_write_row(png, output_row);
  }
  png_write_end(png, info);
  result = 0;

cleanup:
  if (palette) free(palette);
  if (converted) free(converted);
  if (row) _TIFFfree(row);
  if (png) png_destroy_write_struct(&png, info ? &info : NULL);
  if (tiff) TIFFClose(tiff);
  return result;
}

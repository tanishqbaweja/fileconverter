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
         compression == COMPRESSION_DEFLATE || compression == COMPRESSION_JPEG;
}

static uint16_t within_read_u16(const unsigned char *source) {
  uint16_t value;
  memcpy(&value, source, sizeof(value));
  return value;
}

static void within_write_u16(unsigned char *destination, uint16_t value) {
  memcpy(destination, &value, sizeof(value));
}

static void within_transform_row(const unsigned char *source,
                                 unsigned char *destination, uint32_t width,
                                 uint16_t samples, uint16_t bits,
                                 uint16_t photometric, int associated_alpha,
                                 int horizontal_flip) {
  uint32_t bytes_per_sample = bits / 8U;
  uint32_t pixel_bytes = (uint32_t)samples * bytes_per_sample;
  uint32_t maximum = bits == 16 ? 65535U : 255U;
  for (uint32_t output_x = 0; output_x < width; ++output_x) {
    uint32_t source_x = horizontal_flip ? width - 1U - output_x : output_x;
    const unsigned char *input_pixel = source + (uint64_t)source_x * pixel_bytes;
    unsigned char *output_pixel = destination + (uint64_t)output_x * pixel_bytes;
    if (bits == 8) {
      if (photometric == PHOTOMETRIC_MINISWHITE) {
        output_pixel[0] = (unsigned char)(255U - input_pixel[0]);
      } else if (associated_alpha) {
        unsigned int alpha = input_pixel[3];
        output_pixel[3] = (unsigned char)alpha;
        for (uint32_t channel = 0; channel < 3; ++channel) {
          unsigned int numerator = (unsigned int)input_pixel[channel] * maximum + alpha / 2U;
          unsigned int value = alpha == 0 ? 0 : numerator / alpha;
          output_pixel[channel] = (unsigned char)(value > maximum ? maximum : value);
        }
      } else {
        memcpy(output_pixel, input_pixel, pixel_bytes);
      }
    } else {
      if (photometric == PHOTOMETRIC_MINISWHITE) {
        within_write_u16(output_pixel,
                         (uint16_t)(maximum - within_read_u16(input_pixel)));
      } else if (associated_alpha) {
        uint32_t alpha = within_read_u16(input_pixel + 6U);
        within_write_u16(output_pixel + 6U, (uint16_t)alpha);
        for (uint32_t channel = 0; channel < 3; ++channel) {
          uint32_t sample = within_read_u16(input_pixel + channel * 2U);
          uint64_t numerator = (uint64_t)sample * maximum + alpha / 2U;
          uint32_t value = alpha == 0 ? 0 : (uint32_t)(numerator / alpha);
          within_write_u16(output_pixel + channel * 2U,
                           (uint16_t)(value > maximum ? maximum : value));
        }
      } else {
        memcpy(output_pixel, input_pixel, pixel_bytes);
      }
    }
  }
}

EMSCRIPTEN_KEEPALIVE const char *within_tiff_error(void) {
  return within_error_message;
}

EMSCRIPTEN_KEEPALIVE int within_tiff_to_png(uint32_t input_size) {
  TIFF *tiff = NULL;
  png_structp png = NULL;
  png_infop info = NULL;
  unsigned char *row = NULL;
  unsigned char *plane_row = NULL;
  unsigned char *converted = NULL;
  unsigned char *tile = NULL;
  unsigned char *tile_stripe = NULL;
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
  if ((bits != 8 && bits != 16) ||
      (planar != PLANARCONFIG_CONTIG && planar != PLANARCONFIG_SEPARATE) ||
      orientation < ORIENTATION_TOPLEFT || orientation > ORIENTATION_BOTLEFT) {
    within_set_error("TIFF profile requires 8- or 16-bit contiguous or separated pixels in a non-transposed orientation.");
    goto cleanup;
  }
  if (!TIFFLastDirectory(tiff)) {
    within_set_error("Multipage TIFF images are outside the single-image profile.");
    goto cleanup;
  }
  if (!within_supported_compression(compression)) {
    within_set_error("TIFF compression is not supported; use none, PackBits, LZW, Deflate, or JPEG.");
    goto cleanup;
  }
  if (compression == COMPRESSION_JPEG && bits != 8) {
    within_set_error("JPEG-compressed TIFF is limited to 8-bit samples.");
    goto cleanup;
  }
  if (compression == COMPRESSION_JPEG && photometric == PHOTOMETRIC_YCBCR) {
    if (!TIFFSetField(tiff, TIFFTAG_JPEGCOLORMODE, JPEGCOLORMODE_RGB)) {
      within_set_error("JPEG TIFF could not enable bounded RGB scanline decoding.");
      goto cleanup;
    }
    photometric = PHOTOMETRIC_RGB;
  }
  uint32_t bytes_per_sample = bits / 8U;
  uint64_t decoded_bytes = pixels * (uint64_t)samples * bytes_per_sample;
  if (input_size >= 1024U * 1024U && decoded_bytes > (uint64_t)input_size * WITHIN_MAX_RATIO) {
    within_set_error("TIFF decompression ratio exceeds the 1,000:1 safety limit.");
    goto cleanup;
  }
  uint64_t row_bytes = (uint64_t)width * samples * bytes_per_sample;
  uint64_t plane_row_bytes = (uint64_t)width * bytes_per_sample;
  int tiled = TIFFIsTiled(tiff);
  uint32_t tile_width = 0, tile_length = 0;
  uint64_t tile_size = 0, tile_row_bytes = 0, tile_stripe_bytes = 0;
  if (tiled) {
    if (!TIFFGetField(tiff, TIFFTAG_TILEWIDTH, &tile_width) ||
        !TIFFGetField(tiff, TIFFTAG_TILELENGTH, &tile_length) ||
        tile_width == 0 || tile_length == 0) {
      within_set_error("Tiled TIFF is missing valid tile dimensions.");
      goto cleanup;
    }
    tile_size = TIFFTileSize64(tiff);
    tile_row_bytes = TIFFTileRowSize64(tiff);
    tile_stripe_bytes = row_bytes * tile_length;
    uint64_t expected_tile_row = (uint64_t)tile_width * bytes_per_sample *
                                 (planar == PLANARCONFIG_CONTIG ? samples : 1U);
    if (tile_size == 0 || tile_size > WITHIN_MAX_STRIP_BYTES ||
        tile_row_bytes != expected_tile_row ||
        tile_stripe_bytes == 0 || tile_stripe_bytes > WITHIN_MAX_STRIP_BYTES) {
      within_set_error("TIFF decoded tile or assembled tile stripe exceeds the 4 MiB safety limit.");
      goto cleanup;
    }
  } else {
    uint64_t scanline_size = TIFFScanlineSize64(tiff);
    uint64_t strip_size = TIFFStripSize64(tiff);
    uint64_t expected_scanline_size = planar == PLANARCONFIG_CONTIG
                                          ? row_bytes
                                          : plane_row_bytes;
    if (scanline_size != expected_scanline_size || scanline_size == 0 ||
        scanline_size > WITHIN_MAX_STRIP_BYTES || strip_size == 0 ||
        strip_size > WITHIN_MAX_STRIP_BYTES) {
      within_set_error("TIFF scanline or decoded strip exceeds the 4 MiB safety limit.");
      goto cleanup;
    }
  }

  int color_type;
  int associated_alpha = 0;
  uint16_t *red = NULL, *green = NULL, *blue = NULL;
  if ((photometric == PHOTOMETRIC_MINISBLACK || photometric == PHOTOMETRIC_MINISWHITE) && samples == 1) {
    color_type = PNG_COLOR_TYPE_GRAY;
  } else if (photometric == PHOTOMETRIC_PALETTE && samples == 1) {
    if (bits != 8) {
      within_set_error("Palette TIFF is limited to 8-bit indices.");
      goto cleanup;
    }
    if (!TIFFGetField(tiff, TIFFTAG_COLORMAP, &red, &green, &blue)) {
      within_set_error("Palette TIFF is missing its color map.");
      goto cleanup;
    }
    color_type = PNG_COLOR_TYPE_PALETTE;
  } else if (photometric == PHOTOMETRIC_RGB && (samples == 3 || samples == 4)) {
    color_type = samples == 4 ? PNG_COLOR_TYPE_RGBA : PNG_COLOR_TYPE_RGB;
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
  if (tiled) {
    tile = (unsigned char *)_TIFFmalloc((tmsize_t)tile_size);
    tile_stripe = (unsigned char *)malloc((size_t)tile_stripe_bytes);
    if (!tile || !tile_stripe) {
      within_set_error("Could not allocate the bounded TIFF tile buffers.");
      goto cleanup;
    }
  } else {
    row = (unsigned char *)_TIFFmalloc((tmsize_t)row_bytes);
    if (planar == PLANARCONFIG_SEPARATE) {
      plane_row = (unsigned char *)_TIFFmalloc((tmsize_t)plane_row_bytes);
    }
    if (!row || (planar == PLANARCONFIG_SEPARATE && !plane_row)) {
      within_set_error("Could not allocate the bounded TIFF scanline.");
      goto cleanup;
    }
  }
  int horizontal_flip = orientation == ORIENTATION_TOPRIGHT ||
                        orientation == ORIENTATION_BOTRIGHT;
  int vertical_flip = orientation == ORIENTATION_BOTRIGHT ||
                      orientation == ORIENTATION_BOTLEFT;
  if (associated_alpha || photometric == PHOTOMETRIC_MINISWHITE || horizontal_flip) {
    converted = (unsigned char *)malloc((size_t)row_bytes);
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
  png_set_IHDR(png, info, width, height, bits, color_type, PNG_INTERLACE_NONE,
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
  if (bits == 16) png_set_swap(png);

  uint32_t cached_tile_y = UINT32_MAX;
  uint32_t cached_tile_rows = 0;
  for (uint32_t y = 0; y < height; ++y) {
    uint32_t source_y = vertical_flip ? height - 1U - y : y;
    png_bytep source_row;
    if (tiled) {
      uint32_t wanted_tile_y = (source_y / tile_length) * tile_length;
      if (wanted_tile_y != cached_tile_y) {
        cached_tile_y = wanted_tile_y;
        cached_tile_rows = tile_length < height - cached_tile_y
                               ? tile_length
                               : height - cached_tile_y;
        memset(tile_stripe, 0, (size_t)row_bytes * cached_tile_rows);
        uint16_t plane_count = planar == PLANARCONFIG_SEPARATE ? samples : 1U;
        for (uint16_t sample = 0; sample < plane_count; ++sample) {
          for (uint32_t tile_x = 0; tile_x < width; tile_x += tile_width) {
            ttile_t tile_index = TIFFComputeTile(tiff, tile_x, cached_tile_y, 0,
                                                 sample);
            tmsize_t decoded = TIFFReadEncodedTile(tiff, tile_index, tile,
                                                   (tmsize_t)tile_size);
            if (decoded < 0 || (uint64_t)decoded < tile_row_bytes * cached_tile_rows) {
              if (!within_error_message[0]) {
                within_set_error("TIFF tile decoding failed at tile %u.",
                                 (unsigned int)tile_index);
              }
              goto cleanup;
            }
            uint32_t columns = tile_width < width - tile_x
                                   ? tile_width
                                   : width - tile_x;
            for (uint32_t tile_row = 0; tile_row < cached_tile_rows; ++tile_row) {
              unsigned char *output = tile_stripe +
                  (uint64_t)tile_row * row_bytes +
                  (uint64_t)tile_x * samples * bytes_per_sample;
              const unsigned char *input = tile +
                  (uint64_t)tile_row * tile_row_bytes;
              if (planar == PLANARCONFIG_CONTIG) {
                memcpy(output, input,
                       (size_t)columns * samples * bytes_per_sample);
              } else {
                for (uint32_t column = 0; column < columns; ++column) {
                  memcpy(output + (uint64_t)column * samples * bytes_per_sample +
                             (uint64_t)sample * bytes_per_sample,
                         input + (uint64_t)column * bytes_per_sample,
                         bytes_per_sample);
                }
              }
            }
          }
        }
      }
      source_row = tile_stripe + (uint64_t)(source_y - cached_tile_y) * row_bytes;
    } else {
      if (planar == PLANARCONFIG_CONTIG) {
        if (TIFFReadScanline(tiff, row, source_y, 0) < 0) {
          if (!within_error_message[0]) {
            within_set_error("TIFF scanline decoding failed at row %u.", source_y);
          }
          goto cleanup;
        }
      } else {
        for (uint16_t sample = 0; sample < samples; ++sample) {
          if (TIFFReadScanline(tiff, plane_row, source_y, sample) < 0) {
            if (!within_error_message[0]) {
              within_set_error("TIFF planar scanline decoding failed at row %u sample %u.",
                               source_y, sample);
            }
            goto cleanup;
          }
          for (uint32_t x = 0; x < width; ++x) {
            memcpy(row + (uint64_t)x * samples * bytes_per_sample +
                       (uint64_t)sample * bytes_per_sample,
                   plane_row + (uint64_t)x * bytes_per_sample,
                   bytes_per_sample);
          }
        }
      }
      source_row = row;
    }
    png_bytep output_row = source_row;
    if (converted) {
      within_transform_row(source_row, converted, width, samples, bits,
                           photometric, associated_alpha, horizontal_flip);
      output_row = converted;
    }
    png_write_row(png, output_row);
  }
  png_write_end(png, info);
  result = 0;

cleanup:
  if (palette) free(palette);
  if (converted) free(converted);
  if (tile_stripe) free(tile_stripe);
  if (tile) _TIFFfree(tile);
  if (row) _TIFFfree(row);
  if (plane_row) _TIFFfree(plane_row);
  if (png) png_destroy_write_struct(&png, info ? &info : NULL);
  if (tiff) TIFFClose(tiff);
  return result;
}

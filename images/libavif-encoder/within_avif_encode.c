#include <emscripten.h>
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/error.h>
#include <libavutil/imgutils.h>
#include <libavutil/opt.h>
#include <libswscale/swscale.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WITHIN_AVIO_BUFFER_BYTES (64U * 1024U)
#define WITHIN_PIXEL_STRIP_BYTES (256U * 1024U)
#define WITHIN_MAX_OUTPUT_BYTES (128U * 1024U * 1024U)
#define WITHIN_MAX_DIMENSION 8192U
#define WITHIN_MAX_PIXELS 786432U
#define WITHIN_MAX_FRAMES 1000U

typedef struct {
  int64_t position;
  int64_t size;
  int failed;
} within_output_state;

typedef struct {
  AVFormatContext *format;
  AVCodecContext *color_codec;
  AVCodecContext *alpha_codec;
  AVStream *color_stream;
  AVStream *alpha_stream;
  AVFrame *color_frame;
  AVFrame *alpha_frame;
  AVPacket *packet;
  struct SwsContext *sws;
  AVIOContext *output_io;
  uint8_t *output_buffer;
  uint8_t *rgba_strip;
  within_output_state output;
  uint32_t width;
  uint32_t height;
  uint32_t strip_rows;
  uint32_t frame_count;
  uint32_t color_packet_count;
  uint32_t alpha_packet_count;
  int has_alpha;
  int has_animation;
  int header_written;
  int64_t next_pts;
} within_avif_state;

static within_avif_state within_state;
static char within_error_message[1024];

EM_JS(int, within_avif_pixel_rows,
      (uint32_t destination, uint32_t y, uint32_t rows, uint32_t width), {
  try {
    return Module.withinBridge.rows(destination, y, rows, width);
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

EM_ASYNC_JS(int, within_avif_output_write,
            (double offset, uint32_t source, uint32_t length), {
  try {
    const view = Module.HEAPU8.subarray(source, source + length);
    return await Module.withinBridge.write(offset, view);
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

EM_ASYNC_JS(int, within_avif_output_truncate, (double size), {
  try {
    await Module.withinBridge.truncate(size);
    return 0;
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

EM_ASYNC_JS(int, within_avif_output_flush, (void), {
  try {
    await Module.withinBridge.flush();
    return 0;
  } catch (error) {
    Module.withinBridge.message(String(error && error.message ? error.message : error));
    return -1;
  }
});

static void within_set_error(const char *message) {
  if (!message) message = "AVIF encoding failed.";
  snprintf(within_error_message, sizeof(within_error_message), "%s", message);
}

static void within_set_av_error(const char *prefix, int code) {
  char detail[AV_ERROR_MAX_STRING_SIZE] = {0};
  av_strerror(code, detail, sizeof(detail));
  snprintf(within_error_message, sizeof(within_error_message), "%s: %s (%d)",
           prefix ? prefix : "AVIF encoding failed", detail, code);
}

static int within_output_write(void *opaque, const uint8_t *buffer, int size) {
  within_output_state *output = (within_output_state *)opaque;
  if (output->failed || size < 0 || output->position < 0 ||
      output->position > (int64_t)WITHIN_MAX_OUTPUT_BYTES - size) {
    output->failed = 1;
    within_set_error("AVIF output exceeds the 128 MiB safety limit.");
    return AVERROR(EFBIG);
  }
  int written = within_avif_output_write(
      (double)output->position, (uint32_t)(uintptr_t)buffer, (uint32_t)size);
  if (written != size) {
    output->failed = 1;
    within_set_error("The AVIF destination rejected a bounded write.");
    return AVERROR(EIO);
  }
  output->position += size;
  if (output->position > output->size) output->size = output->position;
  return size;
}

static int64_t within_output_seek(void *opaque, int64_t offset, int whence) {
  within_output_state *output = (within_output_state *)opaque;
  if (output->failed) return AVERROR(EIO);
  if (whence == AVSEEK_SIZE) return output->size;
  whence &= ~AVSEEK_FORCE;
  int64_t base = 0;
  if (whence == SEEK_SET) base = 0;
  else if (whence == SEEK_CUR) base = output->position;
  else if (whence == SEEK_END) base = output->size;
  else return AVERROR(EINVAL);
  if ((offset > 0 && base > INT64_MAX - offset) ||
      (offset < 0 && (offset == INT64_MIN || base < -offset)))
    return AVERROR(EINVAL);
  int64_t target = base + offset;
  if (target < 0 || target > (int64_t)WITHIN_MAX_OUTPUT_BYTES)
    return AVERROR(EINVAL);
  output->position = target;
  return target;
}

static void within_destroy_internal(void) {
  if (within_state.format) {
    within_state.format->pb = NULL;
    avformat_free_context(within_state.format);
  }
  within_state.format = NULL;
  avcodec_free_context(&within_state.color_codec);
  avcodec_free_context(&within_state.alpha_codec);
  av_frame_free(&within_state.color_frame);
  av_frame_free(&within_state.alpha_frame);
  av_packet_free(&within_state.packet);
  sws_freeContext(within_state.sws);
  within_state.sws = NULL;
  if (within_state.output_io) {
    av_freep(&within_state.output_io->buffer);
    avio_context_free(&within_state.output_io);
  } else {
    av_free(within_state.output_buffer);
  }
  within_state.output_buffer = NULL;
  av_free(within_state.rgba_strip);
  within_state.rgba_strip = NULL;
  memset(&within_state, 0, sizeof(within_state));
}

static int within_open_codec(AVCodecContext **context_out, AVStream *stream,
                             enum AVPixelFormat pixel_format, int crf) {
  const AVCodec *codec = avcodec_find_encoder_by_name("libaom-av1");
  if (!codec) {
    within_set_error("The pinned libaom AV1 encoder is unavailable.");
    return AVERROR_ENCODER_NOT_FOUND;
  }
  AVCodecContext *context = avcodec_alloc_context3(codec);
  if (!context) return AVERROR(ENOMEM);
  context->codec_type = AVMEDIA_TYPE_VIDEO;
  context->codec_id = AV_CODEC_ID_AV1;
  context->width = (int)within_state.width;
  context->height = (int)within_state.height;
  context->pix_fmt = pixel_format;
  context->time_base = (AVRational){1, 1000000};
  context->thread_count = 1;
  context->thread_type = 0;
  context->color_primaries = AVCOL_PRI_BT709;
  context->color_trc = AVCOL_TRC_IEC61966_2_1;
  context->colorspace = AVCOL_SPC_BT709;
  context->color_range = pixel_format == AV_PIX_FMT_GRAY8
                             ? AVCOL_RANGE_JPEG
                             : AVCOL_RANGE_MPEG;
  if (within_state.format->oformat->flags & AVFMT_GLOBALHEADER)
    context->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;

  AVDictionary *options = NULL;
  char crf_text[16] = {0};
  snprintf(crf_text, sizeof(crf_text), "%d", crf);
  av_dict_set(&options, "usage", "realtime", 0);
  av_dict_set(&options, "cpu-used", "8", 0);
  av_dict_set(&options, "row-mt", "0", 0);
  av_dict_set(&options, "lag-in-frames", "0", 0);
  av_dict_set(&options, "auto-alt-ref", "0", 0);
  av_dict_set(&options, "enable-ref-frame-mvs", "0", 0);
  av_dict_set(&options, "enable-reduced-reference-set", "1", 0);
  if (!within_state.has_animation)
    av_dict_set(&options, "still-picture", "1", 0);
  av_dict_set(&options, "crf", crf_text, 0);
  int result = avcodec_open2(context, codec, &options);
  if (result >= 0 && av_dict_count(options) != 0) {
    within_set_error("The pinned AV1 encoder did not accept every fastest-setting option.");
    result = AVERROR(EINVAL);
  }
  av_dict_free(&options);
  if (result < 0) {
    avcodec_free_context(&context);
    return result;
  }
  result = avcodec_parameters_from_context(stream->codecpar, context);
  if (result < 0) {
    avcodec_free_context(&context);
    return result;
  }
  stream->time_base = context->time_base;
  *context_out = context;
  return 0;
}

static int within_drain_codec(AVCodecContext *codec, AVStream *stream,
                              uint32_t *packet_count,
                              int64_t packet_duration) {
  int produced = 0;
  for (;;) {
    int result = avcodec_receive_packet(codec, within_state.packet);
    if (result == AVERROR(EAGAIN) || result == AVERROR_EOF) return produced;
    if (result < 0) return result;
    if (packet_duration > 0) within_state.packet->duration = packet_duration;
    av_packet_rescale_ts(within_state.packet, codec->time_base,
                         stream->time_base);
    within_state.packet->stream_index = stream->index;
    within_state.packet->pos = -1;
    result = av_interleaved_write_frame(within_state.format,
                                        within_state.packet);
    av_packet_unref(within_state.packet);
    if (result < 0) return result;
    *packet_count += 1;
    produced += 1;
  }
}

static int within_send_frame(AVCodecContext *codec, AVStream *stream,
                             AVFrame *frame, uint32_t *packet_count) {
  int result = avcodec_send_frame(codec, frame);
  if (result < 0) return result;
  return within_drain_codec(codec, stream, packet_count, frame->duration);
}

EMSCRIPTEN_KEEPALIVE int within_avif_encoder_probe(void) {
  const AVOutputFormat *format = av_guess_format("avif", NULL, "image/avif");
  const AVCodec *codec = avcodec_find_encoder_by_name("libaom-av1");
  return (!format || !codec || format->video_codec != AV_CODEC_ID_AV1 ||
          codec->id != AV_CODEC_ID_AV1) ? -1 : 0;
}

EMSCRIPTEN_KEEPALIVE int within_avif_encoder_start(
    uint32_t width, uint32_t height, int has_alpha, int has_animation,
    uint32_t loop_count) {
  within_destroy_internal();
  memset(within_error_message, 0, sizeof(within_error_message));
  if (width < 1 || height < 1 || width > WITHIN_MAX_DIMENSION ||
      height > WITHIN_MAX_DIMENSION ||
      (uint64_t)width * height > WITHIN_MAX_PIXELS ||
      (has_alpha != 0 && has_alpha != 1) ||
      (has_animation != 0 && has_animation != 1) ||
      (!has_animation && loop_count != 0)) {
    within_set_error("AVIF dimensions, flags, or loop count exceed the bounded limits.");
    return -1;
  }
  within_state.width = width;
  within_state.height = height;
  within_state.has_alpha = has_alpha;
  within_state.has_animation = has_animation;
  av_log_set_level(AV_LOG_ERROR);

  int result = avformat_alloc_output_context2(&within_state.format, NULL,
                                               "avif", NULL);
  if (result < 0 || !within_state.format) {
    within_set_av_error("Could not create the bounded AVIF muxer", result);
    within_destroy_internal();
    return -2;
  }
  within_state.color_stream = avformat_new_stream(within_state.format, NULL);
  if (!within_state.color_stream) {
    within_set_error("Could not create the AVIF color stream.");
    within_destroy_internal();
    return -3;
  }
  result = within_open_codec(&within_state.color_codec,
                             within_state.color_stream,
                             AV_PIX_FMT_YUV420P, 32);
  if (result < 0) {
    if (!within_error_message[0])
      within_set_av_error("Could not open the fastest AVIF color encoder", result);
    within_destroy_internal();
    return -4;
  }
  if (has_alpha) {
    within_state.alpha_stream = avformat_new_stream(within_state.format, NULL);
    if (!within_state.alpha_stream) {
      within_set_error("Could not create the AVIF alpha stream.");
      within_destroy_internal();
      return -5;
    }
    result = within_open_codec(&within_state.alpha_codec,
                               within_state.alpha_stream,
                               AV_PIX_FMT_GRAY8, 0);
    if (result < 0) {
      if (!within_error_message[0])
        within_set_av_error("Could not open the lossless AVIF alpha encoder", result);
      within_destroy_internal();
      return -6;
    }
  }

  within_state.color_frame = av_frame_alloc();
  within_state.alpha_frame = has_alpha ? av_frame_alloc() : NULL;
  within_state.packet = av_packet_alloc();
  if (!within_state.color_frame || (has_alpha && !within_state.alpha_frame) ||
      !within_state.packet) {
    within_set_error("Could not allocate bounded AVIF frame state.");
    within_destroy_internal();
    return -7;
  }
  within_state.color_frame->format = AV_PIX_FMT_YUV420P;
  within_state.color_frame->width = (int)width;
  within_state.color_frame->height = (int)height;
  within_state.color_frame->color_primaries = AVCOL_PRI_BT709;
  within_state.color_frame->color_trc = AVCOL_TRC_IEC61966_2_1;
  within_state.color_frame->colorspace = AVCOL_SPC_BT709;
  within_state.color_frame->color_range = AVCOL_RANGE_MPEG;
  result = av_frame_get_buffer(within_state.color_frame, 32);
  if (result < 0) {
    within_set_av_error("Could not allocate the bounded AVIF color frame", result);
    within_destroy_internal();
    return -8;
  }
  if (has_alpha) {
    within_state.alpha_frame->format = AV_PIX_FMT_GRAY8;
    within_state.alpha_frame->width = (int)width;
    within_state.alpha_frame->height = (int)height;
    within_state.alpha_frame->color_primaries = AVCOL_PRI_BT709;
    within_state.alpha_frame->color_trc = AVCOL_TRC_IEC61966_2_1;
    within_state.alpha_frame->colorspace = AVCOL_SPC_BT709;
    within_state.alpha_frame->color_range = AVCOL_RANGE_JPEG;
    result = av_frame_get_buffer(within_state.alpha_frame, 32);
    if (result < 0) {
      within_set_av_error("Could not allocate the bounded AVIF alpha frame", result);
      within_destroy_internal();
      return -9;
    }
  }

  within_state.sws = sws_getContext(
      (int)width, (int)height, AV_PIX_FMT_RGBA,
      (int)width, (int)height, AV_PIX_FMT_YUV420P,
      SWS_FAST_BILINEAR, NULL, NULL, NULL);
  if (!within_state.sws) {
    within_set_error("Could not create the bounded RGBA-to-YUV converter.");
    within_destroy_internal();
    return -10;
  }
  const int *coefficients = sws_getCoefficients(SWS_CS_ITU709);
  result = sws_setColorspaceDetails(within_state.sws, coefficients, 1,
                                    coefficients, 0, 0, 1 << 16, 1 << 16);
  if (result < 0) {
    within_set_error("Could not configure the AVIF BT.709 color conversion.");
    within_destroy_internal();
    return -11;
  }
  uint32_t row_bytes = width * 4U;
  within_state.strip_rows = WITHIN_PIXEL_STRIP_BYTES / row_bytes;
  if (within_state.strip_rows > 64U) within_state.strip_rows = 64U;
  if (within_state.strip_rows < 1U) within_state.strip_rows = 1U;
  if (within_state.strip_rows > 1U && (within_state.strip_rows & 1U))
    within_state.strip_rows -= 1U;
  size_t strip_bytes = (size_t)row_bytes * within_state.strip_rows;
  within_state.rgba_strip = av_malloc(strip_bytes);
  within_state.output_buffer = av_malloc(WITHIN_AVIO_BUFFER_BYTES);
  if (!within_state.rgba_strip || !within_state.output_buffer) {
    within_set_error("Could not allocate bounded AVIF strip/output buffers.");
    within_destroy_internal();
    return -12;
  }
  within_state.output_io = avio_alloc_context(
      within_state.output_buffer, WITHIN_AVIO_BUFFER_BYTES, 1,
      &within_state.output, NULL, within_output_write, within_output_seek);
  if (!within_state.output_io) {
    within_set_error("Could not create the seekable AVIF output bridge.");
    within_destroy_internal();
    return -13;
  }
  within_state.output_buffer = NULL;
  within_state.output_io->seekable = AVIO_SEEKABLE_NORMAL;
  within_state.format->pb = within_state.output_io;
  within_state.format->flags |= AVFMT_FLAG_CUSTOM_IO;

  AVDictionary *muxer_options = NULL;
  char loop_text[16] = {0};
  snprintf(loop_text, sizeof(loop_text), "%u", loop_count);
  av_dict_set(&muxer_options, "within_streaming", "1", 0);
  av_dict_set(&muxer_options, "within_animated", has_animation ? "1" : "0", 0);
  av_dict_set(&muxer_options, "movie_timescale", "1000000", 0);
  av_dict_set(&muxer_options, "loop", loop_text, 0);
  result = avformat_write_header(within_state.format, &muxer_options);
  if (result >= 0 && av_dict_count(muxer_options) != 0) {
    within_set_error("The patched bounded AVIF muxer rejected its streaming options.");
    result = AVERROR(EINVAL);
  }
  av_dict_free(&muxer_options);
  if (result < 0 || within_state.output.failed) {
    if (!within_error_message[0])
      within_set_av_error("Could not write the bounded AVIF header", result);
    within_destroy_internal();
    return -14;
  }
  within_state.header_written = 1;
  return 0;
}

EMSCRIPTEN_KEEPALIVE int within_avif_encoder_add_frame(uint32_t duration_micros) {
  if (!within_state.header_written || !within_state.color_codec ||
      within_state.frame_count >= WITHIN_MAX_FRAMES ||
      (within_state.has_animation && duration_micros < 1) ||
      (!within_state.has_animation &&
       (duration_micros != 0 || within_state.frame_count != 0))) {
    within_set_error("The AVIF frame count or duration is invalid.");
    return -1;
  }
  int result = av_frame_make_writable(within_state.color_frame);
  if (result >= 0 && within_state.has_alpha)
    result = av_frame_make_writable(within_state.alpha_frame);
  if (result < 0) {
    within_set_av_error("Could not reuse the bounded AVIF frame", result);
    return -2;
  }

  int converted_rows = 0;
  for (uint32_t y = 0; y < within_state.height;) {
    uint32_t rows = within_state.height - y;
    if (rows > within_state.strip_rows) rows = within_state.strip_rows;
    if (y + rows < within_state.height && (rows & 1U)) rows -= 1U;
    uint32_t bytes = within_state.width * rows * 4U;
    int received = within_avif_pixel_rows(
        (uint32_t)(uintptr_t)within_state.rgba_strip, y, rows,
        within_state.width);
    if (received != (int)bytes) {
      within_set_error("The browser rejected a bounded AVIF pixel-strip request.");
      return -3;
    }
    const uint8_t *source_data[4] = {within_state.rgba_strip, NULL, NULL, NULL};
    int source_linesize[4] = {(int)within_state.width * 4, 0, 0, 0};
    result = sws_scale(within_state.sws, source_data, source_linesize,
                       (int)y, (int)rows, within_state.color_frame->data,
                       within_state.color_frame->linesize);
    if (result < 0) {
      within_set_av_error("RGBA-to-YUV AVIF conversion failed", result);
      return -4;
    }
    converted_rows += result;
    if (within_state.has_alpha) {
      for (uint32_t row = 0; row < rows; row++) {
        uint8_t *alpha = within_state.alpha_frame->data[0] +
                         (size_t)(y + row) * within_state.alpha_frame->linesize[0];
        const uint8_t *rgba = within_state.rgba_strip +
                              (size_t)row * within_state.width * 4U;
        for (uint32_t x = 0; x < within_state.width; x++)
          alpha[x] = rgba[x * 4U + 3U];
      }
    }
    y += rows;
  }
  if (converted_rows != (int)within_state.height) {
    within_set_error("The bounded AVIF color converter returned incomplete rows.");
    return -5;
  }

  int64_t duration = within_state.has_animation ? duration_micros : 1;
  within_state.color_frame->pts = within_state.next_pts;
  within_state.color_frame->duration = duration;
  uint32_t before = within_state.color_packet_count;
  result = within_send_frame(within_state.color_codec, within_state.color_stream,
                             within_state.color_frame,
                             &within_state.color_packet_count);
  if (result < 0) {
    within_set_av_error("AVIF color-frame encoding failed", result);
    return -6;
  }
  if (within_state.color_packet_count != before + 1U) {
    within_set_error("The fastest AVIF encoder did not emit one bounded color packet per frame.");
    return -7;
  }
  if (within_state.has_alpha) {
    within_state.alpha_frame->pts = within_state.next_pts;
    within_state.alpha_frame->duration = duration;
    before = within_state.alpha_packet_count;
    result = within_send_frame(within_state.alpha_codec, within_state.alpha_stream,
                               within_state.alpha_frame,
                               &within_state.alpha_packet_count);
    if (result < 0) {
      within_set_av_error("AVIF alpha-frame encoding failed", result);
      return -8;
    }
    if (within_state.alpha_packet_count != before + 1U) {
      within_set_error("The fastest AVIF encoder did not emit one bounded alpha packet per frame.");
      return -9;
    }
  }
  within_state.frame_count += 1U;
  within_state.next_pts += duration;
  return within_state.output.failed ? -10 : 0;
}

EMSCRIPTEN_KEEPALIVE int within_avif_encoder_finish(void) {
  if (!within_state.header_written || within_state.frame_count < 1) {
    within_set_error("The AVIF encoder has no frame to finish.");
    return -1;
  }
  int result = avcodec_send_frame(within_state.color_codec, NULL);
  if (result >= 0)
    result = within_drain_codec(within_state.color_codec,
                                within_state.color_stream,
                                &within_state.color_packet_count, 0);
  if (result < 0) {
    within_set_av_error("AVIF color encoder flush failed", result);
    return -2;
  }
  if (within_state.has_alpha) {
    result = avcodec_send_frame(within_state.alpha_codec, NULL);
    if (result >= 0)
      result = within_drain_codec(within_state.alpha_codec,
                                  within_state.alpha_stream,
                                  &within_state.alpha_packet_count, 0);
    if (result < 0) {
      within_set_av_error("AVIF alpha encoder flush failed", result);
      return -3;
    }
  }
  if (within_state.color_packet_count != within_state.frame_count ||
      (within_state.has_alpha &&
       within_state.alpha_packet_count != within_state.frame_count)) {
    within_set_error("AVIF packet counts do not match the bounded frame set.");
    return -4;
  }
  result = av_write_trailer(within_state.format);
  if (result < 0 || within_state.output.failed) {
    if (!within_error_message[0])
      within_set_av_error("Bounded AVIF trailer writing failed", result);
    return -5;
  }
  avio_flush(within_state.output_io);
  if (within_state.output.failed || within_state.output.size < 1 ||
      within_state.output.size > WITHIN_MAX_OUTPUT_BYTES) {
    within_set_error("The bounded AVIF muxer produced an invalid output size.");
    return -6;
  }
  result = within_avif_output_truncate((double)within_state.output.size);
  if (result < 0) {
    within_set_error("Final AVIF output truncation failed.");
    return -7;
  }
  result = within_avif_output_flush();
  if (result < 0) {
    within_set_error("Final AVIF output flush failed.");
    return -8;
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE void within_avif_encoder_destroy(void) {
  within_destroy_internal();
}

EMSCRIPTEN_KEEPALIVE const char *within_avif_encoder_error(void) {
  return within_error_message;
}

EMSCRIPTEN_KEEPALIVE double within_avif_encoder_output_bytes(void) {
  return (double)within_state.output.size;
}

EMSCRIPTEN_KEEPALIVE uint32_t within_avif_encoder_strip_bytes(void) {
  return within_state.width * within_state.strip_rows * 4U;
}

EMSCRIPTEN_KEEPALIVE uint32_t within_avif_encoder_frame_bytes(void) {
  if (!within_state.color_frame) return 0;
  uint64_t color = (uint64_t)within_state.width * within_state.height * 3U / 2U;
  uint64_t alpha = within_state.has_alpha
                       ? (uint64_t)within_state.width * within_state.height
                       : 0;
  uint64_t total = color + alpha;
  return total > UINT32_MAX ? UINT32_MAX : (uint32_t)total;
}

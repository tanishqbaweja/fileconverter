#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <emscripten.h>
#include <emscripten/heap.h>

#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/avutil.h>
#include <libavutil/dict.h>
#include <libavutil/error.h>
#include <libavutil/mathematics.h>

#define WITHIN_AVIO_BUFFER_SIZE (256 * 1024)
#define WITHIN_ROTATE_REQUIRED (-4096)

typedef struct WithinInput {
  int64_t position;
  int64_t size;
} WithinInput;

typedef struct WithinOutput {
  int64_t position;
  int64_t size;
} WithinOutput;

EM_ASYNC_JS(int, within_input_read,
            (double offset, uint8_t *destination, int requested), {
  try {
    return await Module["withinBridge"].read(
      offset,
      HEAPU8.subarray(destination, destination + requested)
    );
  } catch (error) {
    Module["withinBridge"].message(
      2,
      error instanceof Error ? error.message : String(error)
    );
    return -5;
  }
});

EM_ASYNC_JS(int, within_output_write,
            (double offset, const uint8_t *source, int length), {
  try {
    const view = HEAPU8.subarray(source, source + length);
    const payload = Module["withinBridge"].copyOutput ? view.slice() : view;
    return await Module["withinBridge"].write(offset, payload);
  } catch (error) {
    Module["withinBridge"].message(
      2,
      error instanceof Error ? error.message : String(error)
    );
    return -5;
  }
});

EM_JS(int, within_output_write_sync,
      (double offset, const uint8_t *source, int length), {
  try {
    if (typeof Module["withinBridge"].writeSync !== "function") return -38;
    return Module["withinBridge"].writeSync(
      offset,
      HEAPU8.subarray(source, source + length)
    );
  } catch (error) {
    Module["withinBridge"].message(
      2,
      error instanceof Error ? error.message : String(error)
    );
    return -5;
  }
});

EM_ASYNC_JS(int, within_output_rotate, (void), {
  try {
    await Module["withinBridge"].rotate();
    return 0;
  } catch (error) {
    Module["withinBridge"].message(
      2,
      error instanceof Error ? error.message : String(error)
    );
    return -5;
  }
});

EM_ASYNC_JS(int, within_output_truncate, (double size), {
  try {
    await Module["withinBridge"].truncate(size);
    return 0;
  } catch (error) {
    Module["withinBridge"].message(
      2,
      error instanceof Error ? error.message : String(error)
    );
    return -5;
  }
});

EM_JS(int, within_output_truncate_sync, (double size), {
  try {
    Module["withinBridge"].truncateSync(size);
    return 0;
  } catch (error) {
    Module["withinBridge"].message(
      2,
      error instanceof Error ? error.message : String(error)
    );
    return -5;
  }
});

EM_ASYNC_JS(int, within_output_flush, (void), {
  try {
    await Module["withinBridge"].flush();
    return 0;
  } catch (error) {
    Module["withinBridge"].message(
      2,
      error instanceof Error ? error.message : String(error)
    );
    return -5;
  }
});

EM_JS(int, within_output_flush_sync, (void), {
  try {
    Module["withinBridge"].flushSync();
    return 0;
  } catch (error) {
    Module["withinBridge"].message(
      2,
      error instanceof Error ? error.message : String(error)
    );
    return -5;
  }
});

EM_JS(int, within_has_sync_output, (void), {
  return typeof Module["withinBridge"].writeSync === "function" ? 1 : 0;
});

EM_JS(double, within_input_size, (void), {
  return Module["withinBridge"].inputSize;
});

EM_JS(int, within_is_cancelled, (void), {
  return Module["withinBridge"].cancelled() ? 1 : 0;
});

EM_JS(void, within_message, (int level, const char *text), {
  Module["withinBridge"].message(level, UTF8ToString(text));
});

EM_JS(void, within_progress,
      (double input_position, double output_size, double media_time_us,
       double duration_us, double wasm_memory_bytes), {
  Module["withinBridge"].progress({
    inputPosition: input_position,
    outputSize: output_size,
    mediaTimeUs: media_time_us,
    durationUs: duration_us,
    wasmMemoryBytes: wasm_memory_bytes
  });
});

static void report_av_error(const char *operation, int error) {
  char detail[AV_ERROR_MAX_STRING_SIZE] = {0};
  char message[512] = {0};
  av_strerror(error, detail, sizeof(detail));
  snprintf(message, sizeof(message), "%s: %s", operation, detail);
  within_message(2, message);
}

static int input_read(void *opaque, uint8_t *buffer, int requested) {
  WithinInput *input = (WithinInput *)opaque;
  if (within_is_cancelled()) {
    return AVERROR_EXIT;
  }
  if (input->position >= input->size) {
    return AVERROR_EOF;
  }

  int64_t available = input->size - input->position;
  int bounded = requested < WITHIN_AVIO_BUFFER_SIZE
                    ? requested
                    : WITHIN_AVIO_BUFFER_SIZE;
  if (available < bounded) {
    bounded = (int)available;
  }
  int read = within_input_read((double)input->position, buffer, bounded);
  if (read < 0) {
    return AVERROR(EIO);
  }
  if (read == 0) {
    return AVERROR_EOF;
  }
  input->position += read;
  return read;
}

static int64_t input_seek(void *opaque, int64_t offset, int whence) {
  WithinInput *input = (WithinInput *)opaque;
  if (whence & AVSEEK_SIZE) {
    return input->size;
  }
  whence &= ~AVSEEK_FORCE;

  int64_t next;
  if (whence == SEEK_SET) {
    next = offset;
  } else if (whence == SEEK_CUR) {
    next = input->position + offset;
  } else if (whence == SEEK_END) {
    next = input->size + offset;
  } else {
    return AVERROR(EINVAL);
  }
  if (next < 0 || next > input->size) {
    return AVERROR(EINVAL);
  }
  input->position = next;
  return next;
}

static int output_write(void *opaque, const uint8_t *buffer, int length) {
  WithinOutput *output = (WithinOutput *)opaque;
  if (within_is_cancelled()) {
    return AVERROR_EXIT;
  }
  int total = 0;
  while (total < length) {
    int remaining = length - total;
    int bounded = remaining < WITHIN_AVIO_BUFFER_SIZE
                      ? remaining
                      : WITHIN_AVIO_BUFFER_SIZE;
    int written;
    if (within_has_sync_output()) {
      written = within_output_write_sync((double)output->position,
                                         buffer + total, bounded);
      if (written == WITHIN_ROTATE_REQUIRED) {
        if (within_output_rotate() < 0) {
          return AVERROR(EIO);
        }
        written = within_output_write_sync((double)output->position,
                                           buffer + total, bounded);
      }
    } else {
      written = within_output_write((double)output->position,
                                    buffer + total, bounded);
    }
    if (written != bounded) {
      return AVERROR(EIO);
    }
    total += written;
    output->position += written;
    if (output->position > output->size) {
      output->size = output->position;
    }
  }
  return total;
}

static int64_t output_seek(void *opaque, int64_t offset, int whence) {
  WithinOutput *output = (WithinOutput *)opaque;
  if (whence & AVSEEK_SIZE) {
    return output->size;
  }
  whence &= ~AVSEEK_FORCE;

  int64_t next;
  if (whence == SEEK_SET) {
    next = offset;
  } else if (whence == SEEK_CUR) {
    next = output->position + offset;
  } else if (whence == SEEK_END) {
    next = output->size + offset;
  } else {
    return AVERROR(EINVAL);
  }
  if (next < 0) {
    return AVERROR(EINVAL);
  }
  output->position = next;
  return next;
}

static int stream_is_supported(const AVStream *stream, int profile) {
  return !(stream->disposition & AV_DISPOSITION_ATTACHED_PIC) &&
         (profile == 2
              ? stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO
              : (stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO ||
                 stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO));
}

static int64_t packet_time_us(const AVPacket *packet,
                              const AVStream *stream) {
  int64_t timestamp =
      packet->pts != AV_NOPTS_VALUE ? packet->pts : packet->dts;
  if (timestamp == AV_NOPTS_VALUE) {
    return 0;
  }
  return av_rescale_q(timestamp, stream->time_base, AV_TIME_BASE_Q);
}

EMSCRIPTEN_KEEPALIVE
int within_remux(int profile) {
  int result = 0;
  AVFormatContext *input_format = NULL;
  AVFormatContext *output_format = NULL;
  AVIOContext *input_io = NULL;
  AVIOContext *output_io = NULL;
  uint8_t *input_buffer = NULL;
  uint8_t *output_buffer = NULL;
  int *stream_map = NULL;
  int64_t *last_dts = NULL;
  int64_t *packet_counts = NULL;
  AVDictionary *muxer_options = NULL;
  WithinInput input = {.position = 0, .size = (int64_t)within_input_size()};
  WithinOutput output = {.position = 0, .size = 0};
  AVPacket *packet = NULL;

  if (profile != 1 && profile != 2) {
    within_message(2, "Unknown remux profile.");
    return AVERROR(EINVAL);
  }
  if (input.size <= 0) {
    within_message(2, "The input file is empty.");
    return AVERROR_INVALIDDATA;
  }

  input_buffer = av_malloc(WITHIN_AVIO_BUFFER_SIZE);
  if (!input_buffer) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  input_io = avio_alloc_context(input_buffer, WITHIN_AVIO_BUFFER_SIZE, 0,
                                &input, input_read, NULL, input_seek);
  if (!input_io) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  input_buffer = NULL;

  input_format = avformat_alloc_context();
  if (!input_format) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  input_format->pb = input_io;
  input_format->flags |= AVFMT_FLAG_CUSTOM_IO;
  input_format->probesize = 2 * 1024 * 1024;

  result = avformat_open_input(&input_format, NULL, NULL, NULL);
  if (result < 0) {
    report_av_error("Input probing failed", result);
    goto cleanup;
  }
  result = avformat_alloc_output_context2(&output_format, NULL, "mp4", NULL);
  if (result < 0 || !output_format) {
    result = result < 0 ? result : AVERROR(EINVAL);
    report_av_error("MP4 muxer initialization failed", result);
    goto cleanup;
  }

  stream_map = av_calloc(input_format->nb_streams, sizeof(*stream_map));
  last_dts = av_malloc_array(input_format->nb_streams, sizeof(*last_dts));
  packet_counts =
      av_calloc(input_format->nb_streams, sizeof(*packet_counts));
  if (!stream_map || !last_dts || !packet_counts) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  for (unsigned int index = 0; index < input_format->nb_streams; index++) {
    AVStream *input_stream = input_format->streams[index];
    stream_map[index] = -1;
    last_dts[index] = AV_NOPTS_VALUE;
    if (!stream_is_supported(input_stream, profile)) {
      if (input_stream->disposition & AV_DISPOSITION_ATTACHED_PIC) {
        within_message(
            1,
            "The Matroska attachment cannot be represented as an MP4 "
            "attachment and is explicitly excluded.");
      } else if (profile == 2 &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
        within_message(
            1,
            "The source video stream is explicitly excluded from the "
            "audio-only M4A output.");
      } else if (input_stream->codecpar->codec_type == AVMEDIA_TYPE_SUBTITLE) {
        within_message(
            1,
            "The source subtitle stream is SRT, which MP4 cannot stream-copy; "
            "it is explicitly excluded from this lossless remux.");
      } else if (input_stream->codecpar->codec_type ==
                 AVMEDIA_TYPE_ATTACHMENT) {
        within_message(
            1,
            "The Matroska attachment cannot be represented as an MP4 "
            "attachment and is explicitly excluded.");
      } else {
        within_message(
            1,
            "A source stream type unsupported by MP4 was explicitly excluded.");
      }
      continue;
    }

    AVStream *output_stream = avformat_new_stream(output_format, NULL);
    if (!output_stream) {
      result = AVERROR(ENOMEM);
      goto cleanup;
    }
    stream_map[index] = output_stream->index;
    result =
        avcodec_parameters_copy(output_stream->codecpar, input_stream->codecpar);
    if (result < 0) {
      report_av_error("Stream metadata copy failed", result);
      goto cleanup;
    }
    output_stream->codecpar->codec_tag = 0;
    output_stream->time_base = input_stream->time_base;
    av_dict_copy(&output_stream->metadata, input_stream->metadata, 0);
    output_stream->disposition = input_stream->disposition;
  }
  av_dict_copy(&output_format->metadata, input_format->metadata, 0);

  output_buffer = av_malloc(WITHIN_AVIO_BUFFER_SIZE);
  if (!output_buffer) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  output_io = avio_alloc_context(output_buffer, WITHIN_AVIO_BUFFER_SIZE, 1,
                                 &output, NULL, output_write, output_seek);
  if (!output_io) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  output_buffer = NULL;
  output_format->pb = output_io;
  output_format->flags |= AVFMT_FLAG_CUSTOM_IO | AVFMT_FLAG_AUTO_BSF;
  output_format->max_interleave_delta = 2 * AV_TIME_BASE;

  if (profile == 2) {
    av_dict_set(&muxer_options, "movflags",
                "empty_moov+default_base_moof", 0);
    av_dict_set(&muxer_options, "frag_duration", "5000000", 0);
  } else {
    av_dict_set(&muxer_options, "movflags",
                "frag_keyframe+empty_moov+default_base_moof", 0);
  }
  result = avformat_write_header(output_format, &muxer_options);
  if (result < 0) {
    report_av_error("MP4 header write failed", result);
    goto cleanup;
  }

  packet = av_packet_alloc();
  if (!packet) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }

  while ((result = av_read_frame(input_format, packet)) >= 0) {
    if (within_is_cancelled()) {
      result = AVERROR_EXIT;
      goto cleanup;
    }
    int input_index = packet->stream_index;
    if (input_index < 0 ||
        input_index >= (int)input_format->nb_streams ||
        stream_map[input_index] < 0) {
      av_packet_unref(packet);
      continue;
    }

    AVStream *input_stream = input_format->streams[input_index];
    AVStream *output_stream =
        output_format->streams[stream_map[input_index]];
    if (input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
        input_stream->avg_frame_rate.num > 0 &&
        input_stream->avg_frame_rate.den > 0) {
      int reorder_delay = input_stream->codecpar->video_delay;
      if (reorder_delay < 1 &&
          input_stream->codecpar->codec_id == AV_CODEC_ID_HEVC) {
        reorder_delay = 2;
      }
      AVRational frame_duration =
          av_inv_q(input_stream->avg_frame_rate);
      packet->dts = av_rescale_q(packet_counts[input_index] - reorder_delay,
                                 frame_duration, input_stream->time_base);
      packet_counts[input_index] += 1;
    } else if (packet->dts == AV_NOPTS_VALUE) {
      int64_t duration = packet->duration > 0 ? packet->duration : 1;
      if (last_dts[input_index] == AV_NOPTS_VALUE) {
        int reorder_delay = input_stream->codecpar->video_delay;
        if (reorder_delay < 1) {
          reorder_delay = 1;
        }
        int64_t reference =
            packet->pts != AV_NOPTS_VALUE ? packet->pts : 0;
        packet->dts = reference - reorder_delay * duration;
      } else {
        packet->dts = last_dts[input_index] + duration;
      }
    }
    last_dts[input_index] = packet->dts;
    int64_t media_time = packet_time_us(packet, input_stream);
    av_packet_rescale_ts(packet, input_stream->time_base,
                         output_stream->time_base);
    packet->stream_index = output_stream->index;
    packet->pos = -1;

    result = av_interleaved_write_frame(output_format, packet);
    av_packet_unref(packet);
    if (result < 0) {
      report_av_error("MP4 packet write failed", result);
      goto cleanup;
    }
    within_progress((double)input.position, (double)output.size,
                    (double)media_time, (double)input_format->duration,
                    (double)emscripten_get_heap_size());
  }
  if (result == AVERROR_EOF) {
    result = 0;
  } else if (result < 0) {
    report_av_error("Input packet read failed", result);
    goto cleanup;
  }

  result = av_write_trailer(output_format);
  if (result < 0) {
    report_av_error("MP4 trailer write failed", result);
    goto cleanup;
  }
  avio_flush(output_io);
  result = within_has_sync_output()
               ? within_output_truncate_sync((double)output.size)
               : within_output_truncate((double)output.size);
  if (result < 0) {
    within_message(2, "Final output truncation failed.");
    goto cleanup;
  }
  result = within_has_sync_output() ? within_output_flush_sync()
                                    : within_output_flush();
  if (result < 0) {
    within_message(2, "Final output flush failed.");
    goto cleanup;
  }
  within_progress((double)input.size, (double)output.size,
                  (double)input_format->duration,
                  (double)input_format->duration,
                  (double)emscripten_get_heap_size());

cleanup:
  av_dict_free(&muxer_options);
  av_packet_free(&packet);
  av_free(stream_map);
  av_free(last_dts);
  av_free(packet_counts);

  if (output_format) {
    output_format->pb = NULL;
    avformat_free_context(output_format);
  }
  if (output_io) {
    av_freep(&output_io->buffer);
    avio_context_free(&output_io);
  } else {
    av_free(output_buffer);
  }

  if (input_format) {
    input_format->pb = NULL;
    avformat_close_input(&input_format);
  }
  if (input_io) {
    av_freep(&input_io->buffer);
    avio_context_free(&input_io);
  } else {
    av_free(input_buffer);
  }

  if (result < 0 && result != AVERROR_EXIT) {
    report_av_error("Remux failed", result);
  }
  return result;
}

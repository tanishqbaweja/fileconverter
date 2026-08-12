#include <errno.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <emscripten.h>
#include <emscripten/heap.h>

#include <libavcodec/avcodec.h>
#include <libavcodec/bsf.h>
#include <libavformat/avformat.h>
#include <libavutil/avutil.h>
#include <libavutil/audio_fifo.h>
#include <libavutil/dict.h>
#include <libavutil/error.h>
#include <libavutil/mathematics.h>
#include <libavutil/opt.h>
#include <libswresample/swresample.h>
#include <libswscale/swscale.h>

#define WITHIN_AVIO_BUFFER_SIZE (256 * 1024)
#ifndef WITHIN_AVIO_OUTPUT_BUFFER_SIZE
#define WITHIN_AVIO_OUTPUT_BUFFER_SIZE WITHIN_AVIO_BUFFER_SIZE
#endif
#define WITHIN_AUDIO_FIFO_MAX_SAMPLES 16384
#define WITHIN_ROTATE_REQUIRED (-4096)
#ifndef WITHIN_VIDEO_THREADS
#define WITHIN_VIDEO_THREADS 1
#endif

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

EM_JS(int, within_input_read_sync,
      (double offset, uint8_t *destination, int requested), {
  try {
    if (typeof Module["withinBridge"].readSync !== "function") return -38;
    return Module["withinBridge"].readSync(
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

EM_JS(int, within_has_sync_input, (void), {
  return typeof Module["withinBridge"].readSync === "function" ? 1 : 0;
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
  int read = within_has_sync_input()
                 ? within_input_read_sync((double)input->position, buffer,
                                          bounded)
                 : within_input_read((double)input->position, buffer, bounded);
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
    int bounded = remaining < WITHIN_AVIO_OUTPUT_BUFFER_SIZE
                      ? remaining
                      : WITHIN_AVIO_OUTPUT_BUFFER_SIZE;
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
  if (stream->disposition & AV_DISPOSITION_ATTACHED_PIC) {
    return 0;
  }
  if (profile == 23) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO ||
           stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO ||
           stream->codecpar->codec_type == AVMEDIA_TYPE_SUBTITLE ||
           stream->codecpar->codec_type == AVMEDIA_TYPE_ATTACHMENT;
  }
  if (profile == 24) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO ||
           stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO;
  }
  if (profile == 25) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO ||
           stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO;
  }
  if (profile == 26) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO ||
           stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO;
  }
  if (profile == 27) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO ||
           stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO;
  }
  if (profile == 12 || profile == 13 || profile == 14 || profile == 15 ||
      profile == 16 || profile == 22) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO;
  }
  return profile == 2 || profile == 18 || profile == 19 || profile == 20 ||
                 profile == 21
             ? stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO
             : (stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO ||
                stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO);
}

static int stream_codec_is_copy_compatible(const AVStream *stream,
                                           int profile,
                                           const AVFormatContext *format) {
  if (profile == 23) {
    if (stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
      return stream->codecpar->codec_id == AV_CODEC_ID_H264 ||
             stream->codecpar->codec_id == AV_CODEC_ID_HEVC ||
             stream->codecpar->codec_id == AV_CODEC_ID_MPEG4 ||
             stream->codecpar->codec_id == AV_CODEC_ID_MPEG2VIDEO ||
             stream->codecpar->codec_id == AV_CODEC_ID_VP8 ||
             stream->codecpar->codec_id == AV_CODEC_ID_VP9 ||
             stream->codecpar->codec_id == AV_CODEC_ID_AV1 ||
             stream->codecpar->codec_id == AV_CODEC_ID_THEORA;
    }
    if (stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
      return stream->codecpar->codec_id == AV_CODEC_ID_AAC ||
             stream->codecpar->codec_id == AV_CODEC_ID_MP3 ||
             stream->codecpar->codec_id == AV_CODEC_ID_OPUS ||
             stream->codecpar->codec_id == AV_CODEC_ID_VORBIS ||
             stream->codecpar->codec_id == AV_CODEC_ID_FLAC ||
             stream->codecpar->codec_id == AV_CODEC_ID_ALAC ||
             stream->codecpar->codec_id == AV_CODEC_ID_PCM_S16LE ||
             stream->codecpar->codec_id == AV_CODEC_ID_PCM_S16BE ||
             stream->codecpar->codec_id == AV_CODEC_ID_WMAV1 ||
             stream->codecpar->codec_id == AV_CODEC_ID_WMAV2 ||
             stream->codecpar->codec_id == AV_CODEC_ID_AMR_NB;
    }
    if (stream->codecpar->codec_type == AVMEDIA_TYPE_SUBTITLE) {
      return stream->codecpar->codec_id == AV_CODEC_ID_SUBRIP ||
             stream->codecpar->codec_id == AV_CODEC_ID_ASS ||
             stream->codecpar->codec_id == AV_CODEC_ID_SSA ||
             stream->codecpar->codec_id == AV_CODEC_ID_WEBVTT;
    }
    return stream->codecpar->codec_type == AVMEDIA_TYPE_ATTACHMENT;
  }
  if (profile == 24) {
    if (stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
      return stream->codecpar->codec_id == AV_CODEC_ID_H264 ||
             stream->codecpar->codec_id == AV_CODEC_ID_HEVC;
    }
    return stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO &&
           stream->codecpar->codec_id == AV_CODEC_ID_AAC;
  }
  if (profile == 25) {
    if (stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
      return stream->codecpar->codec_id == AV_CODEC_ID_H264;
    }
    return stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO &&
           stream->codecpar->codec_id == AV_CODEC_ID_AAC;
  }
  if (profile == 26) {
    if (stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
      return stream->codecpar->codec_id == AV_CODEC_ID_H264 ||
             stream->codecpar->codec_id == AV_CODEC_ID_HEVC;
    }
    return stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO &&
           stream->codecpar->codec_id == AV_CODEC_ID_AAC;
  }
  if (profile == 27) {
    if (stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
      return stream->codecpar->codec_id == AV_CODEC_ID_H264;
    }
    return stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO &&
           stream->codecpar->codec_id == AV_CODEC_ID_AAC;
  }
  if (profile == 12) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
           stream->codecpar->codec_id == AV_CODEC_ID_H264;
  }
  if (profile == 22) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
           stream->codecpar->codec_id == AV_CODEC_ID_HEVC;
  }
  if (profile == 13 || profile == 14) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
           stream->codecpar->codec_id == AV_CODEC_ID_MPEG2VIDEO;
  }
  if (profile == 15 || profile == 16) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
           stream->codecpar->codec_id == AV_CODEC_ID_MPEG4;
  }
  if (profile == 17) {
    if (stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
      return stream->codecpar->codec_id == AV_CODEC_ID_AV1;
    }
    if (stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
      return stream->codecpar->codec_id == AV_CODEC_ID_OPUS ||
             stream->codecpar->codec_id == AV_CODEC_ID_VORBIS;
    }
    return 0;
  }
  if (profile == 18) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO &&
           stream->codecpar->codec_id == AV_CODEC_ID_MP3;
  }
  if (profile == 19) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO &&
           stream->codecpar->codec_id == AV_CODEC_ID_AAC;
  }
  if (profile == 20) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO &&
           stream->codecpar->codec_id == AV_CODEC_ID_VORBIS;
  }
  if (profile == 21) {
    return stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO &&
           stream->codecpar->codec_id == AV_CODEC_ID_OPUS;
  }
  const int avi_input =
      format->iformat && format->iformat->name &&
      strstr(format->iformat->name, "avi") != NULL;
  if (avi_input && stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
    return profile != 2 &&
           stream->codecpar->codec_id == AV_CODEC_ID_MP3;
  }
  if (avi_input && stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
    return profile != 2 &&
           stream->codecpar->codec_id == AV_CODEC_ID_MPEG4;
  }
  if (stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
    return stream->codecpar->codec_id == AV_CODEC_ID_AAC;
  }
  if (profile != 2 &&
      stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
    return stream->codecpar->codec_id == AV_CODEC_ID_H264 ||
           stream->codecpar->codec_id == AV_CODEC_ID_HEVC;
  }
  return 1;
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

static int copy_chapters(AVFormatContext *output_format,
                         const AVFormatContext *input_format) {
  if (input_format->nb_chapters == 0) {
    return 0;
  }
  output_format->chapters =
      av_calloc(input_format->nb_chapters, sizeof(*output_format->chapters));
  if (!output_format->chapters) {
    return AVERROR(ENOMEM);
  }
  for (unsigned int index = 0; index < input_format->nb_chapters; index++) {
    const AVChapter *source = input_format->chapters[index];
    AVChapter *destination = av_mallocz(sizeof(*destination));
    if (!destination) {
      return AVERROR(ENOMEM);
    }
    destination->id = source->id;
    destination->time_base = source->time_base;
    destination->start = source->start;
    destination->end = source->end;
    output_format->chapters[output_format->nb_chapters++] = destination;
    int result = av_dict_copy(&destination->metadata, source->metadata, 0);
    if (result < 0) {
      return result;
    }
  }
  return 0;
}

static int ensure_matroska_aac_extradata(AVCodecParameters *parameters) {
  if (parameters->codec_id != AV_CODEC_ID_AAC ||
      parameters->extradata_size > 0) {
    return 0;
  }
  static const int sample_rates[] = {
      96000, 88200, 64000, 48000, 44100, 32000, 24000,
      22050, 16000, 12000, 11025, 8000,  7350,
  };
  int frequency_index = -1;
  for (unsigned int index = 0;
       index < sizeof(sample_rates) / sizeof(sample_rates[0]); index++) {
    if (sample_rates[index] == parameters->sample_rate) {
      frequency_index = (int)index;
      break;
    }
  }
  const int channels = parameters->ch_layout.nb_channels;
  if (frequency_index < 0 || channels < 1 || channels > 7 ||
      (parameters->profile != AV_PROFILE_UNKNOWN &&
       parameters->profile != AV_PROFILE_AAC_LOW)) {
    return AVERROR(ENOSYS);
  }
  parameters->extradata =
      av_mallocz(2 + AV_INPUT_BUFFER_PADDING_SIZE);
  if (!parameters->extradata) {
    return AVERROR(ENOMEM);
  }
  const int audio_object_type = 2; /* AAC Low Complexity. */
  parameters->extradata[0] =
      (audio_object_type << 3) | (frequency_index >> 1);
  parameters->extradata[1] =
      ((frequency_index & 1) << 7) | (channels << 3);
  parameters->extradata_size = 2;
  return 0;
}

static int append_prefetched_packet(AVPacket ***packets,
                                    int *packet_count,
                                    int *packet_capacity,
                                    AVPacket *packet) {
  if (*packet_count == *packet_capacity) {
    const int new_capacity = *packet_capacity ? *packet_capacity * 2 : 32;
    AVPacket **resized =
        av_realloc_array(*packets, new_capacity, sizeof(**packets));
    if (!resized) {
      return AVERROR(ENOMEM);
    }
    *packets = resized;
    *packet_capacity = new_capacity;
  }
  AVPacket *stored = av_packet_alloc();
  if (!stored) {
    return AVERROR(ENOMEM);
  }
  av_packet_move_ref(stored, packet);
  (*packets)[(*packet_count)++] = stored;
  return 0;
}

static uint32_t read_little_endian_uint32(const uint8_t *data) {
  return (uint32_t)data[0] | ((uint32_t)data[1] << 8) |
         ((uint32_t)data[2] << 16) | ((uint32_t)data[3] << 24);
}

static int mpeg2_packet_temporal_reference(const AVPacket *packet,
                                           int *saw_gop_start) {
  *saw_gop_start = 0;
  for (int index = 0; index + 5 < packet->size; index++) {
    if (packet->data[index] != 0 || packet->data[index + 1] != 0 ||
        packet->data[index + 2] != 1) {
      continue;
    }
    const uint8_t start_code = packet->data[index + 3];
    if (start_code == 0xb8) {
      *saw_gop_start = 1;
    } else if (start_code == 0x00) {
      return ((int)packet->data[index + 4] << 2) |
             ((int)packet->data[index + 5] >> 6);
    }
  }
  return -1;
}

typedef struct WithinAudioPipeline {
  AVCodecContext *decoder;
  AVCodecContext *encoder;
  AVFormatContext *output_format;
  AVStream *output_stream;
  SwrContext *resampler;
  AVFrame *decoded_frame;
  AVFrame *converted_frame;
  AVPacket *encoded_packet;
  AVAudioFifo *fifo;
  int output_frame_samples;
  int64_t next_pts;
} WithinAudioPipeline;

static int write_audio_packets(WithinAudioPipeline *pipeline,
                               AVFrame *frame) {
  int result = avcodec_send_frame(pipeline->encoder, frame);
  if (result < 0) {
    return result;
  }
  while (1) {
    result =
        avcodec_receive_packet(pipeline->encoder, pipeline->encoded_packet);
    if (result == AVERROR(EAGAIN) || result == AVERROR_EOF) {
      return 0;
    }
    if (result < 0) {
      return result;
    }
    av_packet_rescale_ts(pipeline->encoded_packet,
                         pipeline->encoder->time_base,
                         pipeline->output_stream->time_base);
    pipeline->encoded_packet->stream_index =
        pipeline->output_stream->index;
    result = av_interleaved_write_frame(pipeline->output_format,
                                        pipeline->encoded_packet);
    av_packet_unref(pipeline->encoded_packet);
    if (result < 0) {
      return result;
    }
  }
}

static int drain_audio_fifo(WithinAudioPipeline *pipeline, int flush) {
  const int frame_size = pipeline->output_frame_samples;
  while (av_audio_fifo_size(pipeline->fifo) >= frame_size ||
         (flush && av_audio_fifo_size(pipeline->fifo) > 0)) {
    int samples = FFMIN(frame_size, av_audio_fifo_size(pipeline->fifo));
    AVFrame *output = pipeline->converted_frame;
    av_frame_unref(output);
    output->format = pipeline->encoder->sample_fmt;
    output->sample_rate = pipeline->encoder->sample_rate;
    output->nb_samples = samples;
    int result = av_channel_layout_copy(
        &output->ch_layout, &pipeline->encoder->ch_layout);
    if (result < 0) {
      report_av_error("Audio output layout allocation failed", result);
      return result;
    }
    result = av_frame_get_buffer(output, 0);
    if (result < 0) {
      report_av_error("Audio output frame allocation failed", result);
      return result;
    }
    if (av_audio_fifo_read(pipeline->fifo,
                           (void **)output->extended_data,
                           samples) != samples) {
      return AVERROR(EIO);
    }
    output->pts = pipeline->next_pts;
    pipeline->next_pts += samples;
    result = write_audio_packets(pipeline, output);
    if (result < 0) {
      report_av_error("Audio frame encode or mux failed", result);
      return result;
    }
  }
  return 0;
}

static int submit_converted_audio(WithinAudioPipeline *pipeline,
                                  AVFrame *output, int samples) {
  output->nb_samples = samples;
  if (pipeline->fifo) {
    int current = av_audio_fifo_size(pipeline->fifo);
    int available = av_audio_fifo_space(pipeline->fifo);
    if (current < 0 ||
        available < 0 ||
        samples > WITHIN_AUDIO_FIFO_MAX_SAMPLES - current) {
      return AVERROR(ENOMEM);
    }
    if (available < samples &&
        av_audio_fifo_realloc(pipeline->fifo, current + samples) < 0) {
      within_message(2, "Audio FIFO capacity reservation failed.");
      return AVERROR(ENOMEM);
    }
    if (av_audio_fifo_write(pipeline->fifo,
                            (void **)output->extended_data,
                            samples) != samples) {
      return AVERROR(EIO);
    }
    return drain_audio_fifo(pipeline, 0);
  }
  output->pts = pipeline->next_pts;
  pipeline->next_pts += samples;
  return write_audio_packets(pipeline, output);
}

static int convert_decoded_audio(WithinAudioPipeline *pipeline) {
  AVFrame *input = pipeline->decoded_frame;
  AVFrame *output = pipeline->converted_frame;
  int output_capacity =
      swr_get_out_samples(pipeline->resampler, input->nb_samples);
  if (output_capacity <= 0 || output_capacity > 8192) {
    return AVERROR_INVALIDDATA;
  }

  av_frame_unref(output);
  output->format = pipeline->encoder->sample_fmt;
  output->sample_rate = pipeline->encoder->sample_rate;
  output->nb_samples = output_capacity;
  int result =
      av_channel_layout_copy(&output->ch_layout,
                             &pipeline->encoder->ch_layout);
  if (result < 0) {
    report_av_error("Resampled audio layout allocation failed", result);
    return result;
  }
  result = av_frame_get_buffer(output, 0);
  if (result < 0) {
    report_av_error("Resampled audio frame allocation failed", result);
    return result;
  }
  result = swr_convert(pipeline->resampler, output->data, output_capacity,
                       (const uint8_t **)input->extended_data,
                       input->nb_samples);
  if (result < 0) {
    report_av_error("Audio resampling failed", result);
    return result;
  }
  result = submit_converted_audio(pipeline, output, result);
  if (result < 0) {
    report_av_error("Resampled audio submission failed", result);
  }
  return result;
}

static int flush_audio_resampler(WithinAudioPipeline *pipeline) {
  AVFrame *output = pipeline->converted_frame;
  while (1) {
    int output_capacity =
        swr_get_out_samples(pipeline->resampler, 0);
    if (output_capacity < 0 || output_capacity > 8192) {
      return AVERROR_INVALIDDATA;
    }
    if (output_capacity == 0) {
      return 0;
    }
    av_frame_unref(output);
    output->format = pipeline->encoder->sample_fmt;
    output->sample_rate = pipeline->encoder->sample_rate;
    output->nb_samples = output_capacity;
    int result = av_channel_layout_copy(
        &output->ch_layout, &pipeline->encoder->ch_layout);
    if (result < 0) {
      return result;
    }
    result = av_frame_get_buffer(output, 0);
    if (result < 0) {
      return result;
    }
    result = swr_convert(pipeline->resampler, output->data,
                         output_capacity, NULL, 0);
    if (result < 0) {
      return result;
    }
    if (result == 0) {
      return 0;
    }
    result = submit_converted_audio(pipeline, output, result);
    if (result < 0) {
      return result;
    }
  }
}

static int drain_audio_decoder(WithinAudioPipeline *pipeline,
                               const AVPacket *packet) {
  int result = avcodec_send_packet(pipeline->decoder, packet);
  if (result < 0) {
    return result;
  }
  while (1) {
    result =
        avcodec_receive_frame(pipeline->decoder, pipeline->decoded_frame);
    if (result == AVERROR(EAGAIN) || result == AVERROR_EOF) {
      return 0;
    }
    if (result < 0) {
      return result;
    }
    result = convert_decoded_audio(pipeline);
    av_frame_unref(pipeline->decoded_frame);
    if (result < 0) {
      return result;
    }
  }
}

static int within_audio_transcode(int profile) {
  const int flac_output = profile == 6;
  const int alac_output = profile == 8;
  const int wma_output = profile == 9;
  const int aiff_output = profile == 28;
  const int amr_output = profile == 29;
  const int mp3_output = profile == 30;
  const int aac_output = profile == 31;
  int result = 0;
  int audio_stream_index = -1;
  AVFormatContext *input_format = NULL;
  AVFormatContext *output_format = NULL;
  AVIOContext *input_io = NULL;
  AVIOContext *output_io = NULL;
  uint8_t *input_buffer = NULL;
  uint8_t *output_buffer = NULL;
  AVCodecContext *decoder = NULL;
  AVCodecContext *encoder = NULL;
  SwrContext *resampler = NULL;
  AVPacket *input_packet = NULL;
  AVPacket *encoded_packet = NULL;
  AVFrame *decoded_frame = NULL;
  AVFrame *converted_frame = NULL;
  AVAudioFifo *fifo = NULL;
  AVDictionary *encoder_options = NULL;
  AVDictionary *muxer_options = NULL;
  WithinInput input = {.position = 0, .size = (int64_t)within_input_size()};
  WithinOutput output = {.position = 0, .size = 0};
  WithinAudioPipeline pipeline = {0};

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
  input_format->max_analyze_duration = 2 * AV_TIME_BASE;
  result = avformat_open_input(&input_format, NULL, NULL, NULL);
  if (result < 0) {
    report_av_error("Input probing failed", result);
    goto cleanup;
  }
  result = avformat_find_stream_info(input_format, NULL);
  if (result < 0) {
    report_av_error("Audio stream inspection failed", result);
    goto cleanup;
  }
  if (input_format->nb_chapters > 0) {
    within_message(
        1,
        "Source chapters are explicitly excluded from this audio-only output.");
  }

  for (unsigned int index = 0; index < input_format->nb_streams; index++) {
    AVStream *stream = input_format->streams[index];
    if (audio_stream_index < 0 &&
        stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
      audio_stream_index = (int)index;
      continue;
    }
    if (stream->disposition & AV_DISPOSITION_ATTACHED_PIC ||
        stream->codecpar->codec_type == AVMEDIA_TYPE_ATTACHMENT) {
      within_message(
          1,
          "The source attachment is explicitly excluded from audio-only output.");
    } else if (stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
      within_message(
          1,
          "The source video stream is explicitly excluded from audio-only "
          "output.");
    } else if (stream->codecpar->codec_type == AVMEDIA_TYPE_SUBTITLE) {
      within_message(
          1,
          "The source subtitle stream is explicitly excluded from audio-only output.");
    } else if (stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
      within_message(
          1,
          "Only the first audio stream is converted by this audio profile.");
    }
  }
  if (audio_stream_index < 0) {
    within_message(2, "No audio stream was found.");
    result = AVERROR_STREAM_NOT_FOUND;
    goto cleanup;
  }

  AVStream *input_stream = input_format->streams[audio_stream_index];
  const AVCodec *decoder_codec =
      avcodec_find_decoder(input_stream->codecpar->codec_id);
  if (!decoder_codec) {
    within_message(2, "The source audio decoder is not installed.");
    result = AVERROR_DECODER_NOT_FOUND;
    goto cleanup;
  }
  decoder = avcodec_alloc_context3(decoder_codec);
  if (!decoder) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  result =
      avcodec_parameters_to_context(decoder, input_stream->codecpar);
  if (result < 0) {
    goto cleanup;
  }
  decoder->pkt_timebase = input_stream->time_base;
  result = avcodec_open2(decoder, decoder_codec, NULL);
  if (result < 0) {
    report_av_error("Audio decoder initialization failed", result);
    goto cleanup;
  }

  const AVCodec *encoder_codec = avcodec_find_encoder(
      wma_output
          ? AV_CODEC_ID_WMAV2
          : aac_output
                ? AV_CODEC_ID_AAC
          : mp3_output
                ? AV_CODEC_ID_MP3
          : alac_output
                ? AV_CODEC_ID_ALAC
                : flac_output
                      ? AV_CODEC_ID_FLAC
                      : aiff_output
                            ? AV_CODEC_ID_PCM_S16BE
                            : amr_output ? AV_CODEC_ID_AMR_NB
                                         : AV_CODEC_ID_PCM_S16LE);
  if (!encoder_codec) {
    result = AVERROR_ENCODER_NOT_FOUND;
    goto cleanup;
  }
  encoder = avcodec_alloc_context3(encoder_codec);
  if (!encoder) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  encoder->sample_rate =
      amr_output
          ? 8000
          : wma_output
                ? 48000
                : mp3_output
                      ? decoder->sample_rate <= 32000
                            ? 32000
                            : decoder->sample_rate <= 44100 ? 44100 : 48000
                      : aac_output
                            ? decoder->sample_rate <= 8000
                                  ? 8000
                                  : decoder->sample_rate <= 11025
                                        ? 11025
                                        : decoder->sample_rate <= 12000
                                              ? 12000
                                              : decoder->sample_rate <= 16000
                                                    ? 16000
                                                    : decoder->sample_rate <= 22050
                                                          ? 22050
                                                          : decoder->sample_rate <= 24000
                                                                ? 24000
                                                                : decoder->sample_rate <= 32000
                                                                      ? 32000
                                                                      : decoder->sample_rate <= 44100 ? 44100 : 48000
                      : decoder->sample_rate;
  encoder->sample_fmt =
      wma_output ? AV_SAMPLE_FMT_FLTP
                 : (mp3_output || aac_output) ? AV_SAMPLE_FMT_FLTP
                 : alac_output ? AV_SAMPLE_FMT_S16P : AV_SAMPLE_FMT_S16;
  encoder->time_base = (AVRational){1, encoder->sample_rate};
  if (decoder->ch_layout.order == AV_CHANNEL_ORDER_UNSPEC) {
    int channels = decoder->ch_layout.nb_channels;
    av_channel_layout_uninit(&decoder->ch_layout);
    av_channel_layout_default(&decoder->ch_layout, channels);
    if (decoder->ch_layout.nb_channels <= 0) {
      result = AVERROR(EINVAL);
      goto cleanup;
    }
  }
  if (amr_output) {
    av_channel_layout_default(&encoder->ch_layout, 1);
    result = encoder->ch_layout.nb_channels == 1 ? 0 : AVERROR(EINVAL);
  } else if (wma_output || mp3_output || aac_output) {
    av_channel_layout_default(
        &encoder->ch_layout,
        decoder->ch_layout.nb_channels > 2 ? 2
                                           : decoder->ch_layout.nb_channels);
    result = encoder->ch_layout.nb_channels > 0 ? 0 : AVERROR(EINVAL);
  } else {
    result =
        av_channel_layout_copy(&encoder->ch_layout, &decoder->ch_layout);
  }
  if (result < 0) {
    goto cleanup;
  }
  if (alac_output) {
    encoder->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
    av_dict_set(&encoder_options, "min_prediction_order", "4", 0);
    av_dict_set(&encoder_options, "max_prediction_order", "4", 0);
  } else if (wma_output) {
    encoder->bit_rate = 320000;
  } else if (amr_output) {
    encoder->bit_rate = 12200;
  } else if (mp3_output) {
    encoder->bit_rate =
        encoder->ch_layout.nb_channels == 1 ? 128000 : 192000;
    av_dict_set(&encoder_options, "compression_level", "9", 0);
    if (encoder->ch_layout.nb_channels == 2) {
      av_dict_set(&encoder_options, "joint_stereo", "1", 0);
    }
  } else if (aac_output) {
    encoder->bit_rate =
        encoder->ch_layout.nb_channels == 1 ? 128000 : 192000;
    av_dict_set(&encoder_options, "aac_coder", "fast", 0);
    av_dict_set(&encoder_options, "aac_tns", "0", 0);
    av_dict_set(&encoder_options, "aac_pns", "0", 0);
    av_dict_set(&encoder_options, "aac_is", "0", 0);
    av_dict_set(&encoder_options, "aac_ms", "0", 0);
  }
  result = avcodec_open2(encoder, encoder_codec, &encoder_options);
  av_dict_free(&encoder_options);
  if (result < 0) {
    report_av_error("Audio encoder initialization failed", result);
    goto cleanup;
  }
  const int output_frame_samples =
      encoder->frame_size > 0 ? encoder->frame_size : 8192;
  if (output_frame_samples > 8192) {
    within_message(2, "The audio encoder frame size exceeds the bounded FIFO limit.");
    result = AVERROR_INVALIDDATA;
    goto cleanup;
  }

  result = avformat_alloc_output_context2(
      &output_format, NULL,
      wma_output
          ? "asf"
          : aac_output
                ? "adts"
          : mp3_output
                ? "mp3"
          : alac_output
                ? "ipod"
                : flac_output
                      ? "flac"
                      : aiff_output ? "aiff" : amr_output ? "amr" : "wav",
      NULL);
  if (result < 0 || !output_format) {
    result = result < 0 ? result : AVERROR(EINVAL);
    goto cleanup;
  }
  AVStream *output_stream = avformat_new_stream(output_format, NULL);
  if (!output_stream) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  output_stream->time_base = encoder->time_base;
  result =
      avcodec_parameters_from_context(output_stream->codecpar, encoder);
  if (result < 0) {
    goto cleanup;
  }
  av_dict_copy(&output_stream->metadata, input_stream->metadata, 0);
  av_dict_copy(&output_format->metadata, input_format->metadata, 0);

  output_buffer = av_malloc(WITHIN_AVIO_OUTPUT_BUFFER_SIZE);
  if (!output_buffer) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  output_io = avio_alloc_context(output_buffer, WITHIN_AVIO_OUTPUT_BUFFER_SIZE, 1,
                                 &output, NULL, output_write, output_seek);
  if (!output_io) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  output_buffer = NULL;
  output_format->pb = output_io;
  output_format->flags |= AVFMT_FLAG_CUSTOM_IO;
  if (alac_output) {
    av_dict_set(&muxer_options, "movflags",
                "empty_moov+default_base_moof", 0);
    av_dict_set(&muxer_options, "frag_duration", "5000000", 0);
  }
  result = avformat_write_header(output_format, &muxer_options);
  av_dict_free(&muxer_options);
  if (result < 0) {
    report_av_error("Audio header write failed", result);
    goto cleanup;
  }

  result = swr_alloc_set_opts2(
      &resampler, &encoder->ch_layout, encoder->sample_fmt,
      encoder->sample_rate, &decoder->ch_layout, decoder->sample_fmt,
      decoder->sample_rate, 0, NULL);
  if (result < 0 || !resampler) {
    result = result < 0 ? result : AVERROR(ENOMEM);
    goto cleanup;
  }
  result = swr_init(resampler);
  if (result < 0) {
    goto cleanup;
  }

  input_packet = av_packet_alloc();
  encoded_packet = av_packet_alloc();
  decoded_frame = av_frame_alloc();
  converted_frame = av_frame_alloc();
  if (!input_packet || !encoded_packet || !decoded_frame ||
      !converted_frame) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  fifo = av_audio_fifo_alloc(encoder->sample_fmt,
                             encoder->ch_layout.nb_channels,
                             WITHIN_AUDIO_FIFO_MAX_SAMPLES);
  if (!fifo) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  pipeline = (WithinAudioPipeline){
      .decoder = decoder,
      .encoder = encoder,
      .output_format = output_format,
      .output_stream = output_stream,
      .resampler = resampler,
      .decoded_frame = decoded_frame,
      .converted_frame = converted_frame,
      .encoded_packet = encoded_packet,
      .fifo = fifo,
      .output_frame_samples = output_frame_samples,
      .next_pts = 0,
  };

  while ((result = av_read_frame(input_format, input_packet)) >= 0) {
    if (within_is_cancelled()) {
      result = AVERROR_EXIT;
      goto cleanup;
    }
    if (input_packet->stream_index == audio_stream_index) {
      int64_t media_time =
          packet_time_us(input_packet, input_stream);
      result = drain_audio_decoder(&pipeline, input_packet);
      if (result < 0) {
        report_av_error("Audio decode or encode failed", result);
        goto cleanup;
      }
      within_progress((double)input.position, (double)output.size,
                      (double)media_time, (double)input_format->duration,
                      (double)emscripten_get_heap_size());
    }
    av_packet_unref(input_packet);
  }
  if (result != AVERROR_EOF) {
    report_av_error("Input packet read failed", result);
    goto cleanup;
  }
  result = drain_audio_decoder(&pipeline, NULL);
  if (result < 0) {
    report_av_error("Audio decoder flush failed", result);
    goto cleanup;
  }
  result = flush_audio_resampler(&pipeline);
  if (result < 0) {
    report_av_error("Audio resampler flush failed", result);
    goto cleanup;
  }
  if (fifo) {
    result = drain_audio_fifo(&pipeline, 1);
    if (result < 0) {
      report_av_error("Audio FIFO flush failed", result);
      goto cleanup;
    }
  }
  result = write_audio_packets(&pipeline, NULL);
  if (result < 0) {
    report_av_error("Audio encoder flush failed", result);
    goto cleanup;
  }
  result = av_write_trailer(output_format);
  if (result < 0) {
    report_av_error("Audio trailer write failed", result);
    goto cleanup;
  }
  avio_flush(output_io);
  result = within_has_sync_output()
               ? within_output_truncate_sync((double)output.size)
               : within_output_truncate((double)output.size);
  if (result < 0) {
    goto cleanup;
  }
  result = within_has_sync_output() ? within_output_flush_sync()
                                    : within_output_flush();

cleanup:
  av_dict_free(&encoder_options);
  av_dict_free(&muxer_options);
  av_packet_free(&input_packet);
  av_packet_free(&encoded_packet);
  av_frame_free(&decoded_frame);
  av_frame_free(&converted_frame);
  av_audio_fifo_free(fifo);
  swr_free(&resampler);
  avcodec_free_context(&decoder);
  avcodec_free_context(&encoder);
  if (output_format) {
    output_format->pb = NULL;
    avformat_free_context(output_format);
  }
  if (output_io) {
    av_freep(&output_io->buffer);
    avio_context_free(&output_io);
  } else {
    av_freep(&output_buffer);
  }
  if (input_format) {
    input_format->pb = NULL;
    avformat_close_input(&input_format);
  }
  if (input_io) {
    av_freep(&input_io->buffer);
    avio_context_free(&input_io);
  } else {
    av_freep(&input_buffer);
  }
  return result < 0 ? result : 0;
}

typedef struct WithinVideoPipeline {
  AVCodecContext *decoder;
  AVCodecContext *encoder;
  AVFormatContext *output_format;
  AVStream *output_stream;
  AVFrame *decoded_frame;
  AVFrame *converted_frame;
  struct SwsContext *scaler;
  AVPacket *encoded_packet;
  int64_t next_pts;
} WithinVideoPipeline;

static int write_video_packets(WithinVideoPipeline *pipeline,
                               AVFrame *frame) {
  int result = avcodec_send_frame(pipeline->encoder, frame);
  if (result < 0) {
    return result;
  }
  while (1) {
    result =
        avcodec_receive_packet(pipeline->encoder, pipeline->encoded_packet);
    if (result == AVERROR(EAGAIN) || result == AVERROR_EOF) {
      return 0;
    }
    if (result < 0) {
      return result;
    }
    av_packet_rescale_ts(pipeline->encoded_packet,
                         pipeline->encoder->time_base,
                         pipeline->output_stream->time_base);
    pipeline->encoded_packet->stream_index =
        pipeline->output_stream->index;
    result = av_interleaved_write_frame(pipeline->output_format,
                                        pipeline->encoded_packet);
    av_packet_unref(pipeline->encoded_packet);
    if (result < 0) {
      return result;
    }
  }
}

static int drain_video_decoder(WithinVideoPipeline *pipeline,
                               const AVPacket *packet) {
  int result = avcodec_send_packet(pipeline->decoder, packet);
  if (result < 0) {
    return result;
  }
  while (1) {
    result =
        avcodec_receive_frame(pipeline->decoder, pipeline->decoded_frame);
    if (result == AVERROR(EAGAIN) || result == AVERROR_EOF) {
      return 0;
    }
    if (result < 0) {
      return result;
    }
    AVFrame *frame_to_encode = pipeline->decoded_frame;
    if (pipeline->converted_frame) {
      if (!pipeline->scaler) {
        pipeline->scaler = sws_getContext(
            pipeline->decoded_frame->width,
            pipeline->decoded_frame->height,
            pipeline->decoded_frame->format,
            pipeline->encoder->width,
            pipeline->encoder->height,
            pipeline->encoder->pix_fmt,
            SWS_BILINEAR, NULL, NULL, NULL);
        if (!pipeline->scaler) {
          av_frame_unref(pipeline->decoded_frame);
          return AVERROR(ENOMEM);
        }
      }
      result = av_frame_make_writable(pipeline->converted_frame);
      if (result < 0) {
        av_frame_unref(pipeline->decoded_frame);
        return result;
      }
      result = sws_scale(
          pipeline->scaler,
          (const uint8_t *const *)pipeline->decoded_frame->data,
          pipeline->decoded_frame->linesize, 0, pipeline->decoder->height,
          pipeline->converted_frame->data,
          pipeline->converted_frame->linesize);
      if (result != pipeline->encoder->height) {
        av_frame_unref(pipeline->decoded_frame);
        return result < 0 ? result : AVERROR_EXTERNAL;
      }
      frame_to_encode = pipeline->converted_frame;
    } else if (pipeline->decoded_frame->format !=
               pipeline->encoder->pix_fmt) {
      av_frame_unref(pipeline->decoded_frame);
      return AVERROR(ENOSYS);
    }
    frame_to_encode->pts = pipeline->next_pts++;
    result = write_video_packets(pipeline, frame_to_encode);
    av_frame_unref(pipeline->decoded_frame);
    if (result < 0) {
      return result;
    }
  }
}

static int within_video_reencode(int webm_codec, int preserve_vorbis_audio) {
  const int webm = webm_codec != 0;
  const int vp9 = webm_codec == 2;
  int result = 0;
  int video_stream_index = -1;
  int audio_stream_index = -1;
  AVFormatContext *input_format = NULL;
  AVFormatContext *output_format = NULL;
  AVIOContext *input_io = NULL;
  AVIOContext *output_io = NULL;
  uint8_t *input_buffer = NULL;
  uint8_t *output_buffer = NULL;
  AVCodecContext *decoder = NULL;
  AVCodecContext *encoder = NULL;
  AVPacket *input_packet = NULL;
  AVPacket *encoded_packet = NULL;
  AVFrame *decoded_frame = NULL;
  AVFrame *converted_frame = NULL;
  struct SwsContext *scaler = NULL;
  AVDictionary *encoder_options = NULL;
  AVDictionary *muxer_options = NULL;
  WithinInput input = {.position = 0, .size = (int64_t)within_input_size()};
  WithinOutput output = {.position = 0, .size = 0};
  WithinVideoPipeline pipeline = {0};

  if (input.size <= 0) {
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
  input_format->max_analyze_duration = 2 * AV_TIME_BASE;
  result = avformat_open_input(&input_format, NULL, NULL, NULL);
  if (result < 0) {
    report_av_error("Input probing failed", result);
    goto cleanup;
  }
  const int raw_mpeg_video =
      input_format->iformat && input_format->iformat->name &&
      strcmp(input_format->iformat->name, "mpegvideo") == 0;
  result = avformat_find_stream_info(input_format, NULL);
  if (result < 0) {
    report_av_error("Video stream inspection failed", result);
    goto cleanup;
  }
  if (input_format->nb_chapters > 0) {
    within_message(
        1,
        webm
            ? "Source chapters are explicitly excluded from the re-encoded WebM."
            : "Source chapters are explicitly excluded from the re-encoded MP4.");
  }

  for (unsigned int index = 0; index < input_format->nb_streams; index++) {
    AVStream *stream = input_format->streams[index];
    if (video_stream_index < 0 &&
        stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
        !(stream->disposition & AV_DISPOSITION_ATTACHED_PIC)) {
      video_stream_index = (int)index;
      continue;
    }
    if (preserve_vorbis_audio && audio_stream_index < 0 &&
        stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO &&
        stream->codecpar->codec_id == AV_CODEC_ID_VORBIS) {
      audio_stream_index = (int)index;
      continue;
    }
    if (stream->disposition & AV_DISPOSITION_ATTACHED_PIC ||
        stream->codecpar->codec_type == AVMEDIA_TYPE_ATTACHMENT) {
      within_message(
          1,
          webm
              ? "The source attachment is explicitly excluded from the "
                "re-encoded WebM."
              : "The source attachment is explicitly excluded from the "
                "re-encoded MP4.");
    } else if (stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
      within_message(
          1,
          preserve_vorbis_audio
              ? "Only the first Vorbis audio stream is preserved by this "
                "WebM profile."
              : "The source audio stream is explicitly excluded from this "
                "video-only re-encode profile.");
    } else if (stream->codecpar->codec_type == AVMEDIA_TYPE_SUBTITLE) {
      within_message(
          1,
          webm
              ? "The source subtitle stream is explicitly excluded from the "
                "re-encoded WebM."
              : "The source subtitle stream is explicitly excluded from the "
                "re-encoded MP4.");
    } else if (stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
      within_message(
          1,
          "Only the first video stream is converted by this profile.");
    }
  }
  if (video_stream_index < 0) {
    within_message(2, "No decodable video stream was found in the source container.");
    result = AVERROR_STREAM_NOT_FOUND;
    goto cleanup;
  }
  if (preserve_vorbis_audio && audio_stream_index < 0) {
    within_message(
        2,
        "The OGV to WebM profile requires a Vorbis audio stream so audio "
        "can be preserved without a second lossy encode.");
    result = AVERROR_STREAM_NOT_FOUND;
    goto cleanup;
  }

  AVStream *input_stream = input_format->streams[video_stream_index];
  const AVCodec *decoder_codec =
      avcodec_find_decoder(input_stream->codecpar->codec_id);
  if (!decoder_codec) {
    within_message(2, "The source video decoder is not installed.");
    result = AVERROR_DECODER_NOT_FOUND;
    goto cleanup;
  }
  decoder = avcodec_alloc_context3(decoder_codec);
  if (!decoder) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  result =
      avcodec_parameters_to_context(decoder, input_stream->codecpar);
  if (result < 0) {
    goto cleanup;
  }
  decoder->pkt_timebase = input_stream->time_base;
  int decoder_thread_count = WITHIN_VIDEO_THREADS;
  if (vp9 && decoder->width > 1280 && decoder_thread_count > 2) {
    decoder_thread_count = 2;
    within_message(
        1,
        "The VP9 profile limits high-resolution decoding to two threads to "
        "preserve its fixed memory budget.");
  }
#if defined(WITHIN_MPEG4_THREADED)
  decoder->thread_count = decoder_thread_count;
  if (decoder_thread_count > 1) {
#else
  decoder->thread_count = webm ? decoder_thread_count : 1;
  if (webm && decoder_thread_count > 1) {
#endif
    decoder->thread_type = FF_THREAD_FRAME | FF_THREAD_SLICE;
  }
  result = avcodec_open2(decoder, decoder_codec, NULL);
  if (result < 0) {
    report_av_error("Video decoder initialization failed", result);
    goto cleanup;
  }

  AVRational frame_rate = input_stream->avg_frame_rate;
  if (raw_mpeg_video) {
    frame_rate = av_guess_frame_rate(input_format, input_stream, NULL);
  }
  if (frame_rate.num <= 0 || frame_rate.den <= 0) {
    frame_rate = (AVRational){24, 1};
  }
  const AVCodec *encoder_codec = avcodec_find_encoder(
      vp9 ? AV_CODEC_ID_VP9 : webm ? AV_CODEC_ID_VP8 : AV_CODEC_ID_MPEG4);
  if (!encoder_codec) {
    result = AVERROR_ENCODER_NOT_FOUND;
    goto cleanup;
  }
  encoder = avcodec_alloc_context3(encoder_codec);
  if (!encoder) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  encoder->width = decoder->width;
  encoder->height = decoder->height;
  if (webm && encoder->width > 640) {
    encoder->width = 640;
    encoder->height =
        (int)(((int64_t)decoder->height * encoder->width) / decoder->width);
    encoder->height &= ~1;
    if (encoder->height < 2) {
      encoder->height = 2;
    }
    within_message(
        1,
        "The WebM profile downscales video to at most 640 pixels wide to "
        "enforce its CPU and memory budget.");
  }
  within_message(
      1,
      webm
          ? "The WebM profile normalizes variable frame timing to the "
            "source average frame rate."
          : "The MPEG-4 profile normalizes variable frame timing to the "
            "source average frame rate.");
  encoder->pix_fmt = AV_PIX_FMT_YUV420P;
  encoder->time_base = av_inv_q(frame_rate);
  encoder->framerate = frame_rate;
  encoder->bit_rate = webm ? 600 * 1000 : 2 * 1000 * 1000;
  encoder->gop_size = webm ? 120 : 48;
  encoder->max_b_frames = 0;
#if defined(WITHIN_MPEG4_THREADED)
  encoder->thread_count = WITHIN_VIDEO_THREADS;
#else
  encoder->thread_count = webm ? WITHIN_VIDEO_THREADS : 1;
#endif
  encoder->flags |= AV_CODEC_FLAG_GLOBAL_HEADER | AV_CODEC_FLAG_BITEXACT;
  encoder->sample_aspect_ratio = decoder->sample_aspect_ratio;
  encoder->color_primaries = decoder->color_primaries;
  encoder->color_trc = decoder->color_trc;
  encoder->colorspace = decoder->colorspace;
  encoder->color_range = decoder->color_range;
  encoder->chroma_sample_location = decoder->chroma_sample_location;
  if (webm) {
    av_dict_set(&encoder_options, "deadline", "realtime", 0);
    av_dict_set(&encoder_options, "cpu-used", "8", 0);
    av_dict_set(&encoder_options, "lag-in-frames", "0", 0);
    av_dict_set(&encoder_options, "auto-alt-ref", "0", 0);
    if (vp9) {
      av_dict_set(&encoder_options, "row-mt", "1", 0);
      av_dict_set(&encoder_options, "tile-columns", "1", 0);
    } else {
      av_dict_set_int(&encoder_options, "slices", WITHIN_VIDEO_THREADS, 0);
    }
  }
  result = avcodec_open2(encoder, encoder_codec, &encoder_options);
  if (result < 0) {
    report_av_error(
        vp9 ? "VP9 encoder initialization failed"
            : webm ? "VP8 encoder initialization failed"
             : "MPEG-4 encoder initialization failed",
        result);
    goto cleanup;
  }

  result = avformat_alloc_output_context2(
      &output_format, NULL, webm ? "webm" : "mp4", NULL);
  if (result < 0 || !output_format) {
    result = result < 0 ? result : AVERROR(EINVAL);
    goto cleanup;
  }
  output_format->flags |= AVFMT_FLAG_BITEXACT;
  AVStream *output_stream = avformat_new_stream(output_format, NULL);
  if (!output_stream) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  output_stream->time_base = encoder->time_base;
  result =
      avcodec_parameters_from_context(output_stream->codecpar, encoder);
  if (result < 0) {
    goto cleanup;
  }
  av_dict_copy(&output_stream->metadata, input_stream->metadata, 0);
  av_dict_copy(&output_format->metadata, input_format->metadata, 0);
  output_stream->sample_aspect_ratio = encoder->sample_aspect_ratio;
  AVStream *audio_input_stream = NULL;
  AVStream *audio_output_stream = NULL;
  if (preserve_vorbis_audio) {
    audio_input_stream = input_format->streams[audio_stream_index];
    audio_output_stream = avformat_new_stream(output_format, NULL);
    if (!audio_output_stream) {
      result = AVERROR(ENOMEM);
      goto cleanup;
    }
    audio_output_stream->time_base = audio_input_stream->time_base;
    result = avcodec_parameters_copy(audio_output_stream->codecpar,
                                     audio_input_stream->codecpar);
    if (result < 0) {
      goto cleanup;
    }
    audio_output_stream->codecpar->codec_tag = 0;
    av_dict_copy(&audio_output_stream->metadata,
                 audio_input_stream->metadata, 0);
  }

  if (encoder->width != decoder->width ||
      encoder->height != decoder->height) {
    converted_frame = av_frame_alloc();
    if (!converted_frame) {
      result = AVERROR(ENOMEM);
      goto cleanup;
    }
    converted_frame->format = encoder->pix_fmt;
    converted_frame->width = encoder->width;
    converted_frame->height = encoder->height;
    converted_frame->sample_aspect_ratio = encoder->sample_aspect_ratio;
    converted_frame->color_primaries = encoder->color_primaries;
    converted_frame->color_trc = encoder->color_trc;
    converted_frame->colorspace = encoder->colorspace;
    converted_frame->color_range = encoder->color_range;
    converted_frame->chroma_location = encoder->chroma_sample_location;
    result = av_frame_get_buffer(converted_frame, 32);
    if (result < 0) {
      goto cleanup;
    }
  }

  output_buffer = av_malloc(WITHIN_AVIO_OUTPUT_BUFFER_SIZE);
  if (!output_buffer) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  output_io = avio_alloc_context(output_buffer, WITHIN_AVIO_OUTPUT_BUFFER_SIZE, 1,
                                 &output, NULL, output_write, output_seek);
  if (!output_io) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  output_buffer = NULL;
  output_format->pb = output_io;
  output_format->flags |= AVFMT_FLAG_CUSTOM_IO | AVFMT_FLAG_AUTO_BSF;
  if (!webm) {
    av_dict_set(&muxer_options, "movflags",
                "frag_keyframe+empty_moov+default_base_moof", 0);
  }
  result = avformat_write_header(output_format, &muxer_options);
  if (result < 0) {
    report_av_error(webm ? "WebM header write failed"
                         : "MP4 header write failed",
                    result);
    goto cleanup;
  }

  input_packet = av_packet_alloc();
  encoded_packet = av_packet_alloc();
  decoded_frame = av_frame_alloc();
  if (!input_packet || !encoded_packet || !decoded_frame) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  pipeline = (WithinVideoPipeline){
      .decoder = decoder,
      .encoder = encoder,
      .output_format = output_format,
      .output_stream = output_stream,
      .decoded_frame = decoded_frame,
      .converted_frame = converted_frame,
      .scaler = scaler,
      .encoded_packet = encoded_packet,
      .next_pts = 0,
  };

  while ((result = av_read_frame(input_format, input_packet)) >= 0) {
    if (within_is_cancelled()) {
      result = AVERROR_EXIT;
      goto cleanup;
    }
    if (input_packet->stream_index == video_stream_index) {
      int64_t media_time =
          packet_time_us(input_packet, input_stream);
      result = drain_video_decoder(&pipeline, input_packet);
      if (result < 0) {
        report_av_error(
            vp9 ? "Video decode or VP9 encode failed"
                : webm ? "Video decode or VP8 encode failed"
                 : "Video decode or MPEG-4 encode failed",
            result);
        goto cleanup;
      }
      within_progress((double)input.position, (double)output.size,
                      (double)media_time, (double)input_format->duration,
                      (double)emscripten_get_heap_size());
    } else if (preserve_vorbis_audio &&
               input_packet->stream_index == audio_stream_index) {
      av_packet_rescale_ts(input_packet, audio_input_stream->time_base,
                           audio_output_stream->time_base);
      input_packet->stream_index = audio_output_stream->index;
      result = av_interleaved_write_frame(output_format, input_packet);
      if (result < 0) {
        report_av_error("Vorbis audio stream copy failed", result);
        goto cleanup;
      }
    }
    av_packet_unref(input_packet);
  }
  if (result != AVERROR_EOF) {
    goto cleanup;
  }
  result = drain_video_decoder(&pipeline, NULL);
  if (result < 0) {
    goto cleanup;
  }
  result = write_video_packets(&pipeline, NULL);
  if (result < 0) {
    goto cleanup;
  }
  result = av_write_trailer(output_format);
  if (result < 0) {
    goto cleanup;
  }
  avio_flush(output_io);
  result = within_has_sync_output()
               ? within_output_truncate_sync((double)output.size)
               : within_output_truncate((double)output.size);
  if (result < 0) {
    goto cleanup;
  }
  result = within_has_sync_output() ? within_output_flush_sync()
                                    : within_output_flush();

cleanup:
  scaler = pipeline.scaler ? pipeline.scaler : scaler;
  av_dict_free(&encoder_options);
  av_dict_free(&muxer_options);
  av_packet_free(&input_packet);
  av_packet_free(&encoded_packet);
  av_frame_free(&decoded_frame);
  av_frame_free(&converted_frame);
  sws_freeContext(scaler);
  avcodec_free_context(&decoder);
  avcodec_free_context(&encoder);
  if (output_format) {
    output_format->pb = NULL;
    avformat_free_context(output_format);
  }
  if (output_io) {
    av_freep(&output_io->buffer);
    avio_context_free(&output_io);
  } else {
    av_freep(&output_buffer);
  }
  if (input_format) {
    input_format->pb = NULL;
    avformat_close_input(&input_format);
  }
  if (input_io) {
    av_freep(&input_io->buffer);
    avio_context_free(&input_io);
  } else {
    av_freep(&input_buffer);
  }
  return result < 0 ? result : 0;
}

static int within_video_to_mpeg4(void) {
  return within_video_reencode(0, 0);
}

static int within_video_to_webm(void) {
  return within_video_reencode(1, 0);
}

static int within_ogv_to_webm(void) {
  return within_video_reencode(1, 1);
}

static int within_video_to_vp9(void) {
  return within_video_reencode(2, 0);
}

static int within_ogv_to_vp9(void) {
  return within_video_reencode(2, 1);
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
  int *synthesize_video_dts = NULL;
  AVBSFContext **stream_bsfs = NULL;
  int64_t *last_dts = NULL;
  int64_t *packet_counts = NULL;
  int64_t output_packet_count = 0;
  int video_stream_index = -1;
  int audio_stream_index = -1;
  int mpeg2_pending_gop_start = 0;
  int mpeg2_seen_picture = 0;
  int mpeg2_gop_max_temporal_reference = -1;
  int64_t mpeg2_gop_display_base = 0;
  AVDictionary *muxer_options = NULL;
  WithinInput input = {.position = 0, .size = (int64_t)within_input_size()};
  WithinOutput output = {.position = 0, .size = 0};
  AVPacket *packet = NULL;
  AVPacket **prefetched_packets = NULL;
  int prefetched_packet_count = 0;
  int prefetched_packet_capacity = 0;
  int next_prefetched_packet = 0;

  if (profile == 3 || profile == 6 || profile == 8 || profile == 9 ||
      profile == 28 || profile == 29 || profile == 30 || profile == 31) {
    return within_audio_transcode(profile);
  }
  if (profile == 4) {
    return within_video_to_mpeg4();
  }
  if (profile == 5) {
    return within_video_to_webm();
  }
  if (profile == 7) {
    return within_ogv_to_webm();
  }
  if (profile == 10) {
    return within_video_to_vp9();
  }
  if (profile == 11) {
    return within_ogv_to_vp9();
  }
  if (profile != 1 && profile != 2 && profile != 12 && profile != 13 &&
      profile != 14 && profile != 15 && profile != 16 && profile != 17 &&
      profile != 18 && profile != 19 && profile != 20 && profile != 21 &&
      profile != 22 && profile != 23 && profile != 24 && profile != 25 &&
      profile != 26 && profile != 27) {
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
  input_format->max_analyze_duration = 2 * AV_TIME_BASE;

  result = avformat_open_input(&input_format, NULL, NULL, NULL);
  if (result < 0) {
    report_av_error("Input probing failed", result);
    goto cleanup;
  }
  const int matroska_output = profile == 23;
  const int container_mpegts_output = profile == 24;
  const int container_threegp_output = profile == 25;
  const int container_mov_output = profile == 26;
  const int container_flv_output = profile == 27;
  const int matroska_live_output =
      matroska_output && input_format->iformat &&
      input_format->iformat->name &&
      strstr(input_format->iformat->name, "avi") == NULL;
  const int audio_extraction_output =
      profile == 18 || profile == 19 || profile == 20 || profile == 21;
  const int elementary_audio_input_requires_probe =
      (profile == 18 || profile == 19) && input_format->iformat &&
      input_format->iformat->name &&
      (strstr(input_format->iformat->name, "mpegts") != NULL ||
       strstr(input_format->iformat->name, "flv") != NULL);
  const int matroska_input_requires_probe =
      matroska_output && input_format->iformat &&
      input_format->iformat->name &&
      (strstr(input_format->iformat->name, "mpegts") != NULL ||
       strstr(input_format->iformat->name, "flv") != NULL ||
       strstr(input_format->iformat->name, "avi") != NULL);
  const int container_mpegts_input_requires_probe =
      container_mpegts_output;
  const int container_threegp_input_requires_probe =
      container_threegp_output && input_format->iformat &&
      input_format->iformat->name &&
      (strstr(input_format->iformat->name, "mpegts") != NULL ||
       strstr(input_format->iformat->name, "flv") != NULL);
  const int container_mov_input_requires_probe =
      container_mov_output && input_format->iformat &&
      input_format->iformat->name &&
      (strstr(input_format->iformat->name, "mpegts") != NULL ||
       strstr(input_format->iformat->name, "flv") != NULL);
  const int container_flv_input_requires_probe =
      container_flv_output && input_format->iformat &&
      input_format->iformat->name &&
      strstr(input_format->iformat->name, "mpegts") != NULL;
  if (profile != 17 &&
      ((!audio_extraction_output && !matroska_output &&
        !container_mpegts_output && !container_threegp_output &&
        !container_mov_output && !container_flv_output) ||
       elementary_audio_input_requires_probe ||
       matroska_input_requires_probe ||
       container_mpegts_input_requires_probe ||
       container_threegp_input_requires_probe ||
       container_mov_input_requires_probe ||
       container_flv_input_requires_probe)) {
    result = avformat_find_stream_info(input_format, NULL);
    if (result < 0) {
      report_av_error("Input stream inspection failed", result);
      goto cleanup;
    }
  }
  const int h264_output = profile == 12;
  const int mpeg2_output = profile == 13;
  const int mpeg2_transport_output = profile == 14;
  const int transport_output =
      mpeg2_transport_output || container_mpegts_output;
  const int m4v_output = profile == 15;
  const int m4v_mp4_output = profile == 16;
  const int av1_webm_output = profile == 17;
  const int mp3_output = profile == 18;
  const int aac_output = profile == 19;
  const int vorbis_output = profile == 20;
  const int opus_output = profile == 21;
  const int hevc_output = profile == 22;
  const int ogg_audio_output = vorbis_output || opus_output;
  const int elementary_output =
      h264_output || hevc_output || mpeg2_output || m4v_output;
  const int video_only_output =
      elementary_output || mpeg2_transport_output || m4v_mp4_output;
  const enum AVCodecID expected_video_codec =
      h264_output
          ? AV_CODEC_ID_H264
          : hevc_output ? AV_CODEC_ID_HEVC
          : (mpeg2_output || mpeg2_transport_output) ? AV_CODEC_ID_MPEG2VIDEO
          : av1_webm_output                          ? AV_CODEC_ID_AV1
                                                     : AV_CODEC_ID_MPEG4;
  const char *video_label = h264_output
                                ? "H.264"
                                : hevc_output
                                    ? "HEVC"
                                : av1_webm_output
                                    ? "AV1"
                                : (mpeg2_output || mpeg2_transport_output)
                                      ? "MPEG-2"
                                      : "MPEG-4 Part 2";
  const char *output_label = h264_output
                                 ? "H.264"
                                 : matroska_output ? "Matroska"
                                 : container_mpegts_output ? "MPEG-TS"
                                 : container_threegp_output ? "3GP"
                                 : container_mov_output ? "MOV"
                                 : container_flv_output ? "FLV"
                                 : hevc_output ? "HEVC"
                                 : mpeg2_output ? "MPEG-2"
                                 : mpeg2_transport_output ? "MPEG-TS"
                                 : m4v_output             ? "M4V"
                                 : av1_webm_output        ? "WebM"
                                 : mp3_output             ? "MP3"
                                 : aac_output             ? "AAC"
                                 : vorbis_output          ? "Ogg Vorbis"
                                 : opus_output            ? "Ogg Opus"
                                                          : "MP4";
  const char *muxer_name = h264_output
                               ? "h264"
                               : matroska_output ? "matroska"
                               : container_mpegts_output ? "mpegts"
                               : container_threegp_output ? "3gp"
                               : container_mov_output ? "mov"
                               : container_flv_output ? "flv"
                               : hevc_output ? "hevc"
                               : mpeg2_output ? "mpeg2video"
                               : mpeg2_transport_output ? "mpegts"
                               : m4v_output             ? "m4v"
                               : av1_webm_output        ? "webm"
                               : mp3_output             ? "mp3"
                               : aac_output             ? "adts"
                               : ogg_audio_output       ? "ogg"
                                                        : "mp4";
  if (video_only_output || av1_webm_output) {
    for (unsigned int index = 0; index < input_format->nb_streams; index++) {
      AVStream *stream = input_format->streams[index];
      if (!(stream->disposition & AV_DISPOSITION_ATTACHED_PIC) &&
          stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
        video_stream_index = (int)index;
        break;
      }
    }
    if (video_stream_index < 0) {
      within_message(2, "No non-attached video stream was found for the requested output.");
      result = AVERROR_STREAM_NOT_FOUND;
      goto cleanup;
    }
    if (input_format->streams[video_stream_index]->codecpar->codec_id !=
        expected_video_codec) {
      char message[192] = {0};
      snprintf(message, sizeof(message),
               "The first non-attached video stream is not %s and cannot be copied by this profile.",
               video_label);
      within_message(2, message);
      result = AVERROR(ENOSYS);
      goto cleanup;
    }
  }
  if (audio_extraction_output) {
    const enum AVCodecID expected_audio_codec =
        mp3_output      ? AV_CODEC_ID_MP3
        : aac_output    ? AV_CODEC_ID_AAC
        : vorbis_output ? AV_CODEC_ID_VORBIS
                        : AV_CODEC_ID_OPUS;
    for (unsigned int index = 0; index < input_format->nb_streams; index++) {
      AVStream *stream = input_format->streams[index];
      if (stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO &&
          stream->codecpar->codec_id == expected_audio_codec) {
        audio_stream_index = (int)index;
        break;
      }
    }
    if (audio_stream_index < 0) {
      char message[192] = {0};
      snprintf(message, sizeof(message),
               "No %s audio stream was found; this lossless extraction profile does not re-encode other audio codecs.",
               mp3_output      ? "MP3"
               : aac_output    ? "AAC"
               : vorbis_output ? "Vorbis"
                               : "Opus");
      within_message(2, message);
      result = AVERROR_STREAM_NOT_FOUND;
      goto cleanup;
    }
  }
  if (container_flv_output) {
    for (unsigned int index = 0; index < input_format->nb_streams; index++) {
      AVStream *stream = input_format->streams[index];
      if (video_stream_index < 0 &&
          !(stream->disposition & AV_DISPOSITION_ATTACHED_PIC) &&
          stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
        video_stream_index = (int)index;
      } else if (audio_stream_index < 0 &&
                 stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
        audio_stream_index = (int)index;
      }
    }
    if (video_stream_index < 0 || audio_stream_index < 0) {
      within_message(
          2,
          "FLV stream copy requires one H.264 video stream and one AAC audio stream.");
      result = AVERROR_STREAM_NOT_FOUND;
      goto cleanup;
    }
    within_message(
        1,
        "FLV cannot reliably represent chapters, subtitles, attachments, language tags, or additional video and audio streams; any such source elements are explicitly excluded.");
  }
  if (input_format->nb_chapters > 0 && !matroska_output) {
    within_message(
        1,
        elementary_output
            ? "Source chapters cannot be represented in an elementary video stream and are explicitly excluded."
        : transport_output
            ? "Source chapters are explicitly excluded from this MPEG-TS wrapping profile."
        : container_threegp_output
            ? "Source chapters are explicitly excluded from this bounded 3GP remux profile."
        : container_mov_output
            ? "Source chapters are explicitly excluded from this bounded MOV remux profile."
        : container_flv_output
            ? "Source chapters are explicitly excluded from this bounded FLV remux profile."
        : av1_webm_output
            ? "Source chapters are explicitly excluded from this AV1 WebM remux profile."
        : profile == 2
            ? "Source chapters are explicitly excluded from the audio-only M4A output."
        : mp3_output
            ? "Source chapters are explicitly excluded from this MP3 extraction profile."
        : aac_output
            ? "Source chapters are explicitly excluded from this raw AAC extraction profile."
        : ogg_audio_output
            ? "Source chapters are explicitly excluded from this Ogg audio extraction profile."
            : "Source chapters are explicitly excluded from this MP4 remux profile.");
  }
  result = avformat_alloc_output_context2(
      &output_format, NULL, muxer_name, NULL);
  if (result < 0 || !output_format) {
    result = result < 0 ? result : AVERROR(EINVAL);
    char message[128] = {0};
    snprintf(message, sizeof(message), "%s muxer initialization failed",
             output_label);
    report_av_error(message, result);
    goto cleanup;
  }
  if (av1_webm_output || matroska_output || container_mpegts_output ||
      container_threegp_output || container_mov_output ||
      container_flv_output ||
      audio_extraction_output) {
    output_format->flags |= AVFMT_FLAG_BITEXACT;
  }

  stream_map = av_calloc(input_format->nb_streams, sizeof(*stream_map));
  synthesize_video_dts =
      av_calloc(input_format->nb_streams, sizeof(*synthesize_video_dts));
  stream_bsfs = av_calloc(input_format->nb_streams, sizeof(*stream_bsfs));
  last_dts = av_malloc_array(input_format->nb_streams, sizeof(*last_dts));
  packet_counts =
      av_calloc(input_format->nb_streams, sizeof(*packet_counts));
  if (!stream_map || !synthesize_video_dts || !stream_bsfs || !last_dts ||
      !packet_counts) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  for (unsigned int index = 0; index < input_format->nb_streams; index++) {
    AVStream *input_stream = input_format->streams[index];
    const int copy_compatible =
        stream_codec_is_copy_compatible(input_stream, profile, input_format);
    const int selected_stream =
        video_only_output
            ? (int)index == video_stream_index
        : av1_webm_output
            ? stream_is_supported(input_stream, profile) && copy_compatible
        : mp3_output
            ? (int)index == audio_stream_index
        : aac_output
            ? (int)index == audio_stream_index
        : ogg_audio_output
            ? (int)index == audio_stream_index
        : container_flv_output
            ? (int)index == video_stream_index ||
                  (int)index == audio_stream_index
            : stream_is_supported(input_stream, profile);
    stream_map[index] = -1;
    last_dts[index] = AV_NOPTS_VALUE;
    if (selected_stream && !copy_compatible) {
      if (matroska_output) {
        within_message(
            2,
            "Matroska stream copy received a stream codec outside the certified compatibility set.");
      } else if (container_mpegts_output) {
        within_message(
            2,
            "MPEG-TS stream copy accepts H.264 or HEVC video with AAC audio; this source needs a separately verified conversion route.");
      } else if (container_threegp_output) {
        within_message(
            2,
            "3GP stream copy accepts H.264 video with AAC audio; this source needs a separately verified conversion route.");
      } else if (container_mov_output) {
        within_message(
            2,
            "MOV stream copy accepts H.264 or HEVC video with AAC audio; this source needs a separately verified conversion route.");
      } else if (container_flv_output) {
        within_message(
            2,
            "FLV stream copy accepts H.264 video with AAC audio; this source needs a separately verified conversion route.");
      } else if (input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
        within_message(
            2,
            video_only_output
                ? "This video-only stream-copy profile received an incompatible video codec."
                : "Lossless MP4 stream copy accepts H.264 or HEVC video, or "
                  "MPEG-4 Part 2 video from AVI. "
                  "This source video codec needs a bounded re-encoding route that "
                  "is not installed.");
      } else if (profile == 2) {
        within_message(
            2,
            "Lossless M4A stream copy accepts AAC audio. This source "
            "audio codec needs a bounded re-encoding route that is not "
            "installed.");
      } else {
        within_message(
            2,
            "Lossless MP4 stream copy accepts AAC audio, or MP3 audio "
            "from AVI. This source "
            "audio codec needs a bounded re-encoding route that is not "
            "installed.");
      }
      result = AVERROR(ENOSYS);
      goto cleanup;
    }
    if (!selected_stream) {
      if (input_stream->disposition & AV_DISPOSITION_ATTACHED_PIC) {
        within_message(
            1,
            elementary_output
                ? "The source attached picture is explicitly excluded from the elementary video output."
            : transport_output
                ? "The source attached picture is explicitly excluded from this MPEG-TS wrapping profile."
            : container_threegp_output
                ? "The source attached picture is explicitly excluded from this 3GP remux profile."
            : container_mov_output
                ? "The source attached picture is explicitly excluded from this MOV remux profile."
            : container_flv_output
                ? "The source attached picture is explicitly excluded from this FLV remux profile."
            : profile == 2
                ? "The source cover-art stream is explicitly excluded from "
                  "this audio-only M4A profile."
            : mp3_output
                ? "The source attached picture is explicitly excluded from this MP3 extraction profile."
            : aac_output
                ? "The source attached picture is explicitly excluded from this raw AAC extraction profile."
            : ogg_audio_output
                ? "The source attached picture is explicitly excluded from this Ogg audio extraction profile."
            : matroska_output
                ? "The source attached picture is explicitly excluded from this Matroska stream-copy profile."
            : av1_webm_output
                ? "The source attached picture is explicitly excluded from this AV1 WebM profile."
                : "The source attached picture is explicitly excluded from "
                  "this MP4 remux profile.");
      } else if (elementary_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
        within_message(1,
                       "Audio cannot be represented in an elementary video stream and is explicitly excluded.");
      } else if (mpeg2_transport_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
        within_message(1,
                       "This MPEG-TS wrapping profile includes only the MPEG-2 video stream; source audio was explicitly excluded.");
      } else if (m4v_mp4_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
        within_message(1,
                       "This M4V wrapping profile includes only the MPEG-4 Part 2 video stream; source audio was explicitly excluded.");
      } else if (av1_webm_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
        within_message(1,
                       "Only Opus or Vorbis audio can be copied into this WebM profile; incompatible source audio was explicitly excluded.");
      } else if (av1_webm_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
        within_message(1,
                       "Only AV1 video can be copied by this WebM profile; an incompatible video stream was explicitly excluded.");
      } else if (profile == 2 &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
        within_message(
            1,
            "The source video stream is explicitly excluded from the "
            "audio-only M4A output.");
      } else if (mp3_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
        within_message(
            1,
            "The source video stream is explicitly excluded from the audio-only MP3 output.");
      } else if (mp3_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
        within_message(
            1,
            "Only the first compatible MP3 audio stream is extracted; an additional or incompatible audio stream was explicitly excluded.");
      } else if (aac_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
        within_message(
            1,
            "The source video stream is explicitly excluded from the audio-only raw AAC output.");
      } else if (aac_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
        within_message(
            1,
            "Only the first compatible AAC audio stream is extracted; an additional or incompatible audio stream was explicitly excluded.");
      } else if (ogg_audio_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
        within_message(
            1,
            "The source video stream is explicitly excluded from the audio-only Ogg output.");
      } else if (ogg_audio_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
        within_message(
            1,
            vorbis_output
                ? "Only the first compatible Vorbis audio stream is extracted; an additional or incompatible audio stream was explicitly excluded."
                : "Only the first compatible Opus audio stream is extracted; an additional or incompatible audio stream was explicitly excluded.");
      } else if (container_flv_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
        within_message(
            1,
            "Only the first H.264 video stream is copied into FLV; an additional video stream was explicitly excluded.");
      } else if (container_flv_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
        within_message(
            1,
            "Only the first AAC audio stream is copied into FLV; an additional audio stream was explicitly excluded.");
      } else if (input_stream->codecpar->codec_type == AVMEDIA_TYPE_SUBTITLE) {
        within_message(
            1,
            elementary_output
                ? "Subtitles cannot be represented in an elementary video stream and are explicitly excluded."
                : transport_output
                  ? "Subtitles are explicitly excluded from this MPEG-TS wrapping profile."
                : container_threegp_output
                  ? "Subtitles are explicitly excluded from this 3GP remux profile."
                : container_mov_output
                  ? "Subtitles are explicitly excluded from this MOV remux profile."
                : container_flv_output
                  ? "Subtitles are explicitly excluded from this FLV remux profile."
                : mp3_output
                  ? "The source subtitle stream is explicitly excluded from this MP3 extraction profile."
                : aac_output
                  ? "The source subtitle stream is explicitly excluded from this raw AAC extraction profile."
                : ogg_audio_output
                  ? "The source subtitle stream is explicitly excluded from this Ogg audio extraction profile."
                : "The source subtitle stream cannot be stream-copied by this "
                  "profile and is explicitly excluded.");
      } else if (input_stream->codecpar->codec_type ==
                 AVMEDIA_TYPE_ATTACHMENT) {
        within_message(1,
                       transport_output
                           ? "The source attachment is explicitly excluded from this MPEG-TS wrapping profile."
                       : container_threegp_output
                           ? "The source attachment is explicitly excluded from this 3GP remux profile."
                       : container_mov_output
                           ? "The source attachment is explicitly excluded from this MOV remux profile."
                       : container_flv_output
                           ? "The source attachment is explicitly excluded from this FLV remux profile."
                       : video_only_output
                           ? "The source attachment is explicitly excluded from this video-only output."
                       : av1_webm_output
                           ? "The source attachment is explicitly excluded from this AV1 WebM profile."
                       : mp3_output
                           ? "The source attachment is explicitly excluded from this MP3 extraction profile."
                       : aac_output
                           ? "The source attachment is explicitly excluded from this raw AAC extraction profile."
                       : ogg_audio_output
                           ? "The source attachment is explicitly excluded from this Ogg audio extraction profile."
                           : "The source attachment cannot be represented by this MP4 profile and is explicitly excluded.");
      } else if (video_only_output &&
                 input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
        within_message(1,
                       "Only the first non-attached video stream is copied; an additional video stream was explicitly excluded.");
      } else {
        within_message(
            1,
            elementary_output
                ? "A source stream type unsupported by elementary video output was explicitly excluded."
                : transport_output
                  ? "A source stream type unsupported by this MPEG-TS wrapping profile was explicitly excluded."
                : container_threegp_output
                  ? "A source stream type unsupported by this 3GP remux profile was explicitly excluded."
                : container_mov_output
                  ? "A source stream type unsupported by this MOV remux profile was explicitly excluded."
                : container_flv_output
                  ? "A source stream type unsupported by this FLV remux profile was explicitly excluded."
                : av1_webm_output
                  ? "A source stream type unsupported by this AV1 WebM profile was explicitly excluded."
                : mp3_output
                  ? "A source stream type unsupported by this MP3 extraction profile was explicitly excluded."
                : aac_output
                  ? "A source stream type unsupported by this raw AAC extraction profile was explicitly excluded."
                : ogg_audio_output
                  ? "A source stream type unsupported by this Ogg audio extraction profile was explicitly excluded."
                : matroska_output
                  ? "A source stream type unsupported by this Matroska profile was explicitly excluded."
                  : "A source stream type unsupported by MP4 was explicitly excluded.");
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
    if (input_format->iformat && input_format->iformat->name &&
        (strstr(input_format->iformat->name, "mpegts") ||
         strcmp(input_format->iformat->name, "aac") == 0) &&
        input_stream->codecpar->codec_id == AV_CODEC_ID_AAC) {
      const AVBitStreamFilter *filter =
          av_bsf_get_by_name("aac_adtstoasc");
      if (!filter) {
        within_message(2, "The AAC-to-ISO-BMFF compatibility filter is unavailable.");
        result = AVERROR_BSF_NOT_FOUND;
        goto cleanup;
      }
      result = av_bsf_alloc(filter, &stream_bsfs[index]);
      if (result < 0) {
        report_av_error("AAC compatibility filter allocation failed", result);
        goto cleanup;
      }
      result = avcodec_parameters_copy(stream_bsfs[index]->par_in,
                                       input_stream->codecpar);
      if (result < 0) {
        report_av_error("AAC compatibility filter setup failed", result);
        goto cleanup;
      }
      stream_bsfs[index]->time_base_in = input_stream->time_base;
      result = av_bsf_init(stream_bsfs[index]);
      if (result < 0) {
        report_av_error("AAC compatibility filter initialization failed", result);
        goto cleanup;
      }
      result = avcodec_parameters_copy(output_stream->codecpar,
                                       stream_bsfs[index]->par_out);
      if (result < 0) {
        report_av_error("Filtered AAC metadata copy failed", result);
        goto cleanup;
      }
    }
    if (matroska_output &&
        input_stream->codecpar->codec_id == AV_CODEC_ID_AAC) {
      result = ensure_matroska_aac_extradata(output_stream->codecpar);
      if (result < 0) {
        within_message(
            2,
            "Matroska AAC stream copy requires AAC-LC with a standard sample rate and one through seven channels.");
        goto cleanup;
      }
    }
    output_stream->codecpar->codec_tag = 0;
    output_stream->time_base = input_stream->time_base;
    output_stream->avg_frame_rate = input_stream->avg_frame_rate;
    output_stream->r_frame_rate = input_stream->r_frame_rate;
    output_stream->sample_aspect_ratio = input_stream->sample_aspect_ratio;
    av_dict_copy(&output_stream->metadata, input_stream->metadata, 0);
    output_stream->disposition = input_stream->disposition;
  }
  av_dict_copy(&output_format->metadata, input_format->metadata, 0);
  if (matroska_output) {
    result = copy_chapters(output_format, input_format);
    if (result < 0) {
      report_av_error("Matroska chapter copy failed", result);
      goto cleanup;
    }
  }

  const int mov_family_input =
      matroska_output && input_format->iformat && input_format->iformat->name &&
      strstr(input_format->iformat->name, "mov") != NULL;
  if (mov_family_input) {
    int aac_streams_remaining = 0;
    int *aac_stream_seen =
        av_calloc(input_format->nb_streams, sizeof(*aac_stream_seen));
    AVPacket *prefetch_packet = av_packet_alloc();
    if (!aac_stream_seen || !prefetch_packet) {
      av_free(aac_stream_seen);
      av_packet_free(&prefetch_packet);
      result = AVERROR(ENOMEM);
      goto cleanup;
    }
    for (unsigned int index = 0; index < input_format->nb_streams; index++) {
      if (stream_map[index] >= 0 &&
          input_format->streams[index]->codecpar->codec_type ==
              AVMEDIA_TYPE_AUDIO &&
          input_format->streams[index]->codecpar->codec_id == AV_CODEC_ID_AAC) {
        aac_streams_remaining += 1;
      }
    }
    int64_t prefetched_bytes = 0;
    while (aac_streams_remaining > 0 && prefetched_packet_count < 4096 &&
           prefetched_bytes <= 2 * 1024 * 1024) {
      result = av_read_frame(input_format, prefetch_packet);
      if (result < 0) {
        break;
      }
      const int input_index = prefetch_packet->stream_index;
      prefetched_bytes += prefetch_packet->size;
      if (input_index >= 0 &&
          input_index < (int)input_format->nb_streams &&
          stream_map[input_index] >= 0) {
        AVStream *input_stream = input_format->streams[input_index];
        if (!aac_stream_seen[input_index] &&
            input_stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO &&
            input_stream->codecpar->codec_id == AV_CODEC_ID_AAC) {
          size_t side_data_size = 0;
          const uint8_t *side_data = av_packet_get_side_data(
              prefetch_packet, AV_PKT_DATA_SKIP_SAMPLES, &side_data_size);
          if (side_data && side_data_size >= 10) {
            const uint32_t skip_samples =
                read_little_endian_uint32(side_data);
            if (skip_samples > 0 && skip_samples <= INT_MAX) {
              output_format->streams[stream_map[input_index]]
                  ->codecpar->initial_padding = (int)skip_samples;
            }
          }
          aac_stream_seen[input_index] = 1;
          aac_streams_remaining -= 1;
        }
        result = append_prefetched_packet(
            &prefetched_packets, &prefetched_packet_count,
            &prefetched_packet_capacity, prefetch_packet);
        if (result < 0) {
          break;
        }
      }
      av_packet_unref(prefetch_packet);
    }
    av_packet_free(&prefetch_packet);
    av_free(aac_stream_seen);
    if (result < 0 && result != AVERROR_EOF) {
      report_av_error("Matroska AAC priming inspection failed", result);
      goto cleanup;
    }
    if (aac_streams_remaining > 0) {
      within_message(
          2,
          "Matroska AAC priming metadata was not found within the bounded input inspection window.");
      result = AVERROR_INVALIDDATA;
      goto cleanup;
    }
    result = 0;
  }

  if (container_mpegts_output || container_mov_output) {
    int video_streams_remaining = 0;
    int *video_stream_done =
        av_calloc(input_format->nb_streams, sizeof(*video_stream_done));
    int *video_packets_seen =
        av_calloc(input_format->nb_streams, sizeof(*video_packets_seen));
    int64_t *prefetch_last_dts =
        av_malloc_array(input_format->nb_streams, sizeof(*prefetch_last_dts));
    AVPacket *prefetch_packet = av_packet_alloc();
    if (!video_stream_done || !video_packets_seen || !prefetch_last_dts ||
        !prefetch_packet) {
      av_free(video_stream_done);
      av_free(video_packets_seen);
      av_free(prefetch_last_dts);
      av_packet_free(&prefetch_packet);
      result = AVERROR(ENOMEM);
      goto cleanup;
    }
    for (unsigned int index = 0; index < input_format->nb_streams; index++) {
      prefetch_last_dts[index] = AV_NOPTS_VALUE;
      if (stream_map[index] >= 0 &&
          input_format->streams[index]->codecpar->codec_type ==
              AVMEDIA_TYPE_VIDEO) {
        video_streams_remaining += 1;
      }
    }
    int64_t prefetched_bytes = 0;
    while (video_streams_remaining > 0 && prefetched_packet_count < 4096 &&
           prefetched_bytes <= 2 * 1024 * 1024) {
      result = av_read_frame(input_format, prefetch_packet);
      if (result < 0) {
        break;
      }
      const int input_index = prefetch_packet->stream_index;
      prefetched_bytes += prefetch_packet->size;
      if (input_index >= 0 &&
          input_index < (int)input_format->nb_streams &&
          stream_map[input_index] >= 0) {
        AVStream *input_stream = input_format->streams[input_index];
        if (!video_stream_done[input_index] &&
            input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
          if (prefetch_packet->dts == AV_NOPTS_VALUE ||
              (prefetch_last_dts[input_index] != AV_NOPTS_VALUE &&
               prefetch_packet->dts <= prefetch_last_dts[input_index])) {
            AVRational frame_rate =
                av_guess_frame_rate(input_format, input_stream, NULL);
            if (frame_rate.num <= 0 || frame_rate.den <= 0) {
              within_message(
                  2,
                  container_mov_output
                      ? "MOV stream copy cannot reconstruct missing or non-monotonic decode timestamps without a verified video frame rate."
                      : "MPEG-TS stream copy cannot reconstruct missing or non-monotonic decode timestamps without a verified video frame rate.");
              result = AVERROR_INVALIDDATA;
              av_packet_unref(prefetch_packet);
              break;
            }
            synthesize_video_dts[input_index] = 1;
            video_stream_done[input_index] = 1;
            video_streams_remaining -= 1;
          } else {
            prefetch_last_dts[input_index] = prefetch_packet->dts;
            video_packets_seen[input_index] += 1;
            if (video_packets_seen[input_index] >= 4) {
              video_stream_done[input_index] = 1;
              video_streams_remaining -= 1;
            }
          }
        }
        int append_result = append_prefetched_packet(
            &prefetched_packets, &prefetched_packet_count,
            &prefetched_packet_capacity, prefetch_packet);
        if (append_result < 0) {
          result = append_result;
          break;
        }
      }
      av_packet_unref(prefetch_packet);
    }
    av_packet_free(&prefetch_packet);
    av_free(video_stream_done);
    av_free(video_packets_seen);
    av_free(prefetch_last_dts);
    if (result < 0 && result != AVERROR_EOF) {
      report_av_error(container_mov_output ? "MOV timestamp inspection failed"
                                           : "MPEG-TS timestamp inspection failed",
                      result);
      goto cleanup;
    }
    result = 0;
  }

  output_buffer = av_malloc(WITHIN_AVIO_OUTPUT_BUFFER_SIZE);
  if (!output_buffer) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  output_io = avio_alloc_context(output_buffer, WITHIN_AVIO_OUTPUT_BUFFER_SIZE, 1,
                                 &output, NULL, output_write, output_seek);
  if (!output_io) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  output_buffer = NULL;
  output_format->pb = output_io;
  output_format->flags |= AVFMT_FLAG_CUSTOM_IO | AVFMT_FLAG_AUTO_BSF;
  output_format->max_interleave_delta = 2 * AV_TIME_BASE;

  if (av1_webm_output || matroska_live_output) {
    /* Live Matroska/WebM omits the duration/cue index so muxer memory cannot grow with
       total file duration. Five-second/5 MiB clusters bound muxer buffering. AVI uses
       indexed Matroska because FFmpeg live mode writes an invalid duration for VFW. */
    av_dict_set(&muxer_options, "live", "1", 0);
    av_dict_set(&muxer_options, "cluster_time_limit", "5000", 0);
    av_dict_set(&muxer_options, "cluster_size_limit", "5242880", 0);
  } else if (matroska_output) {
    av_dict_set(&muxer_options, "cluster_time_limit", "5000", 0);
    av_dict_set(&muxer_options, "cluster_size_limit", "5242880", 0);
  } else if (aac_output) {
    av_dict_set(&muxer_options, "write_id3v2", "1", 0);
  } else if (elementary_output || transport_output || mp3_output ||
             ogg_audio_output || container_flv_output) {
    /* Elementary streams, MPEG-TS, Ogg, and FLV need no MOV options. */
  } else if (profile == 2) {
    av_dict_set(&muxer_options, "movflags",
                "empty_moov+default_base_moof", 0);
    av_dict_set(&muxer_options, "frag_duration", "5000000", 0);
  } else {
    av_dict_set(&muxer_options, "movflags",
                "frag_keyframe+empty_moov+default_base_moof", 0);
  }
  result = avformat_write_header(output_format, &muxer_options);
  if (result < 0) {
    char message[96] = {0};
    snprintf(message, sizeof(message), "%s header write failed", output_label);
    report_av_error(message, result);
    goto cleanup;
  }

  packet = av_packet_alloc();
  if (!packet) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }

  for (;;) {
    if (next_prefetched_packet < prefetched_packet_count) {
      av_packet_move_ref(packet,
                         prefetched_packets[next_prefetched_packet++]);
      result = 0;
    } else {
      result = av_read_frame(input_format, packet);
      if (result < 0) {
        break;
      }
    }
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
    AVRational packet_frame_rate = input_stream->avg_frame_rate;
    if (mpeg2_transport_output || container_mpegts_output ||
        container_mov_output ||
        m4v_mp4_output) {
      AVRational guessed_frame_rate =
          av_guess_frame_rate(input_format, input_stream, NULL);
      if (guessed_frame_rate.num > 0 && guessed_frame_rate.den > 0) {
        packet_frame_rate = guessed_frame_rate;
      }
    }
    int video_with_frame_rate =
        input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
        packet_frame_rate.num > 0 && packet_frame_rate.den > 0;
    if (video_with_frame_rate && packet_counts[input_index] == 0 &&
        packet->dts == AV_NOPTS_VALUE) {
      synthesize_video_dts[input_index] = 1;
    }
    if (video_with_frame_rate) {
      if (synthesize_video_dts[input_index]) {
        int reorder_delay = input_stream->codecpar->video_delay;
        if (reorder_delay < 1 &&
            input_stream->codecpar->codec_id == AV_CODEC_ID_HEVC) {
          reorder_delay = 2;
        }
        AVRational frame_duration = av_inv_q(packet_frame_rate);
        packet->dts = av_rescale_q(
            packet_counts[input_index] - reorder_delay, frame_duration,
            input_stream->time_base);
      }
      packet_counts[input_index] += 1;
    }
    if (packet->dts == AV_NOPTS_VALUE) {
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
    if (mpeg2_transport_output && packet->pts == AV_NOPTS_VALUE) {
      int saw_gop_start = 0;
      int temporal_reference =
          mpeg2_packet_temporal_reference(packet, &saw_gop_start);
      if (saw_gop_start) {
        mpeg2_pending_gop_start = 1;
      }
      if (temporal_reference >= 0) {
        if (mpeg2_pending_gop_start && mpeg2_seen_picture) {
          mpeg2_gop_display_base +=
              mpeg2_gop_max_temporal_reference + 1;
          mpeg2_gop_max_temporal_reference = -1;
        }
        mpeg2_pending_gop_start = 0;
        mpeg2_seen_picture = 1;
        if (temporal_reference > mpeg2_gop_max_temporal_reference) {
          mpeg2_gop_max_temporal_reference = temporal_reference;
        }
        packet->pts = av_rescale_q(
            mpeg2_gop_display_base + temporal_reference,
            av_inv_q(packet_frame_rate), input_stream->time_base);
      } else {
        packet->pts = packet->dts;
      }
    }
    last_dts[input_index] = packet->dts;
    int64_t media_time = packet_time_us(packet, input_stream);
    if (stream_bsfs[input_index]) {
      AVBSFContext *filter = stream_bsfs[input_index];
      result = av_bsf_send_packet(filter, packet);
      if (result < 0) {
        av_packet_unref(packet);
        report_av_error("AAC compatibility filtering failed", result);
        goto cleanup;
      }
      while ((result = av_bsf_receive_packet(filter, packet)) >= 0) {
        av_packet_rescale_ts(packet, filter->time_base_out,
                             output_stream->time_base);
        packet->stream_index = output_stream->index;
        packet->pos = -1;
        result = av_interleaved_write_frame(output_format, packet);
        av_packet_unref(packet);
        if (result < 0) {
          char message[96] = {0};
          snprintf(message, sizeof(message), "%s packet write failed",
                   output_label);
          report_av_error(message, result);
          goto cleanup;
        }
        output_packet_count += 1;
      }
      if (result != AVERROR(EAGAIN) && result != AVERROR_EOF) {
        report_av_error("AAC compatibility filter read failed", result);
        goto cleanup;
      }
      within_progress((double)input.position, (double)output.size,
                      (double)media_time, (double)input_format->duration,
                      (double)emscripten_get_heap_size());
      continue;
    }
    av_packet_rescale_ts(packet, input_stream->time_base,
                         output_stream->time_base);
    packet->stream_index = output_stream->index;
    packet->pos = -1;

    result = av_interleaved_write_frame(output_format, packet);
    av_packet_unref(packet);
    if (result < 0) {
      char message[96] = {0};
      snprintf(message, sizeof(message), "%s packet write failed",
               output_label);
      report_av_error(message, result);
      goto cleanup;
    }
    output_packet_count += 1;
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

  for (unsigned int index = 0; index < input_format->nb_streams; index++) {
    AVBSFContext *filter = stream_bsfs[index];
    if (!filter || stream_map[index] < 0) continue;
    result = av_bsf_send_packet(filter, NULL);
    if (result < 0 && result != AVERROR_EOF) {
      report_av_error("AAC compatibility filter flush failed", result);
      goto cleanup;
    }
    AVStream *output_stream = output_format->streams[stream_map[index]];
    while ((result = av_bsf_receive_packet(filter, packet)) >= 0) {
      av_packet_rescale_ts(packet, filter->time_base_out,
                           output_stream->time_base);
      packet->stream_index = output_stream->index;
      packet->pos = -1;
      result = av_interleaved_write_frame(output_format, packet);
      av_packet_unref(packet);
      if (result < 0) {
        char message[96] = {0};
        snprintf(message, sizeof(message), "%s packet write failed",
                 output_label);
        report_av_error(message, result);
        goto cleanup;
      }
      output_packet_count += 1;
    }
    if (result != AVERROR(EAGAIN) && result != AVERROR_EOF) {
      report_av_error("AAC compatibility filter drain failed", result);
      goto cleanup;
    }
  }
  result = 0;
  if (output_packet_count == 0) {
    char message[256] = {0};
    snprintf(message, sizeof(message),
             "No media packets were produced after reading %lld of %lld source bytes.",
             (long long)input.position, (long long)input.size);
    within_message(2, message);
    result = AVERROR_INVALIDDATA;
    goto cleanup;
  }

  result = av_write_trailer(output_format);
  if (result < 0) {
    char message[96] = {0};
    snprintf(message, sizeof(message), "%s trailer write failed", output_label);
    report_av_error(message, result);
    goto cleanup;
  }
  avio_flush(output_io);
  if (output.size == 0) {
    char message[320] = {0};
    snprintf(message, sizeof(message),
             "%s muxing produced no bytes from %lld packets after reading %lld of %lld source bytes.",
             output_label,
             (long long)output_packet_count, (long long)input.position,
             (long long)input.size);
    within_message(2, message);
    result = AVERROR_INVALIDDATA;
    goto cleanup;
  }
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
  for (int index = 0; index < prefetched_packet_count; index++) {
    av_packet_free(&prefetched_packets[index]);
  }
  av_free(prefetched_packets);
  av_free(stream_map);
  av_free(synthesize_video_dts);
  if (stream_bsfs && input_format) {
    for (unsigned int index = 0; index < input_format->nb_streams; index++) {
      av_bsf_free(&stream_bsfs[index]);
    }
  }
  av_free(stream_bsfs);
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

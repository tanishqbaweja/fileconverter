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
#include <libavutil/audio_fifo.h>
#include <libavutil/dict.h>
#include <libavutil/error.h>
#include <libavutil/mathematics.h>
#include <libavutil/opt.h>
#include <libswresample/swresample.h>
#include <libswscale/swscale.h>

#define WITHIN_AVIO_BUFFER_SIZE (256 * 1024)
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

static int stream_codec_is_copy_compatible(const AVStream *stream,
                                           int profile) {
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
  const int frame_size = pipeline->encoder->frame_size;
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
      return result;
    }
    result = av_frame_get_buffer(output, 0);
    if (result < 0) {
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
    if (current < 0 ||
        samples > WITHIN_AUDIO_FIFO_MAX_SAMPLES - current) {
      return AVERROR(ENOMEM);
    }
    if (av_audio_fifo_realloc(pipeline->fifo, current + samples) < 0) {
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
    return result;
  }
  result = av_frame_get_buffer(output, 0);
  if (result < 0) {
    return result;
  }
  result = swr_convert(pipeline->resampler, output->data, output_capacity,
                       (const uint8_t **)input->extended_data,
                       input->nb_samples);
  if (result < 0) {
    return result;
  }
  return submit_converted_audio(pipeline, output, result);
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
      flac_output ? AV_CODEC_ID_FLAC : AV_CODEC_ID_PCM_S16LE);
  if (!encoder_codec) {
    result = AVERROR_ENCODER_NOT_FOUND;
    goto cleanup;
  }
  encoder = avcodec_alloc_context3(encoder_codec);
  if (!encoder) {
    result = AVERROR(ENOMEM);
    goto cleanup;
  }
  encoder->sample_rate = decoder->sample_rate;
  encoder->sample_fmt = AV_SAMPLE_FMT_S16;
  encoder->time_base = (AVRational){1, encoder->sample_rate};
  result =
      av_channel_layout_copy(&encoder->ch_layout, &decoder->ch_layout);
  if (result < 0) {
    goto cleanup;
  }
  result = avcodec_open2(encoder, encoder_codec, NULL);
  if (result < 0) {
    report_av_error("Audio encoder initialization failed", result);
    goto cleanup;
  }
  if (encoder->frame_size < 0 || encoder->frame_size > 8192) {
    within_message(2, "The audio encoder frame size exceeds the bounded FIFO limit.");
    result = AVERROR_INVALIDDATA;
    goto cleanup;
  }

  result =
      avformat_alloc_output_context2(
          &output_format, NULL, flac_output ? "flac" : "wav", NULL);
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
  output_format->flags |= AVFMT_FLAG_CUSTOM_IO;
  result = avformat_write_header(output_format, NULL);
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
  if (encoder->frame_size > 0) {
    fifo = av_audio_fifo_alloc(encoder->sample_fmt,
                               encoder->ch_layout.nb_channels,
                               encoder->frame_size * 2);
    if (!fifo) {
      result = AVERROR(ENOMEM);
      goto cleanup;
    }
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

static int within_video_reencode(int webm) {
  int result = 0;
  int video_stream_index = -1;
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
  result = avformat_open_input(&input_format, NULL, NULL, NULL);
  if (result < 0) {
    report_av_error("Input probing failed", result);
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
          "The source audio stream is explicitly excluded from this "
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
  decoder->thread_count = webm ? WITHIN_VIDEO_THREADS : 1;
  if (webm && WITHIN_VIDEO_THREADS > 1) {
    decoder->thread_type = FF_THREAD_FRAME | FF_THREAD_SLICE;
  }
  result = avcodec_open2(decoder, decoder_codec, NULL);
  if (result < 0) {
    report_av_error("Video decoder initialization failed", result);
    goto cleanup;
  }

  AVRational frame_rate = input_stream->avg_frame_rate;
  if (frame_rate.num <= 0 || frame_rate.den <= 0) {
    frame_rate = (AVRational){24, 1};
  }
  const AVCodec *encoder_codec =
      avcodec_find_encoder(webm ? AV_CODEC_ID_VP8 : AV_CODEC_ID_MPEG4);
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
  encoder->thread_count = webm ? WITHIN_VIDEO_THREADS : 1;
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
    av_dict_set_int(&encoder_options, "slices", WITHIN_VIDEO_THREADS, 0);
    av_dict_set(&encoder_options, "lag-in-frames", "0", 0);
    av_dict_set(&encoder_options, "auto-alt-ref", "0", 0);
  }
  result = avcodec_open2(encoder, encoder_codec, &encoder_options);
  if (result < 0) {
    report_av_error(
        webm ? "VP8 encoder initialization failed"
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
            webm ? "Video decode or VP8 encode failed"
                 : "Video decode or MPEG-4 encode failed",
            result);
        goto cleanup;
      }
      within_progress((double)input.position, (double)output.size,
                      (double)media_time, (double)input_format->duration,
                      (double)emscripten_get_heap_size());
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
  return within_video_reencode(0);
}

static int within_video_to_webm(void) {
  return within_video_reencode(1);
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

  if (profile == 3 || profile == 6) {
    return within_audio_transcode(profile);
  }
  if (profile == 4) {
    return within_video_to_mpeg4();
  }
  if (profile == 5) {
    return within_video_to_webm();
  }
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
  if (input_format->nb_chapters > 0) {
    within_message(
        1,
        profile == 2
            ? "Source chapters are explicitly excluded from the audio-only M4A output."
            : "Source chapters are explicitly excluded from this MP4 remux profile.");
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
    if (!(input_stream->disposition & AV_DISPOSITION_ATTACHED_PIC) &&
        ((profile == 2 &&
          input_stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) ||
         (profile != 2 &&
          (input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO ||
           input_stream->codecpar->codec_type == AVMEDIA_TYPE_AUDIO))) &&
        !stream_codec_is_copy_compatible(input_stream, profile)) {
      if (input_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
        within_message(
            2,
            "MKV-to-MP4 lossless stream copy accepts H.264 or HEVC video. "
            "This source video codec needs a bounded re-encoding route that "
            "is not installed.");
      } else if (profile == 2) {
        within_message(
            2,
            "MKV-to-M4A lossless stream copy accepts AAC audio. This source "
            "audio codec needs a bounded re-encoding route that is not "
            "installed.");
      } else {
        within_message(
            2,
            "MKV-to-MP4 lossless stream copy accepts AAC audio. This source "
            "audio codec needs a bounded re-encoding route that is not "
            "installed.");
      }
      result = AVERROR(ENOSYS);
      goto cleanup;
    }
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

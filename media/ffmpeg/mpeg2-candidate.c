/* Private feasibility kernel, not a published conversion profile. The audited
 * AVIO bridge is prepended by make-h264-candidate.mjs. No filesystem or native
 * helper is used during conversion. */
#define MPEG2_MAX_STREAMS 32
#define MPEG2_MAX_CHAPTERS 1024
#define MPEG2_MAX_ATTACHMENT_BYTES (8 * 1024 * 1024)

typedef struct MPEG2Pipeline {
  AVCodecContext *decoder, *encoder;
  AVFormatContext *output;
  AVStream *source, *destination;
  AVFrame *decoded, *converted;
  AVPacket *encoded;
  struct SwsContext *scaler;
  int source_width, source_height;
  AVRational source_rate;
  int64_t first_source_pts, previous_source_pts;
  int64_t decoded_count, encoded_count, rate_accumulator, rate_step, rate_threshold;
  int format_warning;
  int64_t last_pts;
} MPEG2Pipeline;

static int mpeg2_packets(MPEG2Pipeline *p, AVFrame *frame) {
  int result = avcodec_send_frame(p->encoder, frame);
  if (result < 0) return result;
  while ((result = avcodec_receive_packet(p->encoder, p->encoded)) >= 0) {
    av_packet_rescale_ts(p->encoded, p->encoder->time_base,
                         p->destination->time_base);
    // Encoder timestamps start at zero; restore the source start offset only
    // after packet rescaling, so its sub-frame precision is not lost.
    int64_t offset = av_rescale_q(p->first_source_pts, p->source->time_base,
                                 p->destination->time_base);
    if (p->encoded->pts != AV_NOPTS_VALUE) p->encoded->pts += offset;
    if (p->encoded->dts != AV_NOPTS_VALUE) p->encoded->dts += offset;
    p->encoded->stream_index = p->destination->index;
    result = av_interleaved_write_frame(p->output, p->encoded);
    av_packet_unref(p->encoded);
    if (result < 0) return result;
    if (p->output->pb->error < 0) return p->output->pb->error;
  }
  return result == AVERROR(EAGAIN) || result == AVERROR_EOF ? 0 : result;
}

static int mpeg2_frames(MPEG2Pipeline *p, const AVPacket *packet) {
  int result = avcodec_send_packet(p->decoder, packet);
  if (result < 0) return result;
  while ((result = avcodec_receive_frame(p->decoder, p->decoded)) >= 0) {
    if (within_is_cancelled()) return AVERROR_EXIT;
    AVFrame *frame = p->decoded;
    // Fail on dynamic dimensions, not an out-of-bounds scaler or hidden resize.
    // Decoder context dimensions can change after new stream headers. Compare
    // against the immutable initial dimensions before any scaling/encoding.
    if (frame->width != p->source_width || frame->height != p->source_height) {
      within_message(2, "MPEG-2 source dimensions changed; refusing undisclosed resizing.");
      return AVERROR_INVALIDDATA;
    }
    int64_t pts = frame->best_effort_timestamp;
    if (pts == AV_NOPTS_VALUE) {
      within_message(2, "MPEG-2 source frame timestamps are unavailable; refusing invented timing.");
      return AVERROR_INVALIDDATA;
    }
    if (p->previous_source_pts != AV_NOPTS_VALUE && pts <= p->previous_source_pts) {
      within_message(2, "MPEG-2 source timestamps are not strictly increasing.");
      return AVERROR_INVALIDDATA;
    }
    p->previous_source_pts = pts;
    if (p->first_source_pts == AV_NOPTS_VALUE) p->first_source_pts = pts;
    // This candidate handles CFR explicitly; do not silently flatten VFR.
    // One source time-base tick allows container timestamp quantization.
    int64_t actual_us = av_rescale_q(pts - p->first_source_pts,
                                    p->source->time_base, AV_TIME_BASE_Q);
    int64_t expected_us = av_rescale_q(p->decoded_count, av_inv_q(p->source_rate),
                                      AV_TIME_BASE_Q);
    int64_t tolerance_us = av_rescale_q(1, p->source->time_base, AV_TIME_BASE_Q) + 2;
    if (llabs(actual_us - expected_us) > tolerance_us) {
      within_message(2, "MPEG-2 candidate requires constant frame rate; variable timing is not silently flattened.");
      return AVERROR_INVALIDDATA;
    }
    if (frame->color_range == AVCOL_RANGE_JPEG) {
      within_message(2, "MPEG-2 candidate has no audited full-to-limited range conversion; full-range video is refused.");
      return AVERROR(ENOSYS);
    }
    if (p->decoded_count++ > 0 && p->rate_step < p->rate_threshold) {
      p->rate_accumulator += p->rate_step;
      if (p->rate_accumulator < p->rate_threshold) {
        av_frame_unref(frame);
        continue;
      }
      p->rate_accumulator -= p->rate_threshold;
    }
    pts = p->encoded_count++;
    if (!p->format_warning && frame->format != p->encoder->pix_fmt) {
      within_message(1, "MPEG-2 pixel-format conversion is lossy where source bit depth or chroma exceeds the selected 8-bit encoder format.");
      p->format_warning = 1;
    }
    if (frame->format != p->encoder->pix_fmt ||
        frame->width != p->encoder->width || frame->height != p->encoder->height) {
      if (!p->converted) {
        p->converted = av_frame_alloc();
        if (!p->converted) return AVERROR(ENOMEM);
        p->converted->format = p->encoder->pix_fmt;
        p->converted->width = p->encoder->width;
        p->converted->height = p->encoder->height;
        result = av_frame_get_buffer(p->converted, 32);
        if (result < 0) return result;
      }
      p->scaler = sws_getCachedContext(p->scaler, frame->width, frame->height,
          frame->format, p->encoder->width, p->encoder->height,
          p->encoder->pix_fmt, SWS_BILINEAR, NULL, NULL, NULL);
      if (!p->scaler) return AVERROR(ENOMEM);
      result = av_frame_make_writable(p->converted);
      if (result < 0) return result;
      result = sws_scale(p->scaler, (const uint8_t *const *)frame->data,
          frame->linesize, 0, frame->height, p->converted->data,
          p->converted->linesize);
      if (result != p->encoder->height) return AVERROR_EXTERNAL;
      result = av_frame_copy_props(p->converted, frame);
      if (result < 0) return result;
      frame = p->converted;
    }
    frame->pts = pts;
    frame->duration = 1;
    p->last_pts = pts;
    result = mpeg2_packets(p, frame);
    av_frame_unref(p->decoded);
    if (result < 0) return result;
  }
  return result == AVERROR(EAGAIN) || result == AVERROR_EOF ? 0 : result;
}

static int mpeg2_chapters(AVFormatContext *out, const AVFormatContext *in) {
  if (!in->nb_chapters) return 0;
  out->chapters = av_calloc(in->nb_chapters, sizeof(*out->chapters));
  if (!out->chapters) return AVERROR(ENOMEM);
  for (unsigned i = 0; i < in->nb_chapters; i++) {
    AVChapter *chapter = av_mallocz(sizeof(*chapter));
    if (!chapter) return AVERROR(ENOMEM);
    const AVChapter *source = in->chapters[i];
    chapter->id = source->id;
    chapter->time_base = source->time_base;
    chapter->start = source->start;
    chapter->end = source->end;
    out->chapters[out->nb_chapters++] = chapter;
    int result = av_dict_copy(&chapter->metadata, source->metadata, 0);
    if (result < 0) return result;
  }
  return 0;
}

static int mpeg2_run(int matroska, int max_width, int bit_rate, int fps, int quality) {
  int result = 0, video = -1;
  int map[MPEG2_MAX_STREAMS];
  AVFormatContext *in = NULL, *out = NULL;
  AVIOContext *input_io = NULL, *output_io = NULL;
  uint8_t *input_buffer = NULL, *output_buffer = NULL;
  AVPacket *packet = NULL;
  AVDictionary *options = NULL, *mux_options = NULL;
  MPEG2Pipeline p = {.last_pts = AV_NOPTS_VALUE, .first_source_pts = AV_NOPTS_VALUE,
                       .previous_source_pts = AV_NOPTS_VALUE};
  WithinInput input = {.size = (int64_t)within_input_size()};
  WithinOutput output = {0};
  if (input.size <= 0 ||
      (max_width != 0 && max_width != 320 && max_width != 480 && max_width != 640) ||
      (bit_rate != 0 && bit_rate != 300000 && bit_rate != 600000 &&
       bit_rate != 1000000 && bit_rate != 2000000 && bit_rate != 4000000) ||
      (fps != 0 && fps != 15 && fps != 24 && fps != 25 && fps != 30) ||
      quality < 0 || quality > 3) return AVERROR(EINVAL);
  for (unsigned i = 0; i < MPEG2_MAX_STREAMS; i++) map[i] = -1;
  input_buffer = av_malloc(WITHIN_AVIO_BUFFER_SIZE);
  if (!input_buffer) { result = AVERROR(ENOMEM); goto cleanup; }
  input_io = avio_alloc_context(input_buffer, WITHIN_AVIO_BUFFER_SIZE, 0,
                                &input, input_read, NULL, input_seek);
  if (!input_io) { result = AVERROR(ENOMEM); goto cleanup; }
  input_buffer = NULL;
  in = avformat_alloc_context();
  if (!in) { result = AVERROR(ENOMEM); goto cleanup; }
  in->pb = input_io;
  in->flags |= AVFMT_FLAG_CUSTOM_IO;
  in->probesize = 2 * 1024 * 1024;
  in->max_analyze_duration = 2 * AV_TIME_BASE;
  in->max_streams = MPEG2_MAX_STREAMS;
  // Bound generic demux seek-index retention, not packet/frame fidelity.
  // Matroska honors this via ff_reduce_index before adding keyframe entries.
  // Mandatory full-index demuxers may ignore it and still need separate gates.
  in->max_index_size = 32 * 1024;
  result = avformat_open_input(&in, NULL, NULL, NULL);
  if (result < 0) goto cleanup;
  result = avformat_find_stream_info(in, NULL);
  if (result < 0) goto cleanup;
  if (in->nb_streams > MPEG2_MAX_STREAMS || in->nb_chapters > MPEG2_MAX_CHAPTERS) {
    result = AVERROR(EFBIG); goto cleanup;
  }
  for (unsigned i = 0; i < in->nb_streams; i++) {
    AVStream *s = in->streams[i];
    if (s->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
        !(s->disposition & AV_DISPOSITION_ATTACHED_PIC)) { video = i; break; }
  }
  if (video < 0) { result = AVERROR_STREAM_NOT_FOUND; goto cleanup; }
  p.source = in->streams[video];
  const AVCodec *decoder = avcodec_find_decoder(p.source->codecpar->codec_id);
  const AVCodec *encoder = avcodec_find_encoder_by_name("mpeg2video");
  if (!decoder || !encoder) { result = AVERROR(ENOSYS); goto cleanup; }
  p.decoder = avcodec_alloc_context3(decoder);
  p.encoder = avcodec_alloc_context3(encoder);
  if (!p.decoder || !p.encoder) { result = AVERROR(ENOMEM); goto cleanup; }
  result = avcodec_parameters_to_context(p.decoder, p.source->codecpar);
  if (result < 0) goto cleanup;
  // Fixed budget; this is a feasibility guard, not a certified 4K profile.
  if (p.decoder->width < 2 || p.decoder->height < 2 ||
      p.decoder->width > 4096 || p.decoder->height > 2160) {
    result = AVERROR(EFBIG); goto cleanup;
  }
  p.decoder->thread_count = 1;
  p.decoder->pkt_timebase = p.source->time_base;
  result = avcodec_open2(p.decoder, decoder, NULL);
  if (result < 0) goto cleanup;
  p.source_width = p.decoder->width;
  p.source_height = p.decoder->height;
  p.encoder->width = p.decoder->width;
  p.encoder->height = p.decoder->height;
  if (max_width && max_width < p.encoder->width) {
    p.encoder->width = max_width;
    p.encoder->height = (int)((int64_t)p.decoder->height * max_width /
                             p.decoder->width) & ~1;
  }
  if ((p.encoder->width & 1) || (p.encoder->height & 1) || p.encoder->height < 2) {
    within_message(2, "OpenMPEG2 requires even output dimensions; refusing undisclosed cropping.");
    result = AVERROR(EINVAL); goto cleanup;
  }
  p.encoder->pix_fmt = p.decoder->pix_fmt == AV_PIX_FMT_YUV422P ?
                        AV_PIX_FMT_YUV422P : AV_PIX_FMT_YUV420P;
  if (p.source->time_base.num <= 0 || p.source->time_base.den <= 0) {
    result = AVERROR_INVALIDDATA; goto cleanup;
  }
  p.source_rate = av_guess_frame_rate(in, p.source, NULL);
  p.encoder->framerate = p.source_rate;
  if (p.encoder->framerate.num <= 0 || p.encoder->framerate.den <= 0) {
    result = AVERROR_INVALIDDATA; goto cleanup;
  }
  if (fps && av_cmp_q((AVRational){fps, 1}, p.encoder->framerate) < 0)
    p.encoder->framerate = (AVRational){fps, 1};
  // FFmpeg MPEG-2 derives the sequence frame rate from the inverse time base.
  // Unsupported rates fail normal standards compliance, never experimental mode.
  p.encoder->time_base = av_inv_q(p.encoder->framerate);
  p.encoder->strict_std_compliance = FF_COMPLIANCE_NORMAL;
  p.rate_step = (int64_t)p.encoder->framerate.num * p.source_rate.den;
  p.rate_threshold = (int64_t)p.source_rate.num * p.encoder->framerate.den;
  p.encoder->bit_rate = bit_rate ? bit_rate : 2000000;
  p.encoder->gop_size = 48;
  p.encoder->max_b_frames = 0;
  p.encoder->thread_count = 1;
  p.encoder->slices = 1;
  p.encoder->qmin = quality == 1 ? 8 : quality == 3 ? 2 : 4;
  p.encoder->qmax = quality == 1 ? 31 : quality == 3 ? 12 : 20;
  p.encoder->flags |= AV_CODEC_FLAG_GLOBAL_HEADER | AV_CODEC_FLAG_BITEXACT;
  p.encoder->sample_aspect_ratio = p.decoder->sample_aspect_ratio;
  if (p.encoder->sample_aspect_ratio.num > 0 &&
      p.encoder->sample_aspect_ratio.den > 0) {
    // Preserve display aspect ratio exactly even when a requested size cap
    // rounds the output height to an even number of chroma rows.
    p.encoder->sample_aspect_ratio = av_mul_q(p.encoder->sample_aspect_ratio,
        av_div_q((AVRational){p.source_width, p.source_height},
                 (AVRational){p.encoder->width, p.encoder->height}));
  }
  p.encoder->color_primaries = p.decoder->color_primaries;
  p.encoder->color_trc = p.decoder->color_trc;
  p.encoder->colorspace = p.decoder->colorspace;
  p.encoder->color_range = p.decoder->color_range;
  p.encoder->chroma_sample_location = p.decoder->chroma_sample_location;
  result = avcodec_open2(p.encoder, encoder, &options);
  if (result < 0) goto cleanup;
  if (av_dict_count(options)) { result = AVERROR_OPTION_NOT_FOUND; goto cleanup; }
  result = avformat_alloc_output_context2(&out, NULL, matroska ? "matroska" : "mp4", NULL);
  if (result < 0 || !out) { result = AVERROR(EINVAL); goto cleanup; }
  p.output = out;
  out->flags |= AVFMT_FLAG_BITEXACT | AVFMT_FLAG_CUSTOM_IO | AVFMT_FLAG_AUTO_BSF;
  // Preserve the input timeline. MP4 edit lists below represent AAC preroll;
  // automatic negative-timestamp shifting otherwise changes video timing.
  out->avoid_negative_ts = AVFMT_AVOID_NEG_TS_DISABLED;
  out->max_interleave_delta = AV_TIME_BASE;
  unsigned attachment_bytes = 0;
  for (unsigned i = 0; i < in->nb_streams; i++) {
    AVStream *source = in->streams[i];
    AVCodecParameters *parameters = source->codecpar;
    if ((int)i != video && !(matroska && parameters->codec_type == AVMEDIA_TYPE_ATTACHMENT) &&
        avformat_query_codec(out->oformat, parameters->codec_id, FF_COMPLIANCE_NORMAL) <= 0) {
      char warning[160];
      snprintf(warning, sizeof(warning), "Source stream %u (%s) cannot be represented in %s and is explicitly excluded.",
          i, avcodec_get_name(parameters->codec_id), matroska ? "Matroska" : "MP4");
      within_message(1, warning);
      continue;
    }
    if (parameters->codec_type == AVMEDIA_TYPE_ATTACHMENT ||
        (source->disposition & AV_DISPOSITION_ATTACHED_PIC)) {
      unsigned bytes = parameters->codec_type == AVMEDIA_TYPE_ATTACHMENT ?
                       parameters->extradata_size : source->attached_pic.size;
      if (bytes > MPEG2_MAX_ATTACHMENT_BYTES - attachment_bytes) {
        within_message(2, "Source attachments exceed the bounded 8 MiB aggregate allowance.");
        result = AVERROR(EFBIG); goto cleanup;
      }
      attachment_bytes += bytes;
    }
    AVStream *destination = avformat_new_stream(out, NULL);
    if (!destination) { result = AVERROR(ENOMEM); goto cleanup; }
    map[i] = destination->index;
    result = avcodec_parameters_copy(destination->codecpar, parameters);
    if (result < 0) goto cleanup;
    if ((int)i == video) {
      // Preserve display matrices and other stream-side data from the source.
      result = avcodec_parameters_from_context(destination->codecpar, p.encoder);
      if (result < 0) goto cleanup;
      for (int j = 0; j < parameters->nb_coded_side_data; j++) {
        const AVPacketSideData *source_data = &parameters->coded_side_data[j];
        if (source_data->type == AV_PKT_DATA_CPB_PROPERTIES ||
            source_data->type == AV_PKT_DATA_NEW_EXTRADATA) continue;
        AVPacketSideData *destination_data = av_packet_side_data_new(
            &destination->codecpar->coded_side_data,
            &destination->codecpar->nb_coded_side_data,
            source_data->type, source_data->size, 0);
        if (!destination_data) { result = AVERROR(ENOMEM); goto cleanup; }
        memcpy(destination_data->data, source_data->data, source_data->size);
      }
      p.destination = destination;
    }
    destination->codecpar->codec_tag = 0;
    destination->time_base = source->time_base;
    destination->avg_frame_rate = (int)i == video ? p.encoder->framerate : source->avg_frame_rate;
    destination->r_frame_rate = (int)i == video ? p.encoder->framerate : source->r_frame_rate;
    destination->sample_aspect_ratio = (int)i == video ?
        p.encoder->sample_aspect_ratio : source->sample_aspect_ratio;
    destination->disposition = source->disposition;
    result = av_dict_copy(&destination->metadata, source->metadata, 0);
    if (result < 0) goto cleanup;
    if (source->disposition & AV_DISPOSITION_ATTACHED_PIC) {
      result = av_packet_ref(&destination->attached_pic, &source->attached_pic);
      if (result < 0) goto cleanup;
    }
  }
  result = av_dict_copy(&out->metadata, in->metadata, 0);
  if (result < 0) goto cleanup;
  result = mpeg2_chapters(out, in);
  if (result < 0) goto cleanup;
  output_buffer = av_malloc(WITHIN_AVIO_OUTPUT_BUFFER_SIZE);
  if (!output_buffer) { result = AVERROR(ENOMEM); goto cleanup; }
  output_io = avio_alloc_context(output_buffer, WITHIN_AVIO_OUTPUT_BUFFER_SIZE, 1,
                                 &output, NULL, output_write, output_seek);
  if (!output_io) { result = AVERROR(ENOMEM); goto cleanup; }
  output_buffer = NULL;
  out->pb = output_io;
  if (!matroska) {
    av_dict_set(&mux_options, "movflags", "frag_keyframe+delay_moov+default_base_moof+skip_trailer+use_metadata_tags", 0);
    av_dict_set(&mux_options, "use_editlist", "1", 0);
    av_dict_set(&mux_options, "frag_duration", "1000000", 0);
    av_dict_set(&mux_options, "frag_size", "1048576", 0);
  } else {
    av_dict_set(&mux_options, "cluster_time_limit", "1000", 0);
    av_dict_set(&mux_options, "cluster_size_limit", "1048576", 0);
    // Normal seekable finalization writes actual packet-derived duration.
    // Disable only the unbounded per-keyframe cue index, not finalization.
    av_dict_set(&mux_options, "bounded_no_cues", "1", 0);
  }
  result = avformat_write_header(out, &mux_options);
  if (result < 0) goto cleanup;
  if (av_dict_count(mux_options)) { result = AVERROR_OPTION_NOT_FOUND; goto cleanup; }
  packet = av_packet_alloc();
  p.encoded = av_packet_alloc();
  p.decoded = av_frame_alloc();
  if (!packet || !p.encoded || !p.decoded) { result = AVERROR(ENOMEM); goto cleanup; }
  while ((result = av_read_frame(in, packet)) >= 0) {
    if (within_is_cancelled()) { result = AVERROR_EXIT; goto cleanup; }
    unsigned index = packet->stream_index;
    if (index >= in->nb_streams) { result = AVERROR_INVALIDDATA; goto cleanup; }
    if ((int)index == video) {
      result = mpeg2_frames(&p, packet);
    } else if (map[index] >= 0) {
      av_packet_rescale_ts(packet, in->streams[index]->time_base, out->streams[map[index]]->time_base);
      packet->stream_index = map[index];
      result = av_interleaved_write_frame(out, packet);
    }
    av_packet_unref(packet);
    if (result < 0) goto cleanup;
    if (output_io->error < 0) { result = output_io->error; goto cleanup; }
    within_progress((double)input.position, (double)output.size,
        p.last_pts == AV_NOPTS_VALUE ? 0 : (double)av_rescale_q(p.last_pts, p.encoder->time_base, AV_TIME_BASE_Q),
        (double)in->duration, (double)emscripten_get_heap_size());
  }
  if (result != AVERROR_EOF) goto cleanup;
  result = mpeg2_frames(&p, NULL);
  if (result < 0) goto cleanup;
  result = mpeg2_packets(&p, NULL);
  if (result < 0) goto cleanup;
  result = av_write_trailer(out);
  if (result < 0) goto cleanup;
  avio_flush(output_io);
  if (output_io->error < 0) { result = output_io->error; goto cleanup; }
  result = within_has_sync_output() ? within_output_truncate_sync((double)output.size) : within_output_truncate((double)output.size);
  if (result < 0) goto cleanup;
  result = within_has_sync_output() ? within_output_flush_sync() : within_output_flush();
cleanup:
  if (result < 0) report_av_error("MPEG-2 candidate failed", result);
  av_dict_free(&options);
  av_dict_free(&mux_options);
  av_packet_free(&packet);
  av_packet_free(&p.encoded);
  av_frame_free(&p.decoded);
  av_frame_free(&p.converted);
  sws_freeContext(p.scaler);
  avcodec_free_context(&p.decoder);
  avcodec_free_context(&p.encoder);
  if (out) { out->pb = NULL; avformat_free_context(out); }
  if (in) { in->pb = NULL; avformat_close_input(&in); }
  if (output_io) { av_freep(&output_io->buffer); avio_context_free(&output_io); }
  else av_freep(&output_buffer);
  if (input_io) { av_freep(&input_io->buffer); avio_context_free(&input_io); }
  else av_freep(&input_buffer);
  return result < 0 ? result : 0;
}

// Same production bridge ABI; a test-only module substitution selects this
// private kernel. Profile numbers are adapter sentinels, NOT public MPEG-2 claims.
EMSCRIPTEN_KEEPALIVE
int within_remux(int profile, int audio_bit_rate, int audio_sample_rate,
                 int audio_channels, int audio_codec, int audio_compression,
                 int audio_quality, int video_codec, int max_width,
                 int bit_rate, int fps, int quality) {
  if ((profile != 6 && profile != 23) || audio_bit_rate || audio_sample_rate ||
      audio_channels || audio_codec || audio_compression || audio_quality || video_codec)
    return AVERROR(EINVAL);
  return mpeg2_run(profile == 23, max_width, bit_rate, fps, quality);
}

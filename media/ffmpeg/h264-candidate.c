/* Private feasibility kernel, not a published conversion profile. The audited
 * AVIO bridge is prepended by make-h264-candidate.mjs. No filesystem or native
 * helper is used during conversion. */
#define H264_MAX_STREAMS 32
#define H264_MAX_CHAPTERS 1024
#define H264_MAX_ATTACHMENT_BYTES (8 * 1024 * 1024)

typedef struct H264Pipeline {
  AVCodecContext *decoder, *encoder;
  AVFormatContext *output;
  AVStream *source, *destination;
  AVFrame *decoded, *converted;
  AVPacket *encoded;
  struct SwsContext *scaler;
  int fps_cap;
  int64_t last_pts;
} H264Pipeline;

static int h264_packets(H264Pipeline *p, AVFrame *frame) {
  int result = avcodec_send_frame(p->encoder, frame);
  if (result < 0) return result;
  while ((result = avcodec_receive_packet(p->encoder, p->encoded)) >= 0) {
    av_packet_rescale_ts(p->encoded, p->encoder->time_base,
                         p->destination->time_base);
    p->encoded->stream_index = p->destination->index;
    result = av_interleaved_write_frame(p->output, p->encoded);
    av_packet_unref(p->encoded);
    if (result < 0) return result;
    if (p->output->pb->error < 0) return p->output->pb->error;
  }
  return result == AVERROR(EAGAIN) || result == AVERROR_EOF ? 0 : result;
}

static int h264_frames(H264Pipeline *p, const AVPacket *packet) {
  int result = avcodec_send_packet(p->decoder, packet);
  if (result < 0) return result;
  while ((result = avcodec_receive_frame(p->decoder, p->decoded)) >= 0) {
    if (within_is_cancelled()) return AVERROR_EXIT;
    AVFrame *frame = p->decoded;
    // Fail on dynamic dimensions, not an out-of-bounds scaler or hidden resize.
    if (frame->width != p->decoder->width || frame->height != p->decoder->height)
      return AVERROR_INVALIDDATA;
    int64_t pts = frame->best_effort_timestamp;
    if (pts == AV_NOPTS_VALUE) {
      within_message(2, "H.264 source frame timestamps are unavailable; refusing invented timing.");
      return AVERROR_INVALIDDATA;
    }
    pts = av_rescale_q(pts, p->source->time_base, p->encoder->time_base);
    if (p->last_pts != AV_NOPTS_VALUE && pts <= p->last_pts) {
      within_message(2, "H.264 source frame timestamps are not strictly increasing.");
      return AVERROR_INVALIDDATA;
    }
    if (p->fps_cap && p->last_pts != AV_NOPTS_VALUE &&
        av_compare_ts(pts - p->last_pts, p->encoder->time_base,
                       1, (AVRational){1, p->fps_cap}) < 0) {
      av_frame_unref(frame);
      continue;
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
    frame->duration = av_rescale_q(p->decoded->duration, p->source->time_base,
                                   p->encoder->time_base);
    p->last_pts = pts;
    result = h264_packets(p, frame);
    av_frame_unref(p->decoded);
    if (result < 0) return result;
  }
  return result == AVERROR(EAGAIN) || result == AVERROR_EOF ? 0 : result;
}

static int h264_chapters(AVFormatContext *out, const AVFormatContext *in) {
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

static int h264_run(int matroska, int max_width, int bit_rate, int fps, int quality) {
  int result = 0, video = -1;
  int map[H264_MAX_STREAMS];
  AVFormatContext *in = NULL, *out = NULL;
  AVIOContext *input_io = NULL, *output_io = NULL;
  uint8_t *input_buffer = NULL, *output_buffer = NULL;
  AVPacket *packet = NULL;
  AVDictionary *options = NULL, *mux_options = NULL;
  H264Pipeline p = {.last_pts = AV_NOPTS_VALUE, .fps_cap = fps};
  WithinInput input = {.size = (int64_t)within_input_size()};
  WithinOutput output = {0};
  if (input.size <= 0 ||
      (max_width != 0 && max_width != 320 && max_width != 480 && max_width != 640) ||
      (bit_rate != 0 && bit_rate != 300000 && bit_rate != 600000 &&
       bit_rate != 1000000 && bit_rate != 2000000 && bit_rate != 4000000) ||
      (fps != 0 && fps != 15 && fps != 24 && fps != 25 && fps != 30) ||
      quality < 0 || quality > 3) return AVERROR(EINVAL);
  for (unsigned i = 0; i < H264_MAX_STREAMS; i++) map[i] = -1;
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
  in->max_streams = H264_MAX_STREAMS;
  result = avformat_open_input(&in, NULL, NULL, NULL);
  if (result < 0) goto cleanup;
  result = avformat_find_stream_info(in, NULL);
  if (result < 0) goto cleanup;
  if (in->nb_streams > H264_MAX_STREAMS || in->nb_chapters > H264_MAX_CHAPTERS) {
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
  const AVCodec *encoder = avcodec_find_encoder_by_name("libopenh264");
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
  p.encoder->width = p.decoder->width;
  p.encoder->height = p.decoder->height;
  if (max_width && max_width < p.encoder->width) {
    p.encoder->width = max_width;
    p.encoder->height = (int)((int64_t)p.decoder->height * max_width /
                             p.decoder->width) & ~1;
  }
  if ((p.encoder->width & 1) || (p.encoder->height & 1) || p.encoder->height < 2) {
    within_message(2, "OpenH264 requires even output dimensions; refusing undisclosed cropping.");
    result = AVERROR(EINVAL); goto cleanup;
  }
  p.encoder->pix_fmt = AV_PIX_FMT_YUV420P;
  p.encoder->time_base = p.source->time_base;
  if (p.encoder->time_base.num <= 0 || p.encoder->time_base.den <= 0) {
    result = AVERROR_INVALIDDATA; goto cleanup;
  }
  p.encoder->framerate = av_guess_frame_rate(in, p.source, NULL);
  if (p.encoder->framerate.num <= 0 || p.encoder->framerate.den <= 0) {
    result = AVERROR_INVALIDDATA; goto cleanup;
  }
  if (fps && av_cmp_q((AVRational){fps, 1}, p.encoder->framerate) < 0)
    p.encoder->framerate = (AVRational){fps, 1};
  p.encoder->bit_rate = bit_rate ? bit_rate : 2000000;
  p.encoder->gop_size = 48;
  p.encoder->max_b_frames = 0;
  p.encoder->thread_count = 1;
  p.encoder->slices = 1;
  p.encoder->qmin = quality == 1 ? 20 : quality == 3 ? 8 : 12;
  p.encoder->qmax = quality == 1 ? 42 : quality == 3 ? 28 : 36;
  p.encoder->flags |= AV_CODEC_FLAG_GLOBAL_HEADER | AV_CODEC_FLAG_BITEXACT;
  p.encoder->sample_aspect_ratio = p.decoder->sample_aspect_ratio;
  p.encoder->color_primaries = p.decoder->color_primaries;
  p.encoder->color_trc = p.decoder->color_trc;
  p.encoder->colorspace = p.decoder->colorspace;
  p.encoder->color_range = p.decoder->color_range;
  p.encoder->chroma_sample_location = p.decoder->chroma_sample_location;
  av_dict_set(&options, "allow_skip_frames", "0", 0);
  av_dict_set(&options, "profile", "constrained_baseline", 0);
  av_dict_set(&options, "rc_mode", "quality", 0);
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
      if (bytes > H264_MAX_ATTACHMENT_BYTES - attachment_bytes) {
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
    destination->r_frame_rate = source->r_frame_rate;
    destination->sample_aspect_ratio = source->sample_aspect_ratio;
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
  result = h264_chapters(out, in);
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
      result = h264_frames(&p, packet);
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
  result = h264_frames(&p, NULL);
  if (result < 0) goto cleanup;
  result = h264_packets(&p, NULL);
  if (result < 0) goto cleanup;
  result = av_write_trailer(out);
  if (result < 0) goto cleanup;
  avio_flush(output_io);
  if (output_io->error < 0) { result = output_io->error; goto cleanup; }
  result = within_has_sync_output() ? within_output_truncate_sync((double)output.size) : within_output_truncate((double)output.size);
  if (result < 0) goto cleanup;
  result = within_has_sync_output() ? within_output_flush_sync() : within_output_flush();
cleanup:
  if (result < 0) report_av_error("H.264 candidate failed", result);
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
// private kernel. Profile numbers are adapter sentinels, NOT public H.264 claims.
EMSCRIPTEN_KEEPALIVE
int within_remux(int profile, int audio_bit_rate, int audio_sample_rate,
                 int audio_channels, int audio_codec, int audio_compression,
                 int audio_quality, int video_codec, int max_width,
                 int bit_rate, int fps, int quality) {
  if ((profile != 6 && profile != 23) || audio_bit_rate || audio_sample_rate ||
      audio_channels || audio_codec || audio_compression || audio_quality || video_codec)
    return AVERROR(EINVAL);
  return h264_run(profile == 23, max_width, bit_rate, fps, quality);
}

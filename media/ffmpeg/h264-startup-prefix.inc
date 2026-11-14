  /* Own at most 2 MiB of packet+side-data payload and 4096 packet refs.
     This is a separate fixed prefix, not an enlarged stream-info probe.
     Known-first-DTS streams stop after one packet; others need a complete
     2*verified_delay+1 presentation window (at most 33 video packets).
     All packet refs are consumed by the existing loop and freed in cleanup. */
  if (profile == 1) {
    const unsigned int prefix_stream_count = input_format->nb_streams;
    int *need = av_calloc(prefix_stream_count, sizeof(*need));
    int *seen = av_calloc(prefix_stream_count, sizeof(*seen));
    AVPacket *next = av_packet_alloc();
    int remaining = 0;
    int inspected_packets = 0;
    int64_t payload_bytes = 0;
    if (!need || !seen || !next) {
      result = AVERROR(ENOMEM);
      goto h264_prefix_done;
    }
    for (unsigned int index = 0; index < prefix_stream_count; index++) {
      const AVCodecParameters *par = input_format->streams[index]->codecpar;
      if (stream_map[index] >= 0 && par->codec_id == AV_CODEC_ID_H264 &&
          par->codec_type == AVMEDIA_TYPE_VIDEO && par->video_delay > 0) {
        if (par->video_delay > WITHIN_H264_STARTUP_MAX_DELAY) {
          result = AVERROR_INVALIDDATA;
          goto h264_prefix_done;
        }
        need[index] = 2 * par->video_delay + 1;
        remaining++;
      }
    }
    while (remaining > 0) {
      if (within_is_cancelled()) { result = AVERROR_EXIT; break; }
      if (++inspected_packets > 4096 || prefetched_packet_count >= 4096) { result = AVERROR(ENOBUFS); break; }
      result = av_read_frame(input_format, next);
      if (result < 0) break;
      if (input_format->nb_streams != prefix_stream_count || next->size < 0 ||
          next->size > 2097152 - payload_bytes) {
        result = AVERROR(ENOBUFS); break;
      }
      payload_bytes += next->size;
      for (int side = 0; side < next->side_data_elems; side++) {
        if (next->side_data[side].size > (uint64_t)(2097152 - payload_bytes)) {
          result = AVERROR(ENOBUFS); break;
        }
        payload_bytes += next->side_data[side].size;
      }
      if (result < 0) break;
      const int index = next->stream_index;
      if (index >= 0 && index < (int)prefix_stream_count && stream_map[index] >= 0) {
        if (need[index] > 0) {
          seen[index]++;
          if ((seen[index] == 1 && next->dts != AV_NOPTS_VALUE) ||
              seen[index] == need[index]) {
            need[index] = 0; remaining--;
          }
        }
        result = append_prefetched_packet(&prefetched_packets,
            &prefetched_packet_count, &prefetched_packet_capacity, next);
        if (result < 0) break;
      }
      av_packet_unref(next);
    }
    if (remaining > 0 && result == AVERROR_EOF) result = AVERROR_INVALIDDATA;
    if (result < 0) goto h264_prefix_done;
    for (unsigned int index = 0; index < prefix_stream_count; index++) {
      const AVStream *stream = input_format->streams[index];
      const AVCodecParameters *par = stream->codecpar;
      if (stream_map[index] < 0 || par->codec_id != AV_CODEC_ID_H264 ||
          par->codec_type != AVMEDIA_TYPE_VIDEO || par->video_delay <= 0) continue;
      AVPacket *window[WITHIN_H264_STARTUP_MAX_PACKETS];
      int64_t pts[WITHIN_H264_STARTUP_MAX_PACKETS];
      int64_t dts[WITHIN_H264_STARTUP_MAX_PACKETS];
      int64_t planned[WITHIN_H264_STARTUP_MAX_PACKETS];
      int count = 0, target = 2 * par->video_delay + 1;
      for (int i = 0; i < prefetched_packet_count && count < target; i++) {
        AVPacket *item = prefetched_packets[i];
        if (item->stream_index != (int)index) continue;
        window[count] = item; pts[count] = item->pts; dts[count] = item->dts; count++;
      }
      if (count > 0 && dts[0] != AV_NOPTS_VALUE) continue;
      const int64_t max_span = av_rescale_q(2 * AV_TIME_BASE, AV_TIME_BASE_Q, stream->time_base);
      const int filled = within_h264_startup_dts(count, par->video_delay, max_span, pts, dts, planned);
      if (filled < 0) { result = AVERROR_INVALIDDATA; break; }
      for (int i = 0; i < filled; i++) window[i]->dts = planned[i];
      if (filled) within_message(1,
          "Missing initial H.264 decode timestamps reconstructed from bounded observed presentation cadence; existing PTS and known DTS are unchanged.");
    }
h264_prefix_done:
    av_packet_free(&next); av_free(need); av_free(seen);
    if (result < 0) {
      if (result != AVERROR_EXIT) within_message(2,
          "H.264 startup decode timestamps could not be verified within the fixed packet, byte and timeline bounds.");
      goto cleanup;
    }
  }

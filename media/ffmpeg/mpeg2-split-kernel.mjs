import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = text => createHash("sha256").update(text).digest("hex");
export function makeMpeg2SplitKernel(kernel) {
  assert.equal(sha(kernel), "67d3b8299a9e695ea68f96fdcc51d3f5ba5a694547b3f8288e740990c5f7eac0", "Exact prior private kernel");
  const start = kernel.indexOf("static int mpeg2_packets("), end = kernel.indexOf("static int mpeg2_frames(");
  assert.ok(start >= 0 && end > start);
  const oldPackets = kernel.slice(start, end);
  // Keep exact native time rescaling, source-offset restoration and mux writer.
  const timestampStart = oldPackets.indexOf("    av_packet_rescale_ts("), timestampEnd = oldPackets.indexOf("    result = av_interleaved_write_frame");
  assert.ok(timestampStart >= 0 && timestampEnd > timestampStart);
  const timing = oldPackets.slice(timestampStart, timestampEnd);
  const packets = `static int mpeg2_packets(MPEG2Pipeline *p, AVFrame *frame) {
  int result = within_split_send(frame);
  if (result < 0) return result;
  while ((result = within_split_receive(p->encoded)) >= 0) {
${timing}    result = av_interleaved_write_frame(p->output, p->encoded);
    av_packet_unref(p->encoded);
    // Keep encoder packet alive until the real mux/AVIO writer has finished.
    int release = within_split_call(4, result >= 0 && p->output->pb->error >= 0, 0, 0);
    if (result < 0) return result;
    if (release < 0) return release;
    if (p->output->pb->error < 0) return p->output->pb->error;
  }
  return result == AVERROR(EAGAIN) || result == AVERROR_EOF ? 0 : result;
}

`;
  const pairs = [
    [oldPackets, packets],
    ['  const AVCodec *encoder = avcodec_find_encoder_by_name("mpeg2video");\n  if (!decoder || !encoder)',
      '  const AVCodec *encoder = NULL; /* Configuration only; actual codec is separate. */\n  if (!decoder)'],
    ['  result = avcodec_open2(p.encoder, encoder, &options);', '  result = within_split_open(p.encoder);'],
    ['      result = avcodec_parameters_from_context(destination->codecpar, p.encoder);',
      '      result = within_split_read_parameters(&destination->codecpar, split_mux_parameters, split_mux_parameter_bytes);'],
    ['  return result < 0 ? result : 0;\n}', '  within_split_call(6, 0, 0, 0);\n  split_mux_parameter_bytes = 0;\n  return result < 0 ? result : 0;\n}'],
  ];
  let generated = kernel;
  for (const [before, after] of pairs) {
    assert.equal(generated.split(before).length, 2, "One exact split replacement"); generated = generated.replace(before, after);
  }
  let reversed = generated;
  for (const [before, after] of pairs.toReversed()) {
    assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before);
  }
  assert.equal(reversed, kernel, "No other codec settings, fields, timing, stream/metadata or AVIO changes");
  return generated;
}

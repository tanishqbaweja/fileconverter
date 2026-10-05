import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const MPEG2_DIAGNOSTIC_KERNEL_SHA256 = "67d3b8299a9e695ea68f96fdcc51d3f5ba5a694547b3f8288e740990c5f7eac0";

// Only this exact audited kernel is instrumented. The earlier failed kernel
// and executed instrumentation hash remain frozen in allocation evidence.
// This audit retains LOW_DELAY and adds explicit mux initialization followed
// by bounded source encoder/encoder-* restoration before header writing.
// Further source edits require a new explicit audit, never a wildcard match.
export function instrumentMpeg2Allocator(kernel, header) {
  assert.equal(createHash("sha256").update(kernel).digest("hex"), MPEG2_DIAGNOSTIC_KERNEL_SHA256);
  const surround = (needle, before, after) => {
    assert.equal(kernel.split(needle).length, 2, needle);
    kernel = kernel.replace(needle,
      `  mpeg2_allocator_snapshot(${before});\n${needle}\n  mpeg2_allocator_snapshot(${after});`);
  };
  surround("  result = avformat_open_input(&in, NULL, NULL, NULL);", "1, NULL, NULL", "2, NULL, NULL");
  surround("  result = avformat_find_stream_info(in, NULL);", "3, NULL, NULL", "4, NULL, NULL");
  surround("  result = avcodec_open2(p.decoder, decoder, NULL);", "5, p.decoder, NULL", "6, p.decoder, NULL");
  surround("  result = avcodec_open2(p.encoder, encoder, &options);", "7, p.encoder, NULL", "8, p.encoder, NULL");
  surround("  result = avformat_write_header(out, &mux_options);", "9, NULL, NULL", "10, NULL, NULL");
  surround("  int result = avcodec_send_packet(p->decoder, packet);", "11, p->decoder, NULL", "12, p->decoder, NULL");
  surround("  int result = avcodec_send_frame(p->encoder, frame);", "15, p->encoder, frame", "16, p->encoder, frame");
  const receive = "  while ((result = avcodec_receive_frame(p->decoder, p->decoded)) >= 0) {";
  assert.equal(kernel.split(receive).length, 2);
  kernel = kernel.replace(receive, `${receive}\n    mpeg2_allocator_snapshot(13, p->decoder, p->decoded);`);
  return `${header}\n${kernel}`;
}

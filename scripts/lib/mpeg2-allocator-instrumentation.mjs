import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const MPEG2_DIAGNOSTIC_KERNEL_SHA256 = "407453956e7d44986da016a72e071a75d0c69063a9ad15862b08aedfd877600e";

// Only the exact kernel that failed on the protected fixture is instrumented.
// Source edits need an explicit new audit, not silently matching another build.
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

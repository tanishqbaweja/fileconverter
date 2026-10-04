import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const H264_DIAGNOSTIC_KERNEL_SHA256 = "a6283ed5ee3080044ccabf2d79e8009e680bfb0d9aa26420b3359af25cb682a9";
export function instrumentH264Allocator(kernel, header) {
  assert.equal(createHash("sha256").update(kernel).digest("hex"), H264_DIAGNOSTIC_KERNEL_SHA256,
    "Diagnostic requires exact unchanged codec kernel");
  const loop = "  while ((result = av_read_frame(in, packet)) >= 0) {";
  const progress = "    within_progress((double)input.position, (double)output.size,";
  assert.equal(kernel.split(loop).length, 2);
  assert.equal(kernel.split(progress).length, 2);
  return header + "\n" + kernel.replace(loop, "  h264_allocator_snapshot(in, input.position, output.size);\n" + loop)
    .replace(progress, "    h264_allocator_snapshot(in, input.position, output.size);\n" + progress);
}

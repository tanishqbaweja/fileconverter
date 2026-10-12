// Private source candidate only: do not edit already executed native sources.
import assert from "node:assert/strict";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeMpeg2SplitKernel } from "./mpeg2-split-kernel.mjs";
const originalBridge = "eb13d16e4041440b1b6b95c3d3dd571c2bdabc244d455cb01ffb236d27ffd284";
export const PACKET_CACHE_BRIDGE_EDITS = Object.freeze([
  ['#include "mpeg2-split-codec-parameters.h"\n', '#include "mpeg2-split-codec-parameters.h"\n#include "mpeg2-packet-cache.h"\nstatic WithinPacketCache *split_mux_packet_cache;\n'],
  ["    int result = av_new_packet(packet, bytes);\n    if (result < 0) return result;",
    "    packet->buf = within_packet_cache_get(&split_mux_packet_cache, bytes, AV_INPUT_BUFFER_PADDING_SIZE);\n    if (!packet->buf) return AVERROR(ENOMEM);\n    packet->data = packet->buf->data;\n    packet->size = bytes;\n    int result;"],
].map(row => Object.freeze(row)));
function transform(source, edits, reverse) {
  let generated = source;
  for (const [before, after] of reverse ? edits.toReversed() : edits) {
    const from = reverse ? after : before, to = reverse ? before : after;
    assert.equal(generated.split(from).length, 2, "Require one exact packet-only replacement");
    generated = generated.replace(from, to);
  }
  return generated;
}
export function makePacketCacheBridge(source) {
  assert.equal(sha(source), originalBridge);
  const generated = transform(source, PACKET_CACHE_BRIDGE_EDITS, false);
  assert.equal(transform(generated, PACKET_CACHE_BRIDGE_EDITS, true), source);
  return generated;
}
export function makePacketCacheKernel(source) {
  const original = makeMpeg2SplitKernel(source);
  const edits = [['  within_split_call(6, 0, 0, 0);\n', '  within_split_call(6, 0, 0, 0);\n  within_packet_cache_close(&split_mux_packet_cache);\n']];
  const generated = transform(original, edits, false);
  assert.equal(transform(generated, edits, true), original);
  assert.ok(generated.indexOf("av_packet_free(&p.encoded)") < generated.indexOf("within_packet_cache_close"));
  assert.ok(generated.indexOf("avformat_free_context(out)") < generated.indexOf("within_packet_cache_close"));
  return generated;
}

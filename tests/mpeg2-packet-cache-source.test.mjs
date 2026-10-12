import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makePacketCacheBridge, makePacketCacheKernel, PACKET_CACHE_BRIDGE_EDITS } from "../media/ffmpeg/mpeg2-packet-cache-source.mjs";
import { makeMpeg2SplitKernel } from "../media/ffmpeg/mpeg2-split-kernel.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
test("private packet candidate reverses exact actual bridge and kernel; timestamps, side data, codec, fragments and AVIO unchanged", async () => {
  const bridge = await read("media/ffmpeg/mpeg2-split-mux-bridge.h"), kernel = await read("media/ffmpeg/mpeg2-candidate.c");
  let generated = makePacketCacheBridge(bridge);
  for (const [before, after] of PACKET_CACHE_BRIDGE_EDITS.toReversed()) generated = generated.replace(after, before);
  assert.equal(generated, bridge);
  const candidate = makePacketCacheKernel(kernel);
  assert.equal(candidate.replace("  within_packet_cache_close(&split_mux_packet_cache);\n", ""), makeMpeg2SplitKernel(kernel));
  for (const gate of ["frag_keyframe+delay_moov+default_base_moof+skip_trailer", '"frag_duration", "1000000"', '"frag_size", "1048576"', "av_interleaved_write_frame", "within_split_call(4", "av_packet_rescale_ts"])
    assert.ok(candidate.includes(gate), gate);
  for (const gate of ["av_packet_unref(packet)", "bytes > 1048576", "av_packet_new_side_data", "AV_INPUT_BUFFER_PADDING_SIZE", "within_split_call(3"])
    assert.ok(makePacketCacheBridge(bridge).includes(gate), gate);
  assert.throws(() => makePacketCacheBridge(bridge + " ")); assert.throws(() => makePacketCacheKernel(kernel + " "));
});
test("one bounded variable-size idle lease, final-unref ownership, zero padded acquisitions and deferred close; no fixed1MiB per packet", async () => {
  const header = await read("media/ffmpeg/mpeg2-packet-cache.h");
  for (const gate of ["bytes > 1048576 || padding != 64", "(size_t)bytes + padding", "av_malloc(required)", "lease->capacity < required", "memset(lease->data, 0, lease->capacity)", "!cache->closed && !cache->idle", "cache->live--", "cache->closed && !cache->live", "if (!ref) within_packet_release"])
    assert.ok(header.includes(gate), gate);
  assert.ok(!header.includes("av_malloc(1048576")); assert.ok(!header.includes("realloc"));
});
test("planned actual-libavutil smoke covers200000 reuses, maximum payload, live aliases, deferred uninit and four allocation failures", async () => {
  const smoke = await read("media/ffmpeg/mpeg2-packet-cache-smoke.c");
  for (const gate of ["i < 200000", "owned_allocations == prior_allocations", "av_buffer_get_ref_count(ref) == 2", "second->data != alias->data", "cache->idle->capacity == 96", "alias->data[4095] == 0x31", "i <= 3", "fail_create = 1", "balanced()", "zeroed(ref)"])
    assert.ok(smoke.includes(gate), gate);
});

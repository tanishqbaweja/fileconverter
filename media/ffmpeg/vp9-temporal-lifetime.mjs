// Exact pinned sources, not regex-only acceptance of arbitrary vendor code.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const VP9_TEMPORAL_LIFETIME_PINS = Object.freeze({
  "vp9/encoder/vp9_encoder.c": "c42b8ef0665831f40715eca748bf7cecfcc98dd212927bbfe042a355c6fc3faa",
  "vp9/vp9_cx_iface.c": "e45fcff4bc3380736d3bfded778afd5983cad9816c1e434cb965077304fdcd7e",
  "vpx_scale/generic/yv12config.c": "4b248ec01e4ec24194247379a3a9891b4f6d3ea024bb1c209ade86c514a92148",
  "vpx_mem/vpx_mem.c": "6417e5f4f291bfbca66215bdc28064eb727667500c436ed06f903902804d3e86",
});
export function verifyVp9TemporalLifetimeSources(sources) {
  for (const [file, pin] of Object.entries(VP9_TEMPORAL_LIFETIME_PINS)) {
    assert.equal(typeof sources[file], "string", file);
    assert.equal(createHash("sha256").update(sources[file]).digest("hex"), pin, "Pinned lifetime source: " + file);
  }
  const encoder = sources["vp9/encoder/vp9_encoder.c"], iface = sources["vp9/vp9_cx_iface.c"];
  assert.ok(encoder.includes("vp9_zero(*cpi);"));
  assert.ok(encoder.includes("vpx_free_frame_buffer(&cpi->tf_buffer);"));
  assert.ok(encoder.includes("cpi->oxcf = *oxcf;"));
  assert.match(iface, /if \(deadline == VPX_DL_REALTIME\) \{\s*ctx->oxcf.pass = 0;\s*new_mode = REALTIME;/);
  assert.match(iface, /ctx->oxcf.mode = new_mode;\s*vp9_change_config\(ctx->cpi, &ctx->oxcf\);/);
  const mode = iface.indexOf("res = pick_quickcompress_mode(ctx, duration, deadline);"),
    receive = iface.indexOf("if (vp9_receive_raw_frame(cpi,", mode),
    compress = iface.indexOf("vp9_get_compressed_data(", receive);
  assert.ok(mode > 0 && receive > mode && compress > receive, "Realtime config precedes frame ingestion and compression");
  assert.match(sources["vpx_scale/generic/yv12config.c"], /if \(ybf->buffer_alloc_sz > 0\) \{\s*vpx_free\(ybf->buffer_alloc\);/);
  assert.ok(sources["vpx_scale/generic/yv12config.c"].includes("memset(ybf, 0, sizeof(YV12_BUFFER_CONFIG));"));
  assert.match(sources["vpx_mem/vpx_mem.c"], /void vpx_free\(void \*memblk\) \{\s*if \(memblk\)/);
  return { sourcePins: VP9_TEMPORAL_LIFETIME_PINS, zeroInitialized: true, emptyBufferCleanupSafe: true,
    realtimeConfigBeforeIngestionAndCompression: true, configCopiedToEncoder: true,
    semanticProofForArbitrarySources: false, publicAcceptance: false };
}

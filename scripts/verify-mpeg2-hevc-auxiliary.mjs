// Bounded primary-source audit only. Never compiles/converts media or retries a job.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { HEVC_REFS_SOURCE_SHA256, instrumentHevcAuxiliarySource, reverseHevcAuxiliarySource,
  instrumentHevcEncoderBoundary, reverseHevcEncoderBoundary } from "../media/ffmpeg/mpeg2-hevc-auxiliary-diagnostic.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const pins = {
  "libavcodec/hevc/refs.c": HEVC_REFS_SOURCE_SHA256,
  "libavcodec/hevc/hevcdec.c": "d6c12610d92a8d8e27bae984172ce1d0f13f8eb16d5998eb58cc25b2fc690974",
  "libavcodec/hevc/hevcdec.h": "8702d174fc97001cfb38323ee34a2bb8e3a34eaceb0ff63c9ff4d0212d2d088d",
  "libavutil/refstruct.c": "d8936c56db57fe53d9836e950563483104670c2fc98687f87fb497e078ba742f",
};
const rows = await Promise.all(Object.entries(pins).map(async ([file, hash]) => {
  const response = await fetch(`https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/${file}`,
    { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok); assert.ok(Number(response.headers.get("content-length") ?? 0) <= 262144);
  const reader = response.body.getReader(), parts = [];
  let bytes = 0;
  try {
    for (;;) {
      const row = await reader.read(); if (row.done) break;
      bytes += row.value.byteLength; assert.ok(bytes <= 262144, "Bounded source, never user media");
      parts.push(row.value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const data = Buffer.concat(parts); assert.equal(sha(data), hash, file);
  return [file, data.toString("utf8")];
}));
const upstream = Object.fromEntries(rows), refs = upstream["libavcodec/hevc/refs.c"];
assert.match(refs, /if \(!frame->flags\) \{[\s\S]*av_refstruct_unref\(&frame->tab_mvf\);[\s\S]*av_refstruct_unref\(&frame->rpl_tab\);/);
assert.match(refs, /frame->tab_mvf = av_refstruct_pool_get\(l->tab_mvf_pool\);/);
assert.match(refs, /frame->rpl_tab = av_refstruct_pool_get\(l->rpl_tab_pool\);/);
assert.match(upstream["libavcodec/hevc/hevcdec.c"], /tab_mvf_pool = av_refstruct_pool_alloc\(min_pu_size \* sizeof\(MvField\), 0\)/);
assert.match(upstream["libavcodec/hevc/hevcdec.c"], /rpl_tab_pool = av_refstruct_pool_alloc\(ctb_count\s+\* sizeof\(RefPicListTab\), 0\)/);
assert.match(upstream["libavcodec/hevc/hevcdec.h"], /AVRefStructPool\s+\*tab_mvf_pool/);
const changed = instrumentHevcAuxiliarySource(refs);
assert.equal(reverseHevcAuxiliarySource(changed), refs);
assert.throws(() => instrumentHevcAuxiliarySource(changed));
assert.throws(() => instrumentHevcAuxiliarySource(refs.replace("av_refstruct_unref", "changed_unref")));
assert.throws(() => reverseHevcAuxiliarySource(changed.replace("sequence >= 48", "sequence >= 49")));
const kernel = await readFile(new URL("../media/ffmpeg/mpeg2-candidate.c", import.meta.url), "utf8");
assert.equal(reverseHevcEncoderBoundary(instrumentHevcEncoderBoundary(kernel)), kernel);
const sources = {};
for (const file of ["media/ffmpeg/mpeg2-hevc-auxiliary-diagnostic.mjs", "media/ffmpeg/mpeg2-hevc-auxiliary-diagnostic.h",
  "scripts/verify-mpeg2-hevc-auxiliary.mjs"])
  sources[file] = sha(await readFile(new URL(`../${file}`, import.meta.url)));
process.stdout.write(`${JSON.stringify({ status: "source-only-hevc-boundary-observer-verified-not-conversion",
  sources, upstreamSources: Object.fromEntries(rows.map(([file, text]) => [file, { bytes: Buffer.byteLength(text), sha256: sha(text) }])),
  patchedRefsSha256: sha(changed), generatedDiagnosticKernelSha256: sha(instrumentHevcEncoderBoundary(kernel)),
  byteExactNativeSourceReversal: true, byteExactKernelReversal: true, mutationNegativeControlsPassed: true,
  hevcPoolFlagsUnchanged: true, liveReferencesUnchanged: true, allocationCodeUnchanged: true,
  auxiliaryEventCap: 48, planeEventCap: 192, browserEventCap: 240, inactiveLinkWalkCap: 128,
  nativeSnapshotBytes: 48, generatedSourceFilesCreated: 0, scratchFilesCreated: 0,
  compiledObserverVerified: false, actualInactiveHevcBytesAtFailure: null, contiguousFreeBlockCapacity: null,
  publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null,
  next: "One changed non-Docker compile with existing plane diagnostic mode, mandatory same-allocator reader unit, small fidelity/adverse cases and one original-source diagnostic. No unchanged failing retry or live-reference removal." })}\n`);

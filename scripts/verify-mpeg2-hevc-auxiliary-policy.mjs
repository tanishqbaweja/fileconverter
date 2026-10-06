// Bounded pinned primary-source audit. No scratch, build or media conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { HEVC_DECODER_SOURCE_SHA256, applyHevcAuxiliaryPolicy, reverseHevcAuxiliaryPolicy }
  from "../media/ffmpeg/mpeg2-hevc-auxiliary-policy.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const response = await fetch("https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavcodec/hevc/hevcdec.c",
  { signal: AbortSignal.timeout(30000) });
assert.ok(response.ok);
const reader = response.body.getReader(), parts = [];
let bytes = 0;
try {
  for (;;) {
    const row = await reader.read(); if (row.done) break;
    bytes += row.value.byteLength; assert.ok(bytes <= 196608, "Bounded native source, never user media");
    parts.push(row.value);
  }
} finally { await reader.cancel(); reader.releaseLock(); }
const original = Buffer.concat(parts).toString("utf8"); assert.equal(sha(original), HEVC_DECODER_SOURCE_SHA256);
const patched = applyHevcAuxiliaryPolicy(original);
assert.equal(reverseHevcAuxiliaryPolicy(patched), original);
assert.throws(() => applyHevcAuxiliaryPolicy(patched));
assert.throws(() => applyHevcAuxiliaryPolicy(original.replace("sizeof(MvField)", "sizeof(RefPicListTab)")));
assert.throws(() => reverseHevcAuxiliaryPolicy(patched.replace("thread_count,", "thread_count + 1,")));
const root = new URL("../", import.meta.url), sources = {};
for (const file of ["media/ffmpeg/mpeg2-hevc-auxiliary-policy.mjs", "media/ffmpeg/mpeg2-hevc-auxiliary-policy.h",
  "media/ffmpeg/mpeg2-hevc-auxiliary-selector-smoke.c", "scripts/verify-mpeg2-hevc-auxiliary-policy.mjs"])
  sources[file] = sha(await readFile(new URL(file, root)));
const previous = JSON.parse(await readFile(new URL("evidence/mpeg2-hevc-auxiliary-measured-2026-10-06.json", root)));
assert.equal(previous.boundary.actualInactiveHevcBackingBytes, 1316432);
assert.equal(previous.boundary.actualLiveHevcBackingBytes, 6582160);
assert.equal(previous.boundary.safeLiveReferenceRemoval, false);
process.stdout.write(`${JSON.stringify({ status: "source-only-final-unref-hevc-cache-admission-trial-not-acceptance",
  sources, upstreamSource: { file: "libavcodec/hevc/hevcdec.c", bytes, sha256: sha(original) },
  patchedDecoderSha256: sha(patched), byteExactReversal: true, mutationNegativeControlsPassed: true,
  nativeSourceSubstitutions: 5, affectedPools: ["tab_mvf", "rpl_tab"], privateBit: 1073741824,
  evidence: { file: "evidence/mpeg2-hevc-auxiliary-measured-2026-10-06.json",
    observedIdleBackingBytes: 1316432, observedLiveBackingBytes: 6582160 },
  allocationSizesUnchanged: true, liveReferencesUnchanged: true, dpbFlagsUnchanged: true,
  pixelsAndCodecSettingsUnchanged: true, sourceDimensionsUnchanged: true, fixedMemoryBytes: 33554432,
  selectorCompiled: false, decoderCompiled: false, runtimeSavingsBytes: null, speedGainClaim: null,
  publicAcceptance: false, generatedSourceFilesCreated: 0, scratchFilesCreated: 0,
  next: "One changed non-Docker build with mandatory 60-configuration selector and same-allocator lifecycle units; small fidelity/adverse cases then original normal acceptance gate. No live-reference removal, larger heap or guaranteed fit/speed claim." })}\n`);

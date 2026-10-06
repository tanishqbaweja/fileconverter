import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HEVC_DECODER_SOURCE_SHA256, applyHevcAuxiliaryPolicy, reverseHevcAuxiliaryPolicy }
  from "../media/ffmpeg/mpeg2-hevc-auxiliary-policy.mjs";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const sha = (value) => createHash("sha256").update(value).digest("hex");
test("Source-bound HEVC two-pool admission trial preserves pinned native source by exact reversal", async () => {
  const proof = JSON.parse(await read("evidence/mpeg2-hevc-auxiliary-policy-source-2026-10-06.json"));
  for (const [file, hash] of Object.entries(proof.sources)) assert.equal(sha(await read(file)), hash, file);
  assert.equal(proof.upstreamSource.sha256, HEVC_DECODER_SOURCE_SHA256);
  assert.equal(proof.upstreamSource.bytes, 167708);
  assert.equal(proof.patchedDecoderSha256, "0c91a1622add9eaf483f6fdcf3f9eddb59d5f4540d8a526b97d60b7889de67c5");
  assert.equal(proof.byteExactReversal, true); assert.equal(proof.mutationNegativeControlsPassed, true);
  assert.equal(proof.nativeSourceSubstitutions, 5); assert.deepEqual(proof.affectedPools, ["tab_mvf", "rpl_tab"]);
  assert.equal(proof.evidence.observedIdleBackingBytes, 1316432);
  assert.equal(proof.evidence.observedLiveBackingBytes, 6582160);
  for (const field of ["allocationSizesUnchanged", "liveReferencesUnchanged", "dpbFlagsUnchanged",
    "pixelsAndCodecSettingsUnchanged", "sourceDimensionsUnchanged"]) assert.equal(proof[field], true);
  assert.equal(proof.selectorCompiled, false); assert.equal(proof.decoderCompiled, false);
  assert.equal(proof.runtimeSavingsBytes, null); assert.equal(proof.speedGainClaim, null);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.fixedMemoryBytes, 33554432);
  for (const invalid of [null, "", "altered native source", "x".repeat(196609)])
    assert.throws(() => applyHevcAuxiliaryPolicy(invalid));
  assert.throws(() => reverseHevcAuxiliaryPolicy("altered native source"));
});
test("Exact C selector gates shared bit30 to one-thread HEVC decoding without duplicating lifetime policy", async () => {
  const header = await read("media/ffmpeg/mpeg2-hevc-auxiliary-policy.h");
  assert.match(header, /codec_id == AV_CODEC_ID_HEVC && thread_count == 1 && !is_encoder/);
  assert.match(header, /#define WITHIN_HEVC_AUXILIARY_UNCACHED \(1u << 30\)/);
  assert.doesNotMatch(header, /av_refstruct_unref|av_free|memset|DPB|skip_frame|qmin|qmax/);
  const existing = await read("media/ffmpeg/patches/mpeg2-encoder-uncached-accessories.patch");
  assert.equal(sha(existing), "095c43cf7f636209be78d32cbedec1beacfa30c0d50978954d70bcf5abf9f645");
  assert.match(existing, /pool->pool_flags & WITHIN_MPEG2_POOL_UNCACHED/);
  const smoke = await read("media/ffmpeg/mpeg2-hevc-auxiliary-selector-smoke.c");
  assert.match(smoke, /#include "mpeg2-hevc-auxiliary-policy.h"/);
  assert.match(smoke, /threads\[\] = \{ -1, 0, 1, 2, 16 \}/);
  assert.match(smoke, /checked == 60/);
  assert.doesNotMatch(smoke, /avcodec_open|avformat_open|avio_|test\.mkv/);
});
test("Private build verifies actual patched decoder, compiled selector, source bundle and unchanged resource gates", async () => {
  const recipe = await read("media/ffmpeg/build-mpeg2-candidate.sh");
  const manifest = await read("media/ffmpeg/mpeg2-candidate-manifest.mjs");
  for (const file of ["mpeg2-hevc-auxiliary-policy.mjs", "mpeg2-hevc-auxiliary-policy.h",
    "mpeg2-hevc-auxiliary-selector-smoke.c"]) assert.ok(recipe.includes(file) && manifest.includes(file));
  assert.match(recipe, /node "\$\{BUILD_ROOT\}\/mpeg2-hevc-auxiliary-selector-smoke.js" > "\$\{OUTPUT_ROOT\}\/mpeg2-hevc-auxiliary-selector-smoke.json"/);
  assert.match(recipe, /test -s "\$\{OUTPUT_ROOT\}\/mpeg2-hevc-auxiliary-selector-smoke.json"/);
  assert.match(recipe, /-UNDEBUG/); assert.match(recipe, /"-sMALLOC=\$\{CANDIDATE_ALLOCATOR\}"/);
  assert.match(manifest, /reverseHevcAuxiliaryPolicy\(actualHevcDecoder\)/);
  assert.match(manifest, /Actual decoder selector header differs from source/);
  assert.match(manifest, /Actual compiled HEVC auxiliary selector proof missing or changed/);
  assert.match(manifest, /checkedConfigurations: 60/);
  assert.match(manifest, /hevcDecoderPatchedSourceSha256:/);
  assert.match(recipe, /-sALLOW_MEMORY_GROWTH=0 "-sINITIAL_MEMORY=33554432" "-sMAXIMUM_MEMORY=33554432"/);
  assert.match(recipe, /-sSTACK_SIZE=262144 -sSTACK_OVERFLOW_CHECK=2/);
  assert.equal(sha(await read("media/ffmpeg/mpeg2-candidate.c")),
    "67d3b8299a9e695ea68f96fdcc51d3f5ba5a694547b3f8288e740990c5f7eac0");
  const fixture = JSON.parse(await read("evidence/mpeg2-hevc-auxiliary-measured-2026-10-06.json"));
  assert.equal(fixture.protected.source.inputChanged, false);
  assert.equal(fixture.protected.completedConversions, 0);
});

// Exact upstream-source audit for the newly observed LATE original abort.
// No Wasm build, instance, conversion, native codec, or user-file access.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sources = [
  ["libavcodec/hevc/refs.c", "340d160758ec36928907132618c0d989a0f09869cca5fe57ab936ad54a9a3e5e", 32768],
  ["libavutil/refstruct.c", "d8936c56db57fe53d9836e950563483104670c2fc98687f87fb497e078ba742f", 32768],
  ["libavcodec/hevc/hevcdec.c", "d6c12610d92a8d8e27bae984172ce1d0f13f8eb16d5998eb58cc25b2fc690974", 196608],
];
async function exactSource([file, hash, maximumBytes]) {
  const url = `https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/${file}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) }); assert.ok(response.ok);
  const reader = response.body.getReader(), parts = []; let bytes = 0;
  try {
    for (;;) {
      const row = await reader.read(); if (row.done) break;
      bytes += row.value.byteLength; assert.ok(bytes <= maximumBytes); parts.push(row.value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const original = Buffer.concat(parts); assert.equal(sha(original), hash, file);
  return { file, url, bytes, sha256: hash, text: original.toString("utf8") };
}
const upstream = await Promise.all(sources.map(exactSource));
const [refs, refstruct, decoder] = upstream;
const proofBytes = await readFile(path.join(root, "evidence/mpeg2-quiesced-budget-original-2026-10-08.json"));
const proof = JSON.parse(proofBytes);
const analysisBytes = await readFile(path.join(root, "evidence/mpeg2-quiesced-budget-terminal-analysis-2026-10-08.json"));
const analysis = JSON.parse(analysisBytes);
assert.equal(analysis.input.sha256, sha(proofBytes)); assert.equal(analysis.actualBinarySymbolJoinReverified, true);
const manifestPath = "work/mpeg2-split-pipeline-37479749443/build-manifest.json";
const manifestBytes = await readFile(path.join(root, manifestPath)), manifest = JSON.parse(manifestBytes);
assert.equal(manifest.ffmpeg, "8.1.2"); assert.equal(manifest.allocator, "dlmalloc");
assert.equal(manifest.allowMemoryGrowth, false);
assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], proof.actualStackSymbols[0].binarySha256);
for (const [file, hash] of Object.entries(manifest.sources))
  assert.equal(sha(await readFile(path.join(root, file))), hash, file);
// Reconstruct the EXACT refstruct policy that the executed binary was built with.
const policyInclude = "/* Private pinned-build bit; used only by single-thread MPEG2 encoders. */\n#define WITHIN_MPEG2_POOL_UNCACHED (1u << 30)\n\n";
assert.equal(refstruct.text.split("#ifndef REFSTRUCT_CHECKED").length, 2);
assert.equal(refstruct.text.split("if (!pool->uninited) {").length, 2);
const patchedRefstruct = refstruct.text.replace("#ifndef REFSTRUCT_CHECKED", policyInclude + "#ifndef REFSTRUCT_CHECKED")
  .replace("if (!pool->uninited) {", "if (!pool->uninited && !(pool->pool_flags & WITHIN_MPEG2_POOL_UNCACHED)) {");
assert.equal(sha(patchedRefstruct), "e31af1df1e6e7b60b9112e2fcd22917664bc365d65db6c1d2b7038f5d532e084");
assert.equal(refs.text.match(/av_refstruct_pool_get\(/g).length, 2);
const frameBegin = refs.text.indexOf("static HEVCFrame *alloc_frame("), frameEnd = refs.text.indexOf("int ff_hevc_set_new_ref", frameBegin);
assert.ok(frameBegin >= 0 && frameEnd > frameBegin);
const frame = refs.text.slice(frameBegin, frameEnd);
assert.equal(frame.match(/av_refstruct_pool_get\(/g).length, 2);
assert.ok(frame.indexOf("l->tab_mvf_pool") < frame.indexOf("l->rpl_tab_pool"));
assert.ok(refstruct.text.includes("av_malloc(size + REFCOUNT_OFFSET)"));
assert.ok(refstruct.text.includes("ret = av_refstruct_alloc_ext(pool->size, pool->entry_flags, pool,"));
assert.ok(decoder.text.includes("av_refstruct_pool_alloc(min_pu_size * sizeof(MvField), 0)"));
assert.ok(decoder.text.includes("av_refstruct_pool_alloc(ctb_count   * sizeof(RefPicListTab), 0)"));
const sourcePath = "scripts/audit-mpeg2-late-refstruct-source.mjs";
const report = {
  recordedAt: new Date().toISOString(), status: "verified-pinned-source-late-refstruct-callpath-audit-not-runtime-fix",
  input: { path: "evidence/mpeg2-quiesced-budget-terminal-analysis-2026-10-08.json", bytes: analysisBytes.length, sha256: sha(analysisBytes) },
  upstream: upstream.map(record => ({ file: record.file, url: record.url, bytes: record.bytes, sha256: record.sha256 })),
  candidateManifest: { path: manifestPath, bytes: manifestBytes.length, sha256: sha(manifestBytes) },
  allActualCandidateSourcePinsVerified: true, patchedRefstructSha256: sha(patchedRefstruct),
  actualAbortCallpath: proof.actualStackSymbols[0],
  verifiedStaticFacts: {
    allocFrameHasExactlyTwoPoolGetSites: true, poolNamesInSourceOrder: ["tab_mvf", "rpl_tab"],
    refstructFreshAllocationRequestsPayloadPlusRefcountHeader: true,
    freshAllocationRunsWhenNoReusableEntryWasReturned: true,
    pinnedPrivatePolicyChangesFinalReferenceIdleAdmissionOnly: true,
    sourcePixelDimensionsAndLiveReferenceRulesNotChanged: true,
  },
  runtimeUnknowns: { actualFailedPool: null, failedIndividualAllocationBytes: null,
    livePoolEntryCountsAtLateFailure: null, cachedPoolEntryCountsAtLateFailure: null,
    heapLiveBytes: null, largestFreeBlockBytes: null, fragmentationProven: false },
  earlierEvidenceIsNotThisLateState: "The earlier 48-event observer stopped near initial frames and cannot supply pool counts or allocation size at frame106112 in this different split binary.",
  rejectedInspection: { tool: "installed @webassemblyjs/wasm-parser1.14.1", scope: "single extracted function, no Wasm execution or media", error: "Unexpected instruction: 0xfd (SIMD)",
    callsiteMappingVerified: false, noOpcodeSubstringGuessUsed: true, installedDependenciesChanged: false },
  next: "Use a bounded late-failure-capable request/pool/allocator snapshot, not the exhausted first48-event observer. Verify a SIMD-capable disassembler before mapping the actual caller offset to either source site. Preserve fixed32+16MiB and all source, quality, timing, memory, privacy and cleanup gates.",
  sourcePins: { [sourcePath]: sha(await readFile(path.join(root, sourcePath))) },
  generatedSourceFilesCreated: 0, temporaryFilesCreated: 0, originalRead: false,
  browserConversionsPerformed: 0, nativeConverterUsed: false, noDocker: true,
  productionSourceChanged: false, heapLimitRaised: false, liveReferencesRemoved: false,
  runtimeFixImplemented: false, publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null,
};
const json = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 32768);
await writeFile(path.join(root, "evidence/mpeg2-late-refstruct-source-audit-2026-10-08.json"), json, { flag: "wx" });
console.log(JSON.stringify({ status: report.status, upstream: report.upstream, runtimeUnknowns: report.runtimeUnknowns }));

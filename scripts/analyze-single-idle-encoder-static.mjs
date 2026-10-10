// Exact terminal disassembly join; no converter, compiler, browser or retry.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proofPath = "evidence/2026-10-10T09-39-02-488Z-single-idle-encoder-stack-static.json", proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
assert.equal(proof.failure, null); assert.equal(proof.cleanup.runtimeRemoved, true); assert.equal(proof.cleanup.originalBinaryUnchanged, true);
const archive = await read(proof.archivedFunctions.path); assert.equal(sha(archive), proof.archivedFunctions.sha256);
const restored = gunzipSync(archive, { maxOutputLength: 8388608 }); assert.equal(sha(restored), proof.archivedFunctions.restoredSha256);
const functions = JSON.parse(restored), binary = await read(proof.inspection.binary.path);
assert.equal(sha(binary), proof.inspection.binary.sha256);
const contexts = functions.listing.map(frame => {
  const lines = frame.originalListing.split("\n"), pc = Number(frame.codeOffset);
  const at = lines.findIndex(line => { const match = /^\s*([0-9a-f]+):/.exec(line); return match && parseInt(match[1], 16) === pc; });
  assert.ok(at >= 0, "Actual stack PC must match an original instruction address, not a shifted slice offset");
  const opcode = lines[at].split("|")[1]?.trim(); assert.ok(opcode?.startsWith("call"));
  return { functionIndex: frame.functionIndex, actualCodeOffset: frame.codeOffset, actualInstruction: opcode,
    context: lines.slice(Math.max(0, at - 12), at + 3), functionNameFromActualBinary: null };
});
const plane = contexts.find(row => row.functionIndex === 75); assert.equal(plane.actualInstruction, "call 350");
assert.match(plane.context.join("\n"), /i32\.load 2 76/);
const growth = contexts.find(row => row.functionIndex === 486);
assert.equal(growth.actualInstruction, "call 29 <env.emscripten_resize_heap>");
const dispatch = contexts.find(row => row.functionIndex === 68); assert.match(dispatch.actualInstruction, /^call_indirect/);
const patchPath = "media/ffmpeg/patches/mpeg2-encoder-uncached-frame-buffers.patch", patch = await read(patchPath);
const manifestPath = "work/mpeg2-single-idle-37986418102/build-manifest.json", manifest = JSON.parse(await read(manifestPath));
assert.equal(sha(patch), manifest.sources[patchPath]);
assert.match(patch.toString(), /size_t buffer_size\[4\]/); assert.match(patch.toString(), /av_buffer_allocz\(pool->buffer_size\[i\]\)/);
const zeroed = functions.selected.find(row => row.functionIndex === 350);
assert.match(zeroed.text, /call \$analysis_index_414/); assert.match(zeroed.text, /memory\.fill/);
const layout = [{ field: "pools[4]", bytes: 16 }, { field: "format", bytes: 4 }, { field: "width,height", bytes: 8 },
  { field: "stride_align[8]", bytes: 32 }, { field: "linesize[4]", bytes: 16 }];
assert.equal(layout.reduce((total, row) => total + row.bytes, 0), 76);
const output = "evidence/single-idle-encoder-static-analysis-2026-10-10.json";
const analysis = { recordedAt: new Date().toISOString(), status: "source-informed-first-encoder-plane-allocation-path-not-dynamic-capacity-or-fix",
  proof: { path: proofPath, sha256: sha(proofBytes) }, actualBinarySha256: sha(binary),
  actualFrames: contexts, all12PcsMatchedOriginalInstructionAddresses: true,
  explicitGrowthImportObserved: true, indirectCodecDispatchObserved: true, unavailableDebugNamesRemainNull: true,
  sourceInformedIdentification: { inferred: true, notDebugSymbolCertification: true,
    function75: "avcodec_default_get_buffer2 with inlined video_get_buffer", function350: "av_buffer_allocz",
    failingRequestSource: "FramePool.buffer_size[0], first encoder pixel plane under the actual uncached-plane patch",
    evidence: "Exact0x9501 i32.load offset76 followed by call350; actual patch adds buffer_size immediately after linesize; zeroing buffer wrapper calls allocator414 then memory.fill",
    wasm32FramePoolPrefixLayout: layout, bufferSizeZeroOffset: 76, patch: { path: patchPath, sha256: sha(patch), matchesActualBuildManifest: true },
    pinnedPrimarySources: ["https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavcodec/get_buffer.c", "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavutil/buffer.c"],
    failedIndividualAllocationBytes: null, actualFramePoolPointer: null, encoderLiveHeapBytes: null, largestFreeBlockBytes: null,
    fragmentationProven: false, packetReserveIdentifiedAsFailedAllocation: false, decoderPoolCauseClaim: false },
  productionFix: false, fullVideoAcceptance: false, speedImprovementProven: false, publicAcceptance: false,
  conversions: 0, originalWasmFunctionsExecuted: 0, originalVideoRead: false,
  next: "Investigate a bounded single-idle encoder pixel-plane pool retaining only fully unreferenced planes, zeroing every reused acquisition and preserving original strides/padding/codec reference counts. Prove actual compiled ownership/capacity and identical browser goldens before any full-original retest. Do not raise heaps or assume fragmentation proven.",
  analyzerSha256: sha(await read("scripts/analyze-single-idle-encoder-static.mjs")) };
await writeFile(path.join(root, output), JSON.stringify(analysis, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, originalPcsMatched: contexts.length, sourceInformedPlaneIdentification: true, dynamicAllocationBytes: null, productionFix: false }));

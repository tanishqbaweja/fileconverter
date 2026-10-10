import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { createAnonymousIndexFunctionSlice } from "../scripts/lib/wasm-anonymous-index-slice.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proofPath = "evidence/2026-10-10T09-39-02-488Z-single-idle-encoder-stack-static.json", proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
async function restore(row) {
  const bytes = await read(row.path); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
  const data = gunzipSync(bytes, { maxOutputLength: 8388608 }); assert.equal(data.length, row.restoredBytes); assert.equal(sha(data), row.restoredSha256); return data;
}
test("Actual12 encoder stack bodies/PCs preserved from unchanged anonymous binary, without decoder symbols or any codec/browser execution", async () => {
  assert.equal(proof.failure, null); assert.equal(proof.originalVideoRead, false);
  for (const field of ["browserLaunches", "conversions", "originalWasmFunctionsExecuted"]) assert.equal(proof[field], 0);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.productionFix, false);
  const binary = await read(proof.inspection.binary.path); assert.equal(sha(binary), "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  const functions = JSON.parse(await restore(proof.archivedFunctions)), indices = new Set(functions.selected.map(row => row.functionIndex));
  const slice = createAnonymousIndexFunctionSlice(binary, indices); assert.equal(slice.preservedFunctions, 12);
  assert.equal(sha(slice.binary), proof.inspection.functionSlice.sha256);
  for (const row of functions.selected) {
    assert.equal(row.functionNameFromActualBinary, null); assert.equal(row.labelIsSynthetic, true);
    assert.equal(sha(binary.subarray(row.bodyStart, row.bodyEnd)), row.originalBodySha256);
    assert.equal(sha(row.text), row.textSha256);
  }
  for (const row of functions.listing) assert.equal(sha(row.originalListing), row.originalListingSha256);
  assert.equal(proof.inspection.callChain.filter(row => row.directCallToObservedInnerFrame === true).length, 10);
  assert.equal(proof.inspection.callChain.find(row => row.functionIndex === 68).directCallToObservedInnerFrame, false);
});
test("Actual streamed collector fixes only static-tool output retention, preserves first failure/source and removes temporary tool/runtime", async () => {
  const collection = proof.inspection.disassemblyCollection;
  assert.equal(collection.streamedBytes, 14625748); assert.equal(collection.retainedBytes, 1035229);
  assert.equal(collection.discardedBytes, 13590519); assert.equal(collection.limits.retainedBytes, 8388608);
  assert.equal(proof.cleanup.runtimeRemoved, true); assert.equal(proof.cleanup.originalBinaryUnchanged, true);
  await assert.rejects(access(proof.ownedRuntime), { code: "ENOENT" });
  for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), digest);
  const frozen = JSON.parse(await read("evidence/single-idle-encoder-stack-first-failure-2026-10-10.json"));
  const failureBytes = await read(frozen.proof.path), failed = JSON.parse(failureBytes);
  assert.equal(sha(failureBytes), frozen.proof.sha256); assert.match(failed.failure, /STDIO_MAXBUFFER/);
  assert.equal(frozen.failureRemainsFailed, true); assert.equal(failed.archivedFunctions, null);
  assert.equal(sha(await restore(frozen.exactExecutedAudit)), failed.sourcePins["scripts/audit-single-idle-encoder-stack.mjs"]);
  assert.equal(frozen.ownSourceSha256, sha(await read("scripts/freeze-encoder-stack-first-failure.mjs")));
});
test("Exact PC joins identify explicit growth import and indirect dispatch; first-plane source identification remains inference with unknown live values", async () => {
  const analysis = JSON.parse(await read("evidence/single-idle-encoder-static-analysis-2026-10-10.json"));
  assert.equal(analysis.proof.sha256, sha(proofBytes)); assert.equal(analysis.all12PcsMatchedOriginalInstructionAddresses, true);
  assert.equal(analysis.actualFrames.find(row => row.functionIndex === 75).actualInstruction, "call 350");
  assert.equal(analysis.actualFrames.find(row => row.functionIndex === 486).actualInstruction, "call 29 <env.emscripten_resize_heap>");
  assert.match(analysis.actualFrames.find(row => row.functionIndex === 68).actualInstruction, /^call_indirect/);
  const inferred = analysis.sourceInformedIdentification; assert.equal(inferred.inferred, true); assert.equal(inferred.notDebugSymbolCertification, true);
  assert.equal(inferred.bufferSizeZeroOffset, 76); assert.equal(inferred.patch.matchesActualBuildManifest, true);
  for (const field of ["failedIndividualAllocationBytes", "actualFramePoolPointer", "encoderLiveHeapBytes", "largestFreeBlockBytes"]) assert.equal(inferred[field], null);
  assert.equal(inferred.fragmentationProven, false); assert.equal(analysis.productionFix, false); assert.equal(analysis.fullVideoAcceptance, false);
  assert.equal(analysis.analyzerSha256, sha(await read("scripts/analyze-single-idle-encoder-static.mjs")));
});

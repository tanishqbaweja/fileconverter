import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { PINNED_DLMALLOC_ROOT, PINNED_SPLIT_DECODER_SHA256 } from "../scripts/lib/dlmalloc-free-header-inspection.mjs";
const root = new URL("../", import.meta.url), read = file => readFile(new URL(file, root));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const layout = JSON.parse(await read("evidence/split-dlmalloc-static-layout-2026-10-06.json"));
const proof = JSON.parse(await read("evidence/split-free-headers-measured-2026-10-06.json"));
test("Pinned binary layout derives from exact preserved static bodies, not a media derivative", async () => {
  assert.equal(layout.actualBinary.sha256, PINNED_SPLIT_DECODER_SHA256); assert.equal(layout.allocatorRootAddress, PINNED_DLMALLOC_ROOT);
  assert.equal(layout.analysisOnlySlice.preservedOriginalBodyCount, 3); assert.equal(layout.analysisOnlySlice.unreachableReplacementCount, 4607);
  assert.equal(layout.analysisOnlySlice.selectedBodyBytesUnchanged, true); assert.equal(layout.analysisOnlySlice.originalIndicesTypesAndNamesPreserved, true);
  assert.equal(layout.analysisOnlySlice.instantiated, false); assert.equal(layout.analysisOnlySlice.usedForMediaOrBrowser, false);
  for (const field of ["originalFileUsed", "conversionsPerformed", "wasmFunctionsExecuted", "allocatorFreeSpaceMeasured", "liveFramesMeasured"])
    assert.equal(layout[field], ["conversionsPerformed", "wasmFunctionsExecuted"].includes(field) ? 0 : false);
  assert.match(layout.rejectedWholeModuleText.failure, /Static disassembly cap/);
  assert.equal(layout.rejectedWholeModuleText.cleanup.runtimeRemoved, true); assert.equal(layout.runtimeAndDisassemblerCacheRemoved, true);
  for (const field of ["smallmap", "treemap", "dvsize", "topsize", "smallbins", "treebins", "segment", "mutex"])
    assert.equal(layout.allocatorLayoutReferences[field].referencedInActualFunction, true);
  for (const [file, digest] of Object.entries(layout.sourcePins)) assert.equal(sha(await read(file)), digest, file);
});
test("Actual failure has aggregate free space but lacks the aligned temporary chunk; no fake acceptance", async () => {
  assert.equal(proof.actualNativeCoreSha256, PINNED_SPLIT_DECODER_SHA256);
  assert.equal(proof.allocator.totalFreeChunkBytes, 8940352); assert.equal(proof.allocator.largestFreeChunkBytes, 1597472);
  assert.equal(proof.allocator.freeChunks, 241); assert.equal(proof.allocator.headerWordsRead, 889);
  const analysis = proof.alignmentAnalysis;
  assert.equal(analysis.requestedPlaneBytes, 1597463); assert.equal(analysis.plainChunkBytes, 1597472);
  assert.equal(analysis.alignedTemporaryMallocRequestBytes, 1597500); assert.equal(analysis.alignedTemporaryChunkBytes, 1597504);
  assert.equal(analysis.temporaryChunkShortfallBytes, 32); assert.equal(analysis.dynamicFragmentationAtAbortProven, true);
  assert.equal(analysis.successfulAlignmentPreservingReuseProven, false);
  assert.equal(proof.allocator.bins.reduce((sum, bin) => sum + bin.bytes, 0) + proof.allocator.designatedVictimBytes + proof.allocator.topChunkBytes, 8940352);
  for (const field of ["publicAcceptance", "completeChromiumMemoryAcceptance", "completedConversion", "comparableSpeedBenchmark", "liveFrameOwnershipMeasured"])
    assert.equal(proof[field], false);
  assert.equal(proof.liveFrameCount, null); assert.equal(proof.independentValidation, null);
  assert.equal(proof.nativeEncoderOwnership[0].frames, 243); assert.equal(proof.nativeEncoderOwnership[0].closed, true);
  assert.equal(proof.incrementalPrivateMiBIncomplete, (proof.completeChromiumPeak.privateBytes - proof.blankBaseline.privateBytes) / 1048576);
  assert.equal(proof.completeChromiumPeak.processes.reduce((sum, process) => sum + process.privateBytes, 0), proof.completeChromiumPeak.privateBytes);
  assert.equal(proof.original.bytes, 2958573265); assert.equal(proof.original.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.cleanup.errors, undefined); assert.equal(proof.independentlyVerifiedRuntimeAndPidAbsence, true);
  for (const value of Object.values(proof.cleanup).filter(value => typeof value === "boolean")) assert.equal(value, true);
  for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), digest, file);
  assert.equal(sha(await read(proof.staticLayout.path)), proof.staticLayout.sha256);
  assert.equal(sha(await read(proof.priorActualSizeLocals.path)), proof.priorActualSizeLocals.sha256);
});

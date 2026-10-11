// Current-source witnesses for static proof and pending bounded decoder candidate.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmFunctionMetadata } from "../scripts/lib/wasm-function-metadata.mjs";
import { deriveAlignment16FirstMallocCapacity } from "../scripts/lib/alignment16-first-malloc-capacity.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
async function pins(proof, count) {
  assert.equal(Object.keys(proof.sourcePins).length, count); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(proof.sourcePreimages[file].data, "base64")), hash, file);
  }
}
async function restore(record) {
  const zipped = await read(record.path); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: 8388608 }); assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
  return JSON.parse(bytes);
}
test("actual bounded static collector retains all7 sources and four actual binary bodies/PCs without instantiating them", async () => {
  const bytes = await read("evidence/alignment16-malloc-static-executed-sources-2026-10-12.json"), proof = JSON.parse(bytes);
  assert.equal(sha(bytes), "d3642d61794c8f343fcdb90c4be4fe257bb549a9c141171605677bfef7274b79"); await pins(proof, 7);
  assert.equal(proof.failure, null); assert.equal(proof.originalFunctionsExecuted, 0); assert.equal(proof.mediaConversions, 0);
  assert.equal(sha(proof.recipe.generated), proof.recipe.generatedSha256); assert.equal(proof.ownedWrapperAbsent, true);
  const flowBytes = await read(proof.receipt.path); assert.equal(sha(flowBytes), proof.receipt.sha256); const flow = JSON.parse(flowBytes);
  assert.equal(flow.failure, null); assert.equal(flow.inspection.instantiated, false); assert.equal(flow.cleanup.originalBinaryUnchanged, true);
  assert.equal(flow.cleanup.runtimeCacheAndToolRemoved, true); await assert.rejects(access(flow.cleanup.runtimeDirectory), { code: "ENOENT" });
  const archive = await restore(flow.inspection.archive), binary = await read(flow.inspection.binary.path);
  assert.equal(sha(binary), "417182a9ed0f5e19e77c5248545c80265b87abd477984872d9ccf4094d8b1014");
  const metadata = readWasmFunctionMetadata(binary, new Set(archive.functions.map(row => row.name)));
  assert.equal(metadata.length, 4);
  for (const row of archive.functions) {
    assert.deepEqual(metadata.find(entry => entry.name === row.name), row.originalMetadata);
    assert.equal(sha(binary.subarray(row.originalMetadata.bodyStart, row.originalMetadata.bodyEnd)), row.originalBodySha256); assert.equal(sha(row.text), row.textSha256);
  }
  assert.equal(flow.inspection.actualFatalCall.originalOffsetHex, "0x606d5f");
});
test("actual first-malloc capacity rejoins all3 sources, compiled400KB normalization and source-informed third plane without asserting a fix", async () => {
  const bytes = await read("evidence/alignment16-first-malloc-capacity-2026-10-12.json"), proof = JSON.parse(bytes);
  assert.equal(sha(bytes), "02abb51154e94226f6d299c4a040a733098901de349be1035b0ec586300b3c98"); await pins(proof, 3);
  const flow = JSON.parse(await read(proof.flow.path)), terminal = JSON.parse(await read(proof.terminal.path)), archive = await restore(proof.selectedArchive);
  const result = deriveAlignment16FirstMallocCapacity({ wrapperText: archive.functions.find(row => row.name === "__wrap_posix_memalign").text,
    allocatorText: archive.functions.find(row => row.name === "emscripten_builtin_malloc").text,
    frameText: archive.functions.find(row => row.name === "avcodec_default_get_buffer2").text,
    fatalInstruction: flow.inspection.actualFatalCall.originalInstruction, frameInstructionContext: proof.frameInstructionContext,
    failure: terminal.result.failedAllocation, getBufferSource: proof.reconstructedExecutedSource.generated });
  assert.deepEqual(result, proof.result); assert.equal(result.derivedAllocatorChunkBytes, 399392); assert.equal(result.contiguousTailShortfallBytes, 15680);
  assert.equal(result.whyHeapFragmentedProven, false); assert.equal(result.retainedLiveInventoryKnown, false); assert.equal(result.runtimeFixProven, false);
});
test("actual10-source decoder plane preparation preserves exact built pool primitive and is NOT a compiled/browser/memory/speed result", async () => {
  const bytes = await read("evidence/hevc-plane-source-preflight-2026-10-12.json"), proof = JSON.parse(bytes);
  assert.equal(sha(bytes), "90464468a1b93608454b39fa82ea7cb7872013a87c419cb569b2969a8a70a312"); await pins(proof, 10);
  const archive = await restore(proof.archive);
  assert.equal(sha(archive.generatedGet), proof.generatedGetSha256); assert.equal(sha(archive.generatedBuffer), proof.generatedBufferSha256);
  assert.equal(archive.generatedBuffer, (await read("work/mpeg2-encoder-planes-38044000567/encoder-plane-buffer.c")).toString());
  assert.equal(sha(archive.executedDecoderGet), "910da6292a78066b114da7d26c7c1684969022960efc8becf116dc2b5acc4ab4");
  assert.equal(proof.policy.maximumIdleEntriesPerSelectedPool, 1); assert.equal(proof.policy.liveReferencesChanged, false);
  assert.equal(proof.policy.codecSettingsChanged, false); assert.equal(proof.policy.decoderHeapRaised, false); assert.equal(proof.policy.fixed32MiBDecoderFitProven, false);
  assert.equal(proof.policy.privateFramePoolFieldAddedBytes, 4);
  for (const field of ["decoderBuildExecuted", "newCompiledLifecycleExecuted", "originalVideoRead", "publicAcceptance", "speedGainProven"]) assert.equal(proof[field], false);
  assert.equal(proof.browserLaunches, 0); assert.equal(proof.conversions, 0);
});

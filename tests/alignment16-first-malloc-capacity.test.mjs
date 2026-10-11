import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { reconstructExecutedHevcGetBuffer, deriveAlignment16FirstMallocCapacity } from "../scripts/lib/alignment16-first-malloc-capacity.mjs";
const root = path.resolve(import.meta.dirname, "..");
async function inputs() {
  const read = file => readFile(path.join(root, file)), flow = JSON.parse(await read("evidence/2026-10-11T22-32-09-935Z-alignment16-malloc-static.json"));
  const archive = JSON.parse(gunzipSync(await read(flow.inspection.archive.path), { maxOutputLength: 8388608 }));
  const terminal = JSON.parse(await read(flow.input.path));
  const reconstruction = reconstructExecutedHevcGetBuffer((await read("work/mpeg2-encoder-planes-38044000567/encoder-plane-get-buffer.c")).toString());
  return { wrapperText: archive.functions.find(row => row.name === "__wrap_posix_memalign").text,
    allocatorText: archive.functions.find(row => row.name === "emscripten_builtin_malloc").text,
    frameText: archive.functions.find(row => row.name === "avcodec_default_get_buffer2").text,
    fatalInstruction: flow.inspection.actualFatalCall.originalInstruction,
    frameInstructionContext: archive.listing.listings.find(row => row.functionIndex === 709).text,
    failure: terminal.result.failedAllocation, getBufferSource: reconstruction.generated };
}
test("actual first request normalizes399392B and cannot fit any captured free chunk or even optimistic top+tail", async () => {
  const result = deriveAlignment16FirstMallocCapacity(await inputs());
  assert.equal(result.actualMallocArgumentBytes, 399383); assert.equal(result.derivedAllocatorChunkBytes, 399392);
  assert.equal(result.freeChunkShortfallBytes, 185664); assert.equal(result.contiguousTailUpperBoundBytes, 383712); assert.equal(result.contiguousTailShortfallBytes, 15680);
  assert.equal(result.actualCompiledRequestedSizeFieldOffset, 84); assert.equal(result.sourceInformedPlaneIndex, 2);
  assert.equal(result.fragmentedFreeCapacityForThisFirstMallocProven, true); assert.equal(result.whyHeapFragmentedProven, false);
  assert.equal(result.runtimeFixProven, false); assert.equal(result.publicAcceptance, false);
});
test("capacity rejects old8-byte normalization, fallback failure, changed field/PC/request and wrong source", async () => {
  const value = await inputs();
  for (const mutate of [copy => { copy.allocatorText = copy.allocatorText.replace("i32.const -16", "i32.const -8"); },
    copy => { copy.failure.phase = "upstream-alignment-pending"; }, copy => { copy.failure.failedIndividualAllocationBytes = null; },
    copy => { copy.frameInstructionContext = copy.frameInstructionContext.replace("11b20b:", "11b20c:"); },
    copy => { copy.getBufferSource += " "; }]) {
    const copy = structuredClone(value); mutate(copy); assert.throws(() => deriveAlignment16FirstMallocCapacity(copy));
  }
});

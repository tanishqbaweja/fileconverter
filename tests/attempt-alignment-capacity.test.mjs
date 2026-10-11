import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { deriveAttemptAlignmentCapacity } from "../scripts/lib/attempt-alignment-capacity.mjs";
const root = path.resolve(import.meta.dirname, "..");
async function input() {
  const flow = JSON.parse(await readFile(path.join(root, "evidence/2026-10-11T17-14-33-847Z-attempt-alignment-static.json")));
  const archive = JSON.parse(gunzipSync(await readFile(path.join(root, flow.inspection.archive.path))));
  const terminal = JSON.parse(await readFile(path.join(root, flow.input.path)));
  return { wrapperText: archive.functions.find(row => row.name === "__wrap_posix_memalign").text,
    allocatorText: archive.functions.find(row => row.name === "emscripten_builtin_malloc").text,
    fatalInstruction: flow.inspection.actualFatalCall.originalInstruction, failure: terminal.result.failedAllocation };
}
test("actual current second-malloc/C-slot/header join derives8-byte fallback shortfall, not unknown live-state or a validated fix", async () => {
  const facts = deriveAttemptAlignmentCapacity(await input());
  assert.equal(facts.wrapperRequestedBytes, 1597463); assert.equal(facts.ordinaryChunkBytes, 1597472);
  assert.equal(facts.derivedInternalMallocArgumentBytes, 1597500); assert.equal(facts.derivedInternalChunkBytes, 1597504);
  assert.equal(facts.largestCapturedFreeChunkBytes, 1597496); assert.equal(facts.capturedChunkShortfallBytes, 8);
  assert.equal(facts.contiguousTailUpperBoundBytes, 1067392); assert.equal(facts.fragmentedFreeCapacityForThisFallbackProven, true);
  assert.equal(facts.whyHeapFragmentedProven, false); assert.equal(facts.newAlignmentPolicyWorksProven, false); assert.equal(facts.originalSlotInternalRequestStillNull, true);
});
test("capacity proof rejects stale PC/phase, invented observed internal bytes and modified native normalization or sufficient contiguous capacity", async () => {
  const original = await input();
  for (const change of [v => { v.fatalInstruction = "call 4435 <emscripten_builtin_malloc>"; }, v => { v.failure.phase = "fast-malloc-pending"; },
    v => { v.failure.failedIndividualAllocationBytes = 1597500; }, v => { v.wrapperText = v.wrapperText.replace("i32.const 28", "i32.const 32"); },
    v => { v.failure.allocatorFreeBlocks.largestFreeChunkBytes = 1597504; }, v => { v.failure.allocatorFreeBlocks.topChunkBytes = 2000000; }]) {
    const invalid = structuredClone(original); change(invalid); assert.throws(() => deriveAttemptAlignmentCapacity(invalid));
  }
});

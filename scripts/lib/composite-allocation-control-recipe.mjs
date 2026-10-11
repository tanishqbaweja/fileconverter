// Additive browser/caller derivations; existing74-source witness is immutable.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeAllocationAttemptBrowserFactory } from "./allocation-attempt-control-recipe.mjs";
const addedFiles = ["scripts/lib/composite-allocation-abort-capture.mjs", "scripts/lib/composite-allocation-abort-adapter.mjs",
  "scripts/lib/composite-allocation-control-recipe.mjs", "scripts/check-composite-allocation-abort-control.mjs", "tests/composite-allocation-abort.test.mjs"];
function exact(source, edits) {
  let generated = source;
  for (const [before, after, count = 1] of edits) { assert.ok(before && after, "Reversible edits need nonempty anchors"); assert.equal(generated.split(before).length - 1, count, before); generated = generated.replaceAll(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replaceAll(after, before);
  assert.equal(reverse, source, "Only enumerated integration/evidence edits; all safety/ownership/IO/privacy gates retained");
  return { generated, generatedSha256: sha(generated), edits };
}
export function makeCompositeAllocationControlBrowserFactory(source) {
  const previous = makeAllocationAttemptBrowserFactory(source);
  const edits = [
    ["createAllocationAttemptAbortCapture", "createCompositeAllocationAbortCapture", 2],
    ['from "/allocation-attempt-abort-capture.mjs";', 'from "/composite-allocation-abort-capture.mjs";'],
    ['qualifiedBinarySha256:${JSON.stringify(DIRECT_BUFFER_DECODER_SHA256)},actualAllocatorRoot:1786648,\n  avBufferAlloczFunctionIndex:4188,avMallocFunctionIndex:4312,builtinMallocFunctionIndex:4436',
      'qualifiedBinarySha256:${JSON.stringify(DIRECT_BUFFER_DECODER_SHA256)}'],
    ["assert.equal(terminal.emitted.poolRequest,null);", "assert.equal(terminal.emitted.latePoolRequest,null);\n  assert.equal(terminal.emitted.qualifiedPoolCallPath,false);assert.equal(terminal.emitted.validatedScalarWords,16);"],
    ['"bounded-wasm-abort-capture.mjs","dlmalloc-free-header-inspection.mjs","allocation-attempt-abort-capture.mjs"',
      '"bounded-wasm-abort-capture.mjs","dlmalloc-free-header-inspection.mjs","allocation-attempt-abort-capture.mjs","composite-allocation-abort-capture.mjs","late-refstruct-abort-snapshot.mjs"'],
    ["allocation-attempt-abort-control", "composite-allocation-abort-control", 4],
    ["tests/composite-allocation-abort-control.test.mjs", "tests/allocation-attempt-abort-control.test.mjs"],
    ["export const allocationAttemptControlFiles = [", "export const allocationAttemptControlFiles = [" + addedFiles.map(file => JSON.stringify(file) + ",").join("")],
  ];
  return { ...exact(previous.generated, edits), previousFactorySha256: previous.generatedSha256, publicAcceptance: false };
}
export function makeCompositeAllocationControlCaller(source, root) {
  assert.equal(sha(source), "c8d4a80f0fa3278d8e31cd1e1dc53802d387acbfce392fc992e09e0dbd6bfba7");
  const edits = [
    ['const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));',
      `const root = ${JSON.stringify(root)}, read = file => readFile(path.join(root, file));`],
    ['import { makeAllocationAttemptExportRecipe, makeAllocationAttemptBrowserFactory } from "./lib/allocation-attempt-control-recipe.mjs";',
      'import { makeAllocationAttemptExportRecipe } from "./lib/allocation-attempt-control-recipe.mjs";\nimport { makeCompositeAllocationControlBrowserFactory as makeAllocationAttemptBrowserFactory } from "./lib/composite-allocation-control-recipe.mjs";'],
    ['const allocator = mapSymbol("_gm_", 496), slot = mapSymbol("within_allocator_attempt_words", 64);',
      'const allocator = mapSymbol("_gm_", 496), slot = mapSymbol("within_allocator_attempt_words", 64), poolSlot = mapSymbol("within_refstruct_abort_words", 64);\nassert.equal(poolSlot.address, 1918800);'],
    ["hevc_receive_frame: 1981, sbrk: 4441", "hevc_receive_frame: 1981, sbrk: 4441, av_refstruct_pool_get: 4380"],
    ["allocator, slot, functions };", "allocator, slot, poolSlot, functions };"],
    ['"allocation-attempt-control-caller-"', '"composite-allocation-control-caller-"'],
    ["allocation-attempt-abort-control", "composite-allocation-abort-control", 3],
  ];
  const first = exact(source, edits);
  const imports = [];
  for (const match of first.generated.matchAll(/from "(\.\/lib\/[^"\r\n]+)"/g))
    imports.push([match[0], `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", match[1])).href)}`]);
  return { ...exact(first.generated, imports), initialEdits: edits, previousCallerSha256: sha(source), publicAcceptance: false };
}

import assert from "node:assert/strict";
import test from "node:test";
import { readAnonymousIndexFunctionMetadata, createAnonymousIndexFunctionSlice } from "../scripts/lib/wasm-anonymous-index-slice.mjs";
const binary = new Uint8Array([0,97,115,109,1,0,0,0,1,6,1,96,1,127,1,127,3,3,2,0,0,10,11,2,4,0,32,0,11,4,0,32,0,11]);
test("Anonymous actual function indices map exact signatures/extents while synthetic labels remain explicitly non-symbolic", () => {
  const before = binary.slice(), metadata = readAnonymousIndexFunctionMetadata(binary, new Set([1]));
  assert.deepEqual(metadata, [{ functionIndex: 1, params: ["i32"], results: ["i32"], bodyStart: 30, bodyEnd: 34,
    functionNameFromActualBinary: null, analysisLabel: "analysis_index_1", labelIsSynthetic: true }]);
  assert.deepEqual(binary, before);
});
test("Index slice preserves actual selected body/index/type without executing it or advertising synthetic labels as native names", () => {
  const before = binary.slice(), sliced = createAnonymousIndexFunctionSlice(binary, new Set([1]));
  assert.equal(sliced.preservedFunctions, 1); assert.equal(sliced.unreachableReplacements, 1);
  assert.equal(sliced.instantiated, false); assert.equal(sliced.usedForBrowserOrMedia, false);
  assert.equal(sliced.originalSelectedBodyBytesUnchanged, true); assert.equal(sliced.originalHasDebugNames, false);
  assert.deepEqual(binary, before); assert.equal(WebAssembly.validate(sliced.binary), true);
});
test("Anonymous index audit rejects malformed, missing, imported or over-cap selections and refuses existing genuine debug names", () => {
  for (const indices of [new Set(), new Set([2]), new Set([-1]), new Set([1.1]), new Set(Array.from({ length: 33 }, (_, i) => i))])
    assert.throws(() => createAnonymousIndexFunctionSlice(binary, indices));
  assert.throws(() => createAnonymousIndexFunctionSlice(binary.slice(0, 25), new Set([0])));
  const labeled = createAnonymousIndexFunctionSlice(binary, new Set([1])).binary;
  assert.throws(() => readAnonymousIndexFunctionMetadata(labeled, new Set([1])), /Anonymous actual binary required/);
  const imported = new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,2,7,1,1,109,1,102,0,0]);
  assert.equal(WebAssembly.validate(imported), true);
  assert.throws(() => createAnonymousIndexFunctionSlice(imported, new Set([0])));
});

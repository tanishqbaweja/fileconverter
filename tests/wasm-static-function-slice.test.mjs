import assert from "node:assert/strict";
import test from "node:test";
import { createStaticFunctionSlice } from "../scripts/lib/wasm-static-function-slice.mjs";
import { readWasmFunctionMetadata } from "../scripts/lib/wasm-function-metadata.mjs";
const fixture = new Uint8Array([0,97,115,109,1,0,0,0,1,6,1,96,1,127,1,127,3,3,2,0,0,10,11,2,4,0,32,0,11,4,0,32,0,11,
  0,19,4,110,97,109,101,1,12,2,0,4,116,101,115,116,1,3,111,117,116]);
test("Static slice keeps selected body/type/index/name byte-exact and stubs only other bodies", () => {
  assert.equal(WebAssembly.validate(fixture), true);
  const original = fixture.slice(), names = new Set(["test"]), result = createStaticFunctionSlice(fixture, names);
  assert.equal(result.preservedFunctions, 1); assert.equal(result.unreachableReplacements, 1); assert.equal(result.instantiated, false);
  assert.deepEqual(fixture, original);
  const before = readWasmFunctionMetadata(fixture, names)[0], after = readWasmFunctionMetadata(result.binary, names)[0];
  assert.equal(before.functionIndex, after.functionIndex); assert.deepEqual(before.params, after.params);
  assert.deepEqual(Buffer.from(fixture.subarray(before.bodyStart, before.bodyEnd)), result.binary.subarray(after.bodyStart, after.bodyEnd));
});
test("Invalid binary and absent selection cannot create a misleading slice", () => {
  assert.throws(() => createStaticFunctionSlice(fixture.slice(0, 25), new Set(["test"])));
  assert.throws(() => createStaticFunctionSlice(fixture, new Set(["absent"])));
});

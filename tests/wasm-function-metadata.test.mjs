import assert from "node:assert/strict";
import test from "node:test";
import { readWasmFunctionMetadata } from "../scripts/lib/wasm-function-metadata.mjs";
const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,6,1,96,1,127,1,127,3,2,1,0,10,6,1,4,0,32,0,11,
  0,14,4,110,97,109,101,1,7,1,0,4,116,101,115,116]);
test("Actual binary maps function identity, scalar signature and code extent without execution", () => {
  assert.equal(WebAssembly.validate(bytes), true);
  assert.deepEqual(readWasmFunctionMetadata(bytes, new Set(["test"])), [
    { functionIndex: 0, name: "test", params: ["i32"], results: ["i32"], bodyStart: 24, bodyEnd: 28 },
  ]);
  assert.throws(() => readWasmFunctionMetadata(bytes, new Set(["missing"])), /unavailable/);
});
test("Malformed actual binary cannot yield metadata", () => {
  assert.throws(() => readWasmFunctionMetadata(bytes.slice(0, 25), new Set(["test"])));
  assert.throws(() => readWasmFunctionMetadata(bytes, new Set(new Array(33).fill(0).map((_, i) => String(i)))), /cap/);
});

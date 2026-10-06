import assert from "node:assert/strict";
import test from "node:test";
import { readWasmFunctionNames, symbolizeWasmStack } from "../scripts/lib/wasm-stack-symbols.mjs";
const header = [0, 97, 115, 109, 1, 0, 0, 0];
const binary = payload => new Uint8Array([...header, 0, 5 + payload.length, 4, 110, 97, 109, 101, ...payload]);
test("Actual binary function names are bounded and missing, duplicate, corrupt metadata is rejected", () => {
  const names = readWasmFunctionNames(binary([1, 5, 1, 0, 2, 97, 98]));
  assert.equal(names.get(0), "ab");
  assert.throws(() => readWasmFunctionNames(new Uint8Array(header)));
  assert.throws(() => readWasmFunctionNames(binary([1, 9, 2, 0, 2, 97, 98, 0, 2, 97, 98])));
  assert.throws(() => readWasmFunctionNames(binary([1, 5, 1, 0, 3, 97, 98])));
});
test("Symbolized stack keeps code indices/offsets and unavailable names, with no guessed function", () => {
  const result = symbolizeWasmStack("at decoder.wasm:wasm-function[7]:0x123\nat wasm-function[8]:0xab", new Map([[7, "av_buffer_allocz"]]));
  assert.deepEqual(result, [{ functionIndex: 7, functionNameFromActualBinary: "av_buffer_allocz", codeOffset: "0x123" },
    { functionIndex: 8, functionNameFromActualBinary: null, codeOffset: "0xab" }]);
  assert.throws(() => symbolizeWasmStack("x".repeat(8193), new Map()));
});

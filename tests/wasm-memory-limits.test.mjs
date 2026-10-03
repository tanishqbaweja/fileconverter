import assert from "node:assert/strict";
import test from "node:test";
import { readWasmMemoryLimits } from "../scripts/lib/wasm-memory-limits.mjs";
const header = [0, 97, 115, 109, 1, 0, 0, 0];
test("actual Wasm memory metadata distinguishes fixed shared limits and rejects truncation", () => {
  assert.deepEqual(readWasmMemoryLimits(Uint8Array.from([...header, 5, 4, 1, 3, 2, 2])),
    [{ imported: false, shared: true, initialPages: 2, maximumPages: 2 }]);
  assert.deepEqual(readWasmMemoryLimits(Uint8Array.from([...header, 2, 8, 1, 1, 97, 1, 98, 2, 0, 2])),
    [{ imported: true, shared: false, initialPages: 2, maximumPages: null }]);
  assert.throws(() => readWasmMemoryLimits(Uint8Array.from([...header, 5, 4, 1, 3, 2])));
  assert.throws(() => readWasmMemoryLimits(Uint8Array.from([...header, 5, 4, 1, 3, 2, 1])));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const source = await readFile("lib/native-input-memory-observation.ts", "utf8"), exports = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports, SharedArrayBuffer, Math, Number, Error });
const observe = exports.observeNativeInputMemory;
test("a real Wasm backing buffer is measured before progress, not inferred from the bounded input slice", () => {
  const memory = new WebAssembly.Memory({ initial: 2, maximum: 4, shared: true }), metrics = {};
  observe(metrics, new Uint8Array(memory.buffer, 1024, 256), 4);
  assert.equal(metrics.wasmMemoryBytes, 131072); assert.equal(metrics.peakWasmMemoryBytes, 131072); assert.equal(metrics.sharedArrayBufferBytes, 131076);
  memory.grow(2); observe(metrics, new Uint8Array(memory.buffer, 0, 128), 4);
  assert.equal(metrics.wasmMemoryBytes, 262144); assert.equal(metrics.peakWasmMemoryBytes, 262144); assert.equal(metrics.sharedArrayBufferBytes, 262148);
});
test("observations preserve larger combined/native progress peaks and do not count non-shared Wasm as a SharedArrayBuffer", () => {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 }), metrics = {};
  observe(metrics, new Uint8Array(memory.buffer, 0, 256), 4);
  assert.equal(metrics.wasmMemoryBytes, 65536); assert.equal(metrics.sharedArrayBufferBytes, 4);
  const combined = { wasmMemoryBytes: 1048576, peakWasmMemoryBytes: 2097152, sharedArrayBufferBytes: 1048580 };
  observe(combined, new Uint8Array(memory.buffer, 0, 128), 4);
  assert.equal(combined.wasmMemoryBytes, 1048576); assert.equal(combined.peakWasmMemoryBytes, 2097152); assert.equal(combined.sharedArrayBufferBytes, 1048580);
  assert.throws(() => observe({}, new Uint8Array(), 4)); assert.throws(() => observe({}, new Uint8Array(memory.buffer), -1));
});
test("both actual AVIO input adapters observe the real destination buffer before reads, without allocation or threshold changes", async () => {
  const worker = await readFile("workers/media-remux.ts", "utf8");
  assert.equal(worker.split("observeNativeInputMemory(metrics, destination, writerSharedBytes + cancellationSharedBytes)").length - 1, 2);
  assert.match(worker, /readSync: synchronousInputReader[\s\S]*?observeNativeInputMemory[\s\S]*?recordRead/);
  assert.match(worker, /async read\(offset, destination\)[\s\S]*?observeNativeInputMemory[\s\S]*?recordRead/);
  assert.match(worker, /metrics.maxWriteChunkBytes = Math.max\(metrics.maxWriteChunkBytes, source.byteLength\);\s*let completed: boolean;[\s\S]*?writable.writeSync/);
  assert.doesNotMatch(source, /new (?:Uint8Array|ArrayBuffer|SharedArrayBuffer)|33554432|\.slice\(/);
});

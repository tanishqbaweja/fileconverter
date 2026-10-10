// Analysis-only labels for an anonymous binary. NEVER actual debug symbols.
// Reuse the existing bounded metadata/slice readers; do not change their
// historical requirement for genuine names in named production binaries.
import assert from "node:assert/strict";
import { readWasmFunctionMetadata } from "./wasm-function-metadata.mjs";
import { createStaticFunctionSlice } from "./wasm-static-function-slice.mjs";
function u32(value) {
  assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffffff);
  const result = [];
  do { const low = value % 128; value = Math.floor(value / 128); result.push(low | (value ? 128 : 0)); } while (value);
  return Buffer.from(result);
}
function analysisLabels(bytes, indices) {
  assert.ok(bytes instanceof Uint8Array && bytes.byteLength <= 16777216);
  assert.ok(indices instanceof Set && indices.size > 0 && indices.size <= 32, "Index selection cap");
  const compiled = new WebAssembly.Module(bytes);
  assert.equal(WebAssembly.Module.customSections(compiled, "name").length, 0, "Anonymous actual binary required; never overwrite real names");
  const labels = new Map([...indices].sort((a, b) => a - b).map(index => {
    assert.ok(Number.isInteger(index) && index >= 0 && index < 10000, "Function index admission");
    return [index, `analysis_index_${index}`];
  }));
  const entries = [u32(labels.size)];
  for (const [index, label] of labels) { const encoded = Buffer.from(label); entries.push(u32(index), u32(encoded.length), encoded); }
  const names = Buffer.concat(entries), name = Buffer.from("name");
  const payload = Buffer.concat([u32(name.length), name, Buffer.from([1]), u32(names.length), names]);
  const binary = Buffer.concat([Buffer.from(bytes), Buffer.from([0]), u32(payload.length), payload]);
  assert.equal(WebAssembly.validate(binary), true);
  return { binary, labels };
}
export function readAnonymousIndexFunctionMetadata(bytes, indices) {
  const labeled = analysisLabels(bytes, indices);
  return readWasmFunctionMetadata(labeled.binary, new Set(labeled.labels.values())).map(({ name, ...row }) => ({
    ...row, functionNameFromActualBinary: null, analysisLabel: name, labelIsSynthetic: true,
  }));
}
export function createAnonymousIndexFunctionSlice(bytes, indices) {
  const labeled = analysisLabels(bytes, indices), selection = new Set(labeled.labels.values());
  const sliced = createStaticFunctionSlice(labeled.binary, selection);
  const after = readWasmFunctionMetadata(sliced.binary, selection);
  for (const original of sliced.metadata) {
    const retained = after.find(row => row.functionIndex === original.functionIndex);
    assert.deepEqual(retained.params, original.params); assert.deepEqual(retained.results, original.results);
    assert.deepEqual(Buffer.from(bytes.subarray(original.bodyStart, original.bodyEnd)),
      sliced.binary.subarray(retained.bodyStart, retained.bodyEnd));
  }
  return { ...sliced, metadata: sliced.metadata.map(({ name, ...row }) => ({ ...row,
    functionNameFromActualBinary: null, analysisLabel: name, labelIsSynthetic: true })),
    originalHasDebugNames: false, syntheticLabelsForAnalysisOnly: true,
    originalSelectedBodyBytesUnchanged: true, usedForBrowserOrMedia: false };
}

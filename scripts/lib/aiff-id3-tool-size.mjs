import assert from "node:assert/strict";

// Downloaded module bytes are not Wasm linear memory or Chromium private memory.
// Allow at most 1 MiB metadata-code growth over the measured published module.
export function aiffId3ToolSizeLimit(file, publishedWasmBytes) {
  assert.ok(Number.isSafeInteger(publishedWasmBytes) && publishedWasmBytes > 0 && publishedWasmBytes < 12 * 1024 ** 2);
  return file === "within-aiff.wasm" ? publishedWasmBytes + 1024 ** 2 : 1024 ** 2;
}

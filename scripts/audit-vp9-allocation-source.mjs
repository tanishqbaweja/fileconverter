// Small public source files only; bounded reads, never user media.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
assert.equal(process.argv.length, 2);
const entries = [
  ["frameAllocator", "https://raw.githubusercontent.com/webmproject/libvpx/v1.16.0/vpx_scale/generic/yv12config.c"],
  ["heapHeader", "https://raw.githubusercontent.com/emscripten-core/emscripten/6.0.4/system/include/emscripten/heap.h"],
  ["allocatorHeader", "https://raw.githubusercontent.com/emscripten-core/emscripten/6.0.4/system/include/emscripten/emmalloc.h"],
];
const rows = await Promise.all(entries.map(async ([name, url]) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) }); assert.equal(response.status, 200);
  const reader = response.body.getReader(), buffer = Buffer.alloc(65536); let size = 0;
  try { for (;;) { const item = await reader.read(); if (item.done) break;
    assert.ok(size + item.value.length <= buffer.length); buffer.set(item.value, size); size += item.value.length;
  } } finally { await reader.cancel(); }
  const source = buffer.subarray(0, size).toString(); assert.equal(Buffer.byteLength(source), size);
  return [name, { url, bytes: size, sha256: createHash("sha256").update(source).digest("hex"), exactSource: source }];
}));
const sources = Object.fromEntries(rows);
assert.equal(sources.frameAllocator.sha256, "4b248ec01e4ec24194247379a3a9891b4f6d3ea024bb1c209ade86c514a92148");
const report = { recordedAt: new Date().toISOString(), scope: "Pinned frame allocator and SDK diagnostic API source preimages; NOT actual browser allocation measurements",
  sources, userMediaReadOrConverted: false, publicAcceptance: false };
await writeFile(path.resolve(import.meta.dirname, "../evidence/2026-11-06-vp9-allocation-source-audit.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(Object.fromEntries(rows.map(([name, { bytes, sha256 }]) => [name, { bytes, sha256 }]))));

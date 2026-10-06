// Component/linker audit only. No source media, native FFmpeg calls or conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
const root = path.resolve(import.meta.dirname, ".."), slot = "work/mpeg2-split-pipeline-37444860342";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(await readFile(path.join(root, slot, "build-manifest.json")));
const rows = [];
for (const [file, pages] of [["within-mpeg2-split.wasm", 512], ["split-encoder.wasm", 256]]) {
  const bytes = await readFile(path.join(root, slot, file));
  assert.ok(bytes.length <= 16 * 1024 * 1024); assert.equal(sha(bytes), manifest.artifacts[file]);
  const compiledModule = new WebAssembly.Module(bytes);
  const memories = readWasmMemoryLimits(bytes);
  assert.deepEqual(memories, [{ imported: true, initialPages: pages, maximumPages: pages, shared: true }]);
  let offset = 8, boundary = bytes.length, payloadBytes = 0, segments = 0, codeSectionBytes = null, dataSections = 0, count = 0;
  const byte = () => { assert.ok(offset < boundary); return bytes[offset++]; };
  const u32 = () => {
    let value = 0, factor = 1;
    for (let i = 0; i < 5; i++) { const next = byte(); value += (next & 127) * factor;
      if (!(next & 128)) { assert.ok(value <= 0xffffffff); return value; } factor *= 128; }
    throw new Error("Oversized static Wasm u32");
  };
  while (offset < bytes.length) {
    assert.ok(++count <= 64); boundary = bytes.length;
    const id = byte(), length = u32(), end = offset + length; assert.ok(end <= bytes.length); boundary = end;
    if (id === 10) { assert.equal(codeSectionBytes, null); codeSectionBytes = length; }
    if (id === 11) {
      assert.equal(++dataSections, 1); segments = u32(); assert.ok(segments <= 4096);
      for (let i = 0; i < segments; i++) {
        assert.equal(u32(), 1, "Only known passive data segments, no guessed linear addresses");
        const size = u32(); payloadBytes += size; offset += size; assert.ok(offset <= end);
      }
      assert.equal(offset, end);
    }
    offset = end;
  }
  assert.equal(dataSections, 1); assert.ok(codeSectionBytes > 0);
  const imports = {}; let calls = 0;
  for (const entry of WebAssembly.Module.imports(compiledModule)) {
    imports[entry.module] ??= {};
    if (entry.kind === "memory") imports[entry.module][entry.name] = new WebAssembly.Memory({ initial: pages, maximum: pages, shared: true });
    else if (entry.kind === "function") imports[entry.module][entry.name] = () => { calls++; throw new Error("Unexpected native component audit callback"); };
    else throw new Error(`Unsupported component audit import ${entry.kind}`);
  }
  const instance = new WebAssembly.Instance(compiledModule, imports);
  instance.exports.emscripten_stack_init();
  const stackBase = instance.exports.emscripten_stack_get_base(), stackEnd = instance.exports.emscripten_stack_get_end();
  assert.equal(calls, 0); assert.equal(stackBase - stackEnd, 262144);
  rows.push({ file, bytes: bytes.length, sha256: sha(bytes), memory: memories, codeSectionBytes,
    passiveDataSegments: segments, passiveDataPayloadBytes: payloadBytes, stackBase, stackEnd,
    checkedNativeStackReserveBytes: 262144, importCallbacks: calls,
    heapBase: null, availableHeapBytes: null, freeBlocks: null, liveFrameBytes: null,
    runtimeHeapSavingsBytes: null, completeChromiumMemoryAcceptance: false });
}
const proof = { scope: "actual split code/linker component audit, not runtime heap or conversion acceptance",
  originalRead: false, conversionsPerformed: 0, publicAcceptance: false, completeChromiumMemoryAcceptance: false,
  source: { file: "scripts/audit-mpeg2-split-static-layout.mjs", sha256: sha(await readFile(import.meta.filename)) },
  manifestSha256: sha(await readFile(path.join(root, slot, "build-manifest.json"))), rows };
await writeFile(path.join(root, "evidence/mpeg2-split-static-layout-2026-10-06.json"), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(proof));

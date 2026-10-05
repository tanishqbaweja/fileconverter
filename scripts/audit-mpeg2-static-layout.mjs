// Code-artifact/linker-bound audit only. No source media, conversions or acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";

const root = new URL("../", import.meta.url);
const names = process.argv.slice(2);
if (!names.length) names.push("mpeg2-artwork-metadata-37356848855", "mpeg2-artwork-metadata-37364583311");
assert.ok(names.length <= 3);
const rows = [];
for (const name of names) {
  assert.match(name, /^mpeg2-artwork-metadata-[0-9]{8,}$/);
  const directory = new URL(`work/${name}/`, root);
  const file = new URL("within-mpeg2.wasm", directory);
  assert.ok((await stat(file)).size <= 16 * 1024 ** 2);
  const bytes = await readFile(file), manifest = JSON.parse(await readFile(new URL("build-manifest.json", directory)));
  const hash = createHash("sha256").update(bytes).digest("hex");
  assert.equal(hash, manifest.artifacts["within-mpeg2.wasm"]);
  const compiledModule = new WebAssembly.Module(bytes); // Validate binary before bounded inspection.
  const memories = readWasmMemoryLimits(bytes);
  assert.deepEqual(memories, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  let offset = 8, boundary = bytes.length, segments = 0, payloadBytes = 0, codeSectionBytes = null;
  let sectionCount = 0, dataSections = 0;
  const byte = () => { assert.ok(offset < boundary, "Truncated static metadata"); return bytes[offset++]; };
  const u32 = () => {
    let value = 0, factor = 1;
    for (let index = 0; index < 5; index++) {
      const next = byte(); value += (next & 127) * factor;
      if (!(next & 128)) { assert.ok(value <= 0xffffffff); return value; }
      factor *= 128;
    }
    throw new Error("Oversized static u32");
  };
  while (offset < bytes.length) {
    assert.ok(++sectionCount <= 64);
    boundary = bytes.length;
    const id = byte(), length = u32(), end = offset + length;
    assert.ok(end <= bytes.length); boundary = end;
    if (id === 10) { assert.equal(codeSectionBytes, null); codeSectionBytes = length; }
    if (id === 11) {
      assert.equal(++dataSections, 1); segments = u32(); assert.ok(segments <= 4096);
      for (let index = 0; index < segments; index++) {
        assert.equal(u32(), 1, "Only known passive segments: never guess active addresses");
        const size = u32(); payloadBytes += size; offset += size; assert.ok(offset <= end);
      }
      assert.equal(offset, end);
    }
    offset = end;
  }
  assert.equal(dataSections, 1); assert.ok(codeSectionBytes > 0);
  const imports = {}; let importCallbacks = 0;
  for (const entry of WebAssembly.Module.imports(compiledModule)) {
    imports[entry.module] ??= {};
    if (entry.kind === "memory") imports[entry.module][entry.name] = new WebAssembly.Memory({ initial: 512, maximum: 512, shared: true });
    else if (entry.kind === "function") imports[entry.module][entry.name] = () => {
      importCallbacks++; throw new Error(`Unexpected import ${entry.name}; native conversion forbidden`);
    };
    else throw new Error(`Unsupported static-audit import ${entry.kind}`);
  }
  const instance = new WebAssembly.Instance(compiledModule, imports);
  // These pure runtime accessors set/read linker bounds only; never call FFmpeg.
  instance.exports.emscripten_stack_init();
  const stackBase = instance.exports.emscripten_stack_get_base(), stackEnd = instance.exports.emscripten_stack_get_end();
  assert.equal(importCallbacks, 0); assert.equal(stackBase - stackEnd, 262144);
  rows.push({ name, fileBytes: bytes.length, sha256: hash, nativeAllocator: manifest.nativeAllocator ?? "emmalloc",
    decoderSet: manifest.decoderSet ?? "wide", enabledDecoders: manifest.enabledDecoders,
    codeSectionBytes, passiveSegments: segments, passivePayloadBytes: payloadBytes,
    stackBase, stackEnd, stackReserveBytes: stackBase - stackEnd, actualMemory: memories, importCallbacks,
    heapBase: null, runtimeHeapSavingsBytes: null, primaryMemoryAcceptance: false });
}
process.stdout.write(`${JSON.stringify({ scope: "static-layout-only-not-conversion-not-browser-memory", rows })}\n`);

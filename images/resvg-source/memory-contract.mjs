// Static memory declarations, never a substitute for complete process-tree measurement.
import assert from "node:assert/strict";
import { wasmSections } from "./published-version-witnesses.mjs";
export function definedWasmMemories(bytes) {
  assert.ok(WebAssembly.validate(bytes), "Real valid Wasm required");
  assert.equal(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).filter(row => row.kind === "memory").length, 0,
    "Imported-memory limits require separate import/host proof; do not assume they are absent");
  const sections = wasmSections(bytes).filter(row => row.id === 5); assert.ok(sections.length <= 1);
  if (!sections.length) return [];
  const section = sections[0]; let cursor = section.start;
  const integer = () => {
    let value = 0;
    for (let index = 0; index < 5; index++) {
      assert.ok(cursor < section.end); const byte = bytes[cursor++]; value += (byte & 127) * 2 ** (index * 7);
      if (!(byte & 128)) { assert.ok(Number.isSafeInteger(value)); return value; }
    }
    throw new Error("Unbounded Wasm memory limit encoding");
  };
  const count = integer(); assert.ok(count <= 16); const memories = [];
  for (let index = 0; index < count; index++) {
    const flags = integer(); assert.ok(flags <= 3, "This profile accepts memory32 only");
    const initialPages = integer(), maximumPages = flags & 1 ? integer() : null;
    assert.ok(initialPages <= 65536 && (maximumPages === null || (maximumPages >= initialPages && maximumPages <= 65536)));
    memories.push({ index, initialPages, initialBytes: initialPages * 65536, maximumPages,
      maximumBytes: maximumPages === null ? null : maximumPages * 65536,
      maximumExplicit: maximumPages !== null, shared: Boolean(flags & 2) });
  }
  assert.equal(cursor, section.end); return memories;
}
export function requireExplicitWasmMaximum(memories, maximumBytes) {
  assert.ok(Number.isSafeInteger(maximumBytes) && maximumBytes > 0 && maximumBytes <= 250 * 1024 ** 2,
    "A declared per-core budget within, not replacing, the full250MiB process-tree constraint is required");
  assert.ok(memories.length > 0);
  for (const memory of memories) {
    assert.equal(memory.maximumExplicit, true, "Missing maximum is not a bounded Wasm memory contract");
    assert.ok(memory.maximumBytes <= maximumBytes, "Declared Wasm maximum exceeds the profile budget");
  }
}

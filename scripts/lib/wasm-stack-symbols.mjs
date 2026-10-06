import assert from "node:assert/strict";

// Read actual binary debug names, not an unverified external symbol-map filename.
// No instance, native function execution, media or binary modification.
export function readWasmFunctionNames(bytes) {
  assert.ok(bytes.byteLength <= 16 * 1024 * 1024);
  const compiledModule = new WebAssembly.Module(bytes);
  const sections = WebAssembly.Module.customSections(compiledModule, "name");
  assert.equal(sections.length, 1, "Unique actual binary name section required");
  const data = new Uint8Array(sections[0]); assert.ok(data.length <= 512 * 1024);
  let offset = 0, boundary = data.length, functionSections = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const byte = () => { assert.ok(offset < boundary, "Truncated Wasm name section"); return data[offset++]; };
  const u32 = () => {
    let value = 0, factor = 1;
    for (let i = 0; i < 5; i++) { const next = byte(); value += (next & 127) * factor;
      if (!(next & 128)) { assert.ok(value <= 0xffffffff); return value; } factor *= 128; }
    throw new Error("Oversized Wasm name u32");
  };
  const names = new Map();
  while (offset < data.length) {
    boundary = data.length;
    const subsection = byte(), length = u32(), end = offset + length;
    assert.ok(end <= data.length); boundary = end;
    if (subsection === 1) {
      assert.equal(++functionSections, 1); const count = u32(); assert.ok(count <= 10000);
      for (let i = 0; i < count; i++) {
        const index = u32(), size = u32(); assert.ok(size <= 1024 && offset + size <= end);
        assert.ok(!names.has(index), "Duplicate binary function name index");
        names.set(index, decoder.decode(data.subarray(offset, offset + size))); offset += size;
      }
      assert.equal(offset, end);
    }
    offset = end;
  }
  assert.equal(functionSections, 1); return names;
}

export function symbolizeWasmStack(stack, names) {
  assert.ok(typeof stack === "string" && stack.length <= 8192 && names instanceof Map);
  const frames = [];
  for (const line of stack.split("\n")) {
    const match = /wasm-function\[(\d+)\]:(0x[0-9a-f]+)/i.exec(line);
    if (!match) continue;
    assert.ok(frames.length < 32);
    const functionIndex = Number(match[1]); assert.ok(Number.isSafeInteger(functionIndex));
    frames.push({ functionIndex, functionNameFromActualBinary: names.get(functionIndex) ?? null, codeOffset: match[2] });
  }
  return frames;
}

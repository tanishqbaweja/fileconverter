// Analysis-only derivative, NEVER instantiated, published, or used for media.
// Preserve every selected original function BODY byte/index/type/name. Replace
// other bodies with unreachable solely to bound disassembler text generation.
import assert from "node:assert/strict";
import { readWasmFunctionMetadata } from "./wasm-function-metadata.mjs";
export function createStaticFunctionSlice(bytes, names) {
  const metadata = readWasmFunctionMetadata(bytes, names);
  const selected = new Set(metadata.map(entry => entry.functionIndex));
  const imported = WebAssembly.Module.imports(new WebAssembly.Module(bytes)).filter(entry => entry.kind === "function").length;
  let offset = 8, boundary = bytes.length, replaced = 0, preserved = 0;
  const read = () => { if (offset >= boundary) throw new Error("Truncated static slice"); return bytes[offset++]; };
  const u32 = () => {
    let value = 0, factor = 1;
    for (let i = 0; i < 5; i++) { const next = read(); value += (next & 127) * factor;
      if (!(next & 128)) { assert.ok(value <= 0xffffffff); return value; } factor *= 128; }
    throw new Error("Invalid static slice u32");
  };
  const encoded = value => { const out = []; do { const low = value % 128; value = Math.floor(value / 128); out.push(low | (value ? 128 : 0)); } while (value); return Buffer.from(out); };
  const pieces = [Buffer.from(bytes.subarray(0, 8))]; let codeSections = 0;
  while (offset < bytes.length) {
    boundary = bytes.length;
    const start = offset, section = read(), length = u32(), end = offset + length;
    assert.ok(end <= bytes.length); boundary = end;
    if (section !== 10) pieces.push(Buffer.from(bytes.subarray(start, end)));
    else {
      assert.equal(++codeSections, 1);
      const count = u32(); assert.ok(count <= 10000);
      const code = [encoded(count)];
      for (let index = 0; index < count; index++) {
        const size = u32(), bodyStart = offset, bodyEnd = offset + size; assert.ok(bodyEnd <= end);
        if (selected.has(index + imported)) {
          const original = metadata.find(entry => entry.functionIndex === index + imported);
          assert.equal(original.bodyStart, bodyStart); assert.equal(original.bodyEnd, bodyEnd);
          code.push(encoded(size), Buffer.from(bytes.subarray(bodyStart, bodyEnd))); preserved++;
        } else { code.push(Buffer.from([3, 0, 0, 11])); replaced++; }
        offset = bodyEnd;
      }
      assert.equal(offset, end);
      const payload = Buffer.concat(code); pieces.push(Buffer.from([10]), encoded(payload.length), payload);
    }
    offset = end;
  }
  assert.equal(codeSections, 1); assert.equal(preserved, selected.size);
  const binary = Buffer.concat(pieces); assert.equal(WebAssembly.validate(binary), true);
  return { binary, metadata, preservedFunctions: preserved, unreachableReplacements: replaced, instantiated: false };
}

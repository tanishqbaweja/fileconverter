// Static Emscripten binding and actual exported Wasm signature. No instance,
// media conversion, debug-name dependency or binary modification.
import assert from "node:assert/strict";
export function readEmscriptenExportAbi(moduleText, bytes, symbol = "_within_remux") {
  assert.ok(typeof moduleText === "string" && moduleText.length <= 2 * 1024 ** 2);
  assert.match(symbol, /^_[A-Za-z0-9_]+$/); assert.ok(bytes.length <= 32 * 1024 ** 2 && WebAssembly.validate(bytes));
  const bindings = [...moduleText.matchAll(new RegExp('Module\\["' + symbol + '"\\]=wasmExports\\["([A-Za-z0-9_]+)"\\]', "g"))];
  assert.equal(bindings.length, 1, "Unique real Emscripten export binding required");
  const target = bindings[0][1], types = [], functions = [], selected = [], seen = new Set();
  let offset = 8, end = bytes.length;
  const byte = () => { assert.ok(offset < end, "Truncated ABI metadata"); return bytes[offset++]; };
  const u32 = () => { let value = 0, factor = 1; for (let i = 0; i < 5; i++) { const next = byte(); value += (next & 127) * factor;
    if (!(next & 128)) { assert.ok(value <= 0xffffffff); return value; } factor *= 128; } throw new Error("Oversized ABI u32"); };
  const string = () => { const size = u32(); assert.ok(size <= 1024 && offset + size <= end);
    const value = new TextDecoder("utf8", { fatal: true }).decode(bytes.subarray(offset, offset + size)); offset += size; return value; };
  const limits = () => { const flags = u32(); assert.ok(!(flags & ~3)); u32(); if (flags & 1) u32(); };
  const vector = maximum => { const count = u32(); assert.ok(count <= maximum); return Array.from({ length: count }, byte); };
  while (offset < bytes.length) {
    end = bytes.length; const section = byte(), size = u32(); end = offset + size; assert.ok(end <= bytes.length);
    if ([1, 2, 3, 7].includes(section)) {
      assert.ok(!seen.has(section)); seen.add(section); const count = u32(); assert.ok(count <= 10000);
      for (let i = 0; i < count; i++) {
        if (section === 1) { assert.equal(byte(), 96); types.push({ parameters: vector(64), results: vector(16) }); }
        else if (section === 2) {
          string(); string(); const kind = byte();
          if (kind === 0) functions.push(u32()); else if (kind === 1) { byte(); limits(); }
          else if (kind === 2) limits(); else if (kind === 3) { byte(); byte(); }
          else if (kind === 4) { byte(); u32(); } else throw new Error("Unknown ABI import kind");
        } else if (section === 3) functions.push(u32());
        else { const name = string(), kind = byte(), index = u32(); if (name === target) { assert.equal(kind, 0); selected.push(index); } }
      }
      assert.equal(offset, end);
    }
    offset = end;
  }
  assert.equal(selected.length, 1); const type = types[functions[selected[0]]]; assert.ok(type);
  return { symbol, exportName: target, ...type, parameterCount: type.parameters.length };
}

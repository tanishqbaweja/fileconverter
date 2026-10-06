// Static actual-binary function types and body extents only; no instance/media.
import { readWasmFunctionNames } from "./wasm-stack-symbols.mjs";
export function readWasmFunctionMetadata(bytes, selectedNames) {
  if (!(selectedNames instanceof Set) || selectedNames.size > 32) throw new Error("Function selection cap");
  const names = readWasmFunctionNames(bytes), types = [], functionTypes = [], bodies = [];
  let offset = 8, boundary = bytes.length, importedFunctions = 0;
  const byte = () => { if (offset >= boundary) throw new Error("Truncated function metadata"); return bytes[offset++]; };
  const u32 = () => {
    let value = 0, factor = 1;
    for (let i = 0; i < 5; i++) { const b = byte(); value += (b & 127) * factor;
      if (!(b & 128)) { if (value > 0xffffffff) throw new Error("Invalid u32"); return value; } factor *= 128; }
    throw new Error("Oversized u32");
  };
  const skipName = () => { const size = u32(); if (size > 1024 || offset + size > boundary) throw new Error("Name cap"); offset += size; };
  const limit = () => { const flags = u32(); if (flags & ~3) throw new Error("Unsupported limits"); u32(); if (flags & 1) u32(); };
  const valueTypes = new Map([[127, "i32"], [126, "i64"], [125, "f32"], [124, "f64"], [123, "v128"], [112, "funcref"], [111, "externref"]]);
  const vector = maximum => {
    const count = u32(); if (count > maximum) throw new Error("Type vector cap");
    return Array.from({ length: count }, () => { const type = valueTypes.get(byte()); if (!type) throw new Error("Unsupported value type"); return type; });
  };
  const seen = new Set();
  while (offset < bytes.length) {
    boundary = bytes.length; const section = byte(), length = u32(), end = offset + length;
    if (end > bytes.length) throw new Error("Truncated section"); boundary = end;
    if ([1, 2, 3, 10].includes(section)) {
      if (seen.has(section)) throw new Error("Duplicate metadata section"); seen.add(section);
      const count = u32(); if (count > 10000) throw new Error("Metadata inventory cap");
      for (let i = 0; i < count; i++) {
        if (section === 1) {
          if (byte() !== 96) throw new Error("Only simple function types supported");
          types.push({ params: vector(64), results: vector(16) });
        } else if (section === 2) {
          skipName(); skipName(); const kind = byte();
          if (kind === 0) { functionTypes.push(u32()); importedFunctions++; }
          else if (kind === 1) { byte(); limit(); }
          else if (kind === 2) limit();
          else if (kind === 3) { byte(); byte(); }
          else if (kind === 4) { byte(); u32(); }
          else throw new Error("Unknown import kind");
        } else if (section === 3) functionTypes.push(u32());
        else {
          const size = u32(), bodyStart = offset, bodyEnd = offset + size;
          if (bodyEnd > boundary) throw new Error("Truncated function body");
          bodies.push({ bodyStart, bodyEnd }); offset = bodyEnd;
        }
      }
      if (offset !== end) throw new Error("Invalid metadata section extent");
    }
    offset = end;
  }
  if (bodies.length + importedFunctions !== functionTypes.length) throw new Error("Function body/type count mismatch");
  const result = [];
  for (const [functionIndex, name] of names) {
    if (!selectedNames.has(name)) continue;
    const type = types[functionTypes[functionIndex]], body = bodies[functionIndex - importedFunctions];
    if (!type || !body) throw new Error("Selected defined function unavailable");
    result.push({ functionIndex, name, ...type, ...body });
  }
  if (result.length !== selectedNames.size) throw new Error("Selected function names unavailable or ambiguous");
  return result;
}

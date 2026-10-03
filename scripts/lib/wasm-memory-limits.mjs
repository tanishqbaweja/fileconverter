// Inspect actual static tool bytes, not fixture/media data. This bounds-checks
// the import and memory sections; no Wasm execution or binary modification.
export function readWasmMemoryLimits(bytes) {
  let offset = 0, boundary = bytes.length;
  const byte = () => { if (offset >= boundary) throw new Error("Truncated Wasm memory metadata"); return bytes[offset++]; };
  const leb = () => {
    let value = 0, factor = 1;
    for (let index = 0; index < 5; index++) { const next = byte(); value += (next & 127) * factor;
      if (!(next & 128)) { if (value > 0xffffffff) throw new Error("Invalid Wasm u32"); return value; } factor *= 128; }
    throw new Error("Oversized Wasm u32");
  };
  const name = () => { const size = leb(); if (offset + size > boundary) throw new Error("Truncated Wasm import name"); offset += size; };
  const limits = () => {
    const flags = leb(); if (flags & ~3) throw new Error("Unsupported Wasm limit flags");
    const initialPages = leb(), maximumPages = flags & 1 ? leb() : null;
    if (maximumPages != null && maximumPages < initialPages) throw new Error("Invalid Wasm memory limits");
    return { initialPages, maximumPages, shared: Boolean(flags & 2) };
  };
  for (const value of [0, 97, 115, 109, 1, 0, 0, 0]) if (byte() !== value) throw new Error("Invalid Wasm header");
  const memories = [];
  while (offset < bytes.length) {
    boundary = bytes.length;
    const section = byte(), length = leb(), end = offset + length;
    if (end > bytes.length) throw new Error("Truncated Wasm section");
    boundary = end;
    if (section === 2) {
      const count = leb();
      for (let index = 0; index < count; index++) {
        name(); name(); const kind = byte();
        if (kind === 0) leb();
        else if (kind === 1) { byte(); limits(); }
        else if (kind === 2) memories.push({ imported: true, ...limits() });
        else if (kind === 3) { byte(); byte(); }
        else if (kind === 4) { byte(); leb(); }
        else throw new Error("Unknown Wasm import kind");
      }
    } else if (section === 5) {
      const count = leb();
      for (let index = 0; index < count; index++) memories.push({ imported: false, ...limits() });
    }
    offset = end;
  }
  return memories;
}

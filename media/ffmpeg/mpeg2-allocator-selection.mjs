// Private allocation strategy only; never changes memory limits or codecs.
export function selectMpeg2Allocator(value = "emmalloc", diagnostic = false) {
  if (!["emmalloc", "dlmalloc"].includes(value)) throw new Error("Private MPEG2 allocator must be emmalloc or dlmalloc");
  if (typeof diagnostic !== "boolean") throw new Error("Allocator diagnostic selection must be boolean");
  if (diagnostic && value !== "emmalloc")
    throw new Error("emmalloc-specific diagnostics cannot measure dlmalloc");
  return value;
}

export function verifyMpeg2AllocatorSymbols(allocator, symbols) {
  selectMpeg2Allocator(allocator);
  if (typeof symbols !== "string" || symbols.length > 1024 * 1024)
    throw new Error("Bounded compiled symbol map required");
  const names = new Set(symbols.trim().split(/\r?\n/).map((line) => {
    const match = /^\d+:(?:\d+:)?([^:]+)$/.exec(line);
    if (!match) throw new Error("Malformed compiled symbol map");
    return match[1];
  }));
  const em = ["emmalloc_malloc", "emmalloc_free", "emmalloc_memalign"];
  const dl = ["dlmalloc", "dlfree"];
  const required = allocator === "emmalloc" ? em : dl;
  const forbidden = allocator === "emmalloc" ? dl : em;
  if (!required.every((name) => names.has(name)) || forbidden.some((name) => names.has(name)))
    throw new Error("Actual compiled allocator fingerprint differs from selection");
  return [...names].filter((name) => /^(emmalloc_|dl(?:malloc|free|calloc|realloc|memalign|posix_memalign))/.test(name)).sort();
}

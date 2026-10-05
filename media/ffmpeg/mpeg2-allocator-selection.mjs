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
  if (!required.every((name) => names.has(name)) || forbidden.some((name) => names.has(name))) {
    // Compile-time names only: no conversion/file data, and no relaxed acceptance.
    const observed = [...names].filter((name) =>
      /^(?:emmalloc_|dl|tmalloc_|dispose_chunk|sys_alloc|malloc|free|memalign|calloc|realloc|__libc_|emscripten_builtin_)/.test(name)).sort();
    throw new Error(`Actual compiled allocator fingerprint differs from selection; selected=${allocator}; `
      + `required=${required.join(",")}; observed=${JSON.stringify(observed.slice(0, 24).map((name) => name.slice(0, 128)))}; `
      + `observedCount=${observed.length}; truncated=${observed.length > 24 || observed.some((name) => name.length > 128)}`);
  }
  return [...names].filter((name) => /^(emmalloc_|dl(?:malloc|free|calloc|realloc|memalign|posix_memalign))/.test(name)).sort();
}

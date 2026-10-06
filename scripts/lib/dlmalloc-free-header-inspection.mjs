// Read-only allocator HEADERS, never payloads, native allocator calls, locks,
// heap copies or codec references. Only the pinned wasm32 Emscripten6.0.4 ABI.
export const PINNED_SPLIT_DECODER_SHA256 = "7b8a42b60efc439f0ceca045f4caaabfd4b0ebf0706397b6011cceedada4980c";
export const PINNED_DLMALLOC_ROOT = 1786392;
export function inspectDlmallocFreeHeaders(heap, { root = PINNED_DLMALLOC_ROOT, expectedBytes = 33554432 } = {}) {
  if (!(heap instanceof Uint8Array) || heap.byteLength !== expectedBytes || expectedBytes > 33554432)
    throw new Error("Pinned heap extent unavailable");
  const view = new DataView(heap.buffer, heap.byteOffset, heap.byteLength);
  let wordsRead = 0, totalFreeChunkBytes = 0, largestFreeChunkBytes = 0;
  const seen = new Set(), bins = [], histogram = new Array(32).fill(0);
  const read = address => {
    if (++wordsRead > 32768) throw new Error("Allocator header read cap");
    if (!Number.isSafeInteger(address) || address % 4 || address < 0 || address + 4 > heap.byteLength)
      throw new Error("Allocator header address unavailable");
    return view.getUint32(address, true);
  };
  if (!Number.isSafeInteger(root) || root < 0 || root + 488 > heap.byteLength) throw new Error("Allocator root unavailable");
  const smallmap = read(root), treemap = read(root + 4), dvsize = read(root + 8), topsize = read(root + 12);
  const leastAddress = read(root + 16), dv = read(root + 20), top = read(root + 24);
  if (leastAddress < root + 488 || leastAddress % 8 || leastAddress >= heap.byteLength) throw new Error("Allocator least address inconsistent");
  const record = (address, expectedSize = null) => {
    if (seen.size >= 4096) throw new Error("Allocator free chunk inventory cap");
    if (address < leastAddress || address % 8 || address + 16 > heap.byteLength || seen.has(address))
      throw new Error("Allocator chunk address/cycle inconsistent");
    const head = read(address + 4), size = (head & ~7) >>> 0;
    if ((head & 3) !== 1 || size < 16 || size % 8 || address + size > heap.byteLength ||
      (expectedSize != null && size !== expectedSize)) throw new Error("Allocator free chunk size/state inconsistent");
    seen.add(address); totalFreeChunkBytes += size; largestFreeChunkBytes = Math.max(largestFreeChunkBytes, size);
    histogram[31 - Math.clz32(size)]++;
    return size;
  };
  if (dvsize) record(dv, dvsize);
  if (!top || topsize < 16) throw new Error("Allocator top unavailable");
  record(top, topsize);
  for (let index = 0; index < 32; index++) {
    if (!(smallmap & (1 << index))) continue;
    const sentinel = root + 40 + index * 8;
    let cursor = read(sentinel + 8), previous = sentinel, count = 0, bytes = 0;
    if (cursor === sentinel) throw new Error("Marked smallbin empty");
    while (cursor !== sentinel) {
      const size = record(cursor, index * 8);
      if (read(cursor + 12) !== previous) throw new Error("Smallbin backward link inconsistent");
      previous = cursor; cursor = read(cursor + 8); count++; bytes += size;
    }
    if (read(sentinel + 12) !== previous) throw new Error("Smallbin tail inconsistent");
    bins.push({ kind: "small", index, chunks: count, bytes });
  }
  const treeIndex = size => {
    const x = size >>> 8;
    if (x === 0) return 0; if (x > 65535) return 31;
    const k = 31 - Math.clz32(x); return (k * 2) + ((size >>> (k + 7)) & 1);
  };
  for (let index = 0; index < 32; index++) {
    const first = read(root + 304 + index * 4);
    if (!(treemap & (1 << index))) {
      if (first) throw new Error("Unmarked treebin nonempty"); continue;
    }
    if (!first) throw new Error("Marked treebin empty");
    const stack = [first]; let count = 0, bytes = 0;
    while (stack.length) {
      if (stack.length > 64) throw new Error("Allocator tree frontier cap");
      const node = stack.pop(), size = record(node);
      if (size < 256 || treeIndex(size) !== index || read(node + 28) !== index) throw new Error("Treebin size/index inconsistent");
      count++; bytes += size;
      const left = read(node + 16), right = read(node + 20);
      for (const child of [left, right]) if (child) {
        if (read(child + 24) !== node) throw new Error("Treebin parent inconsistent"); stack.push(child);
      }
      let previous = node, sibling = read(node + 8);
      while (sibling !== node) {
        record(sibling, size);
        if (read(sibling + 12) !== previous || read(sibling + 24) !== 0 || read(sibling + 28) !== index)
          throw new Error("Treebin sibling linkage inconsistent");
        previous = sibling; sibling = read(sibling + 8); count++; bytes += size;
      }
      if (read(node + 12) !== previous) throw new Error("Treebin sibling tail inconsistent");
    }
    bins.push({ kind: "tree", index, chunks: count, bytes });
  }
  // Explicit dynamic allocator footprint/segment fields; include neither the
  // linker stack reserve nor static code as if they were free heap capacity.
  const footprint = read(root + 432), segmentBase = read(root + 472), segmentBytes = read(root + 476), segmentNext = read(root + 480);
  if (segmentBase !== leastAddress || segmentBytes !== footprint || segmentNext !== 0 ||
    segmentBase + segmentBytes > heap.byteLength || totalFreeChunkBytes > footprint) throw new Error("Single contiguous allocator segment unavailable");
  return { scope: "read-only-allocator-header-inventory-not-codec-payload-or-acceptance", complete: true,
    totalFreeChunkBytes, largestFreeChunkBytes, freeChunks: seen.size, designatedVictimBytes: dvsize, topChunkBytes: topsize,
    dynamicFootprintBytes: footprint, segmentBase, segmentBytes, unclaimedMemoryAboveSegmentBytes: heap.byteLength - segmentBase - segmentBytes,
    freeChunkSizeLog2Histogram: histogram, bins, headerWordsRead: wordsRead, maximumHeaderWords: 32768,
    maximumChunks: 4096, heapCopied: false, payloadRead: false, nativeFunctionsCalled: false, allocatorMutated: false,
    liveFrameCount: null, fragmentationCauseProven: false };
}

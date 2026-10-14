# Actual full-original demux allocation failure

The changed largest-idle decoder is **not full-file qualified**. Its actual
full-original attempt processed34,348 frames in1,446,197.285ms, then aborted at
`av_buffer_realloc -> av_realloc -> emscripten_builtin_realloc -> malloc -> sbrk`
during `ebml_parse`/`matroska_parse_cluster`. The prior first-idle decoder reached
250,053 frames before a different packet `av_malloc` failure. This is an observed
earlier failure, not proof of its lifetime/fragmentation mechanism. Never promote
the changed decoder or replay it unchanged based on allocation-churn controls.

Evidence: `evidence/2026-10-13T01-28-09-516Z-packet-largest-idle-full-terminal-analysis.json`.
The failed individual request remains **unknown**.33,759,232 is an attempted
heap extent, not a requested payload allocation. The failure observer correctly
read zero native slots: the posix-alignment request slot does not instrument
`av_realloc`. Its unknown result must not be replaced with the last packet size.

## Pinned upstream implementation and next actionable measurement

The actual build script pins FFmpeg8.1.2. In that upstream version:

- [`matroskadec.c`](https://github.com/FFmpeg/FFmpeg/blob/n8.1.2/libavformat/matroskadec.c#L1005)
  reads an EBML **binary element**, not an entire cluster, with an AVBuffer sized
  to the element length plus input padding. The function may be inlined into
  `ebml_parse`; the cluster frame in the stack is not proof of a whole-cluster copy.
- [`buffer.c`](https://github.com/FFmpeg/FFmpeg/blob/n8.1.2/libavutil/buffer.c#L173)
  can allocate through `av_realloc(NULL,size)`, resize an existing writable
  reallocatable buffer, or allocate a new buffer when old storage is aliased.
  The observed stack does not distinguish those branches or reveal the size.

These are source-level hypotheses to join with the actual typed Wasm body;
upstream code alone is not runtime ownership or fragmentation evidence. A fresh
native diagnostic should record a fixed small realloc-attempt slot immediately
before the actual call: requested size, old allocation pointer/size, branch and
phase. At fatal exit, qualify the new binary/map/schema/path before reading it
and bounded allocator headers. No payload reads, live native calls, copied heaps,
forced GC, bigger heaps, altered source, quality reductions or native conversion.

Independent read-only FFprobe inspection of the original at1428%1435 produced
452 packet records. Largest packet330,854B atPTS1430.375/DTS1430.292, position
308,314,431; another273,886B atPTS1431.333/DTS1431.167, position310,550,984.
These are nearby-source context only, **not the observed failed request**.
The application's343,116,307 input-byte counter is cumulative read work and must
not be substituted for a file position. No media copy or conversion was made.

Before another full attempt, verify the real compiled slot/failure control and
correctness/recovery with identical settings, and investigate a bounded storage
lifetime/reuse change justified by the observed request. Native churn reductions
and failed-window230.824MiB do not establish speed, reliability or memory acceptance.

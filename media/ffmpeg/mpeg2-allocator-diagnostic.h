/* Private allocation diagnosis only. No media data, allocator mutation,
 * trimming, extra codec frames, heap growth, or changed encoding settings.
 * At most 96 scalar snapshots plus 32 fixed free-block buckets per snapshot.
 */
#include <emscripten/emmalloc.h>
#include <libavutil/refstruct.h>

EM_JS(void, mpeg2_allocator_emit,
      (unsigned sequence, unsigned phase, int codec_id, int encoder,
       int width, int height, int format, unsigned frame_bytes,
       unsigned dynamic_bytes, unsigned free_bytes, unsigned unclaimed_bytes,
       unsigned free_regions, const size_t *buckets), {
  const callback = Module["withinBridge"].allocatorDiagnostic;
  if (!callback) return;
  callback({ sequence, phase, codecId: codec_id, encoder: Boolean(encoder),
    width, height, pixelFormat: format, frameBufferBytes: frame_bytes,
    dynamicHeapBytes: dynamic_bytes, freeDynamicBytes: free_bytes,
    unclaimedHeapBytes: unclaimed_bytes, freeRegions: free_regions,
    freeBlockSizeBuckets: Array.from(HEAPU32.subarray(buckets >> 2, (buckets >> 2) + 32)) });
});

static void mpeg2_allocator_snapshot(unsigned phase, const AVCodecContext *context,
                                     const AVFrame *frame) {
  static unsigned sequence;
  if (sequence >= 96) return;
  size_t buckets[32];
  unsigned frame_bytes = 0;
  if (frame) {
    for (unsigned i = 0; i < AV_NUM_DATA_POINTERS; i++)
      if (frame->buf[i]) frame_bytes += frame->buf[i]->size;
  }
  size_t dynamic_bytes = emmalloc_dynamic_heap_size();
  size_t free_bytes = emmalloc_free_dynamic_memory();
  size_t unclaimed_bytes = emmalloc_unclaimed_heap_memory();
  size_t regions = emmalloc_compute_free_dynamic_memory_fragmentation_map(buckets);
  mpeg2_allocator_emit(++sequence, phase, context ? context->codec_id : 0,
      context && context->codec ? av_codec_is_encoder(context->codec) : 0,
      frame ? frame->width : context ? context->width : 0,
      frame ? frame->height : context ? context->height : 0,
      frame ? frame->format : context ? context->pix_fmt : -1, frame_bytes,
      dynamic_bytes, free_bytes, unclaimed_bytes, regions, buckets);
}

int __real_avcodec_default_get_buffer2(AVCodecContext *context, AVFrame *frame, int flags);
int __wrap_avcodec_default_get_buffer2(AVCodecContext *context, AVFrame *frame, int flags) {
  mpeg2_allocator_snapshot(17, context, frame);
  int result = __real_avcodec_default_get_buffer2(context, frame, flags);
  mpeg2_allocator_snapshot(18, context, frame);
  return result;
}

// Separate fixed pool-event budget; never consumes the 96 frame/heap slots.
// Native getter walks at most 128 inactive links under the pool mutex. Only
// scalar sizes/counts are exposed; no decoded data or pointer dereferencing JS.
EM_JS(void, mpeg2_refstruct_emit,
      (unsigned sequence, unsigned phase, unsigned pool_identity, int complete,
       const size_t *stats, unsigned dynamic_bytes, unsigned free_bytes,
       unsigned unclaimed_bytes), {
  const callback = Module["withinBridge"].allocatorDiagnostic;
  if (!callback) return;
  const values = HEAPU32.subarray(stats >> 2, (stats >> 2) + 4);
  callback({ kind: "refstruct-pool", sequence, phase, poolIdentity: pool_identity,
    statisticsComplete: Boolean(complete),
    entryPayloadBytes: complete ? values[0] : null,
    entryRequestedAllocationBytes: complete ? values[1] : null,
    checkedOutEntries: complete ? values[2] : null,
    cachedEntries: complete ? values[3] : null,
    dynamicHeapBytes: dynamic_bytes, freeDynamicBytes: free_bytes,
    unclaimedHeapBytes: unclaimed_bytes });
});

int within_refstruct_pool_diagnostic(AVRefStructPool *pool, size_t stats[4]);
static void mpeg2_refstruct_snapshot(unsigned phase, AVRefStructPool *pool) {
  static unsigned sequence;
  if (sequence >= 128) return;
  size_t stats[4] = {0};
  int complete = within_refstruct_pool_diagnostic(pool, stats);
  mpeg2_refstruct_emit(++sequence, phase, (unsigned)(uintptr_t)pool, complete,
      stats, emmalloc_dynamic_heap_size(), emmalloc_free_dynamic_memory(),
      emmalloc_unclaimed_heap_memory());
}

void *__real_av_refstruct_pool_get(AVRefStructPool *pool);
void *__wrap_av_refstruct_pool_get(AVRefStructPool *pool) {
  mpeg2_refstruct_snapshot(19, pool);
  void *result = __real_av_refstruct_pool_get(pool);
  mpeg2_refstruct_snapshot(20, pool);
  return result;
}

// Separate16-event budget, each exactly five scalar accessory-pool records.
// Called after normal picture release, never changes a reference or pool.
EM_JS(void, mpeg2_encoder_pool_release_emit,
      (unsigned sequence, int codec_id, int threads, const size_t *records,
       unsigned dynamic_bytes, unsigned free_bytes, unsigned unclaimed_bytes), {
  const callback = Module["withinBridge"].allocatorDiagnostic;
  if (!callback) return;
  const names = ["mbskip", "qscale", "mbtype", "motion", "refindex"];
  const values = HEAPU32.subarray(records >> 2, (records >> 2) + 30);
  callback({ kind: "mpeg2-encoder-pool-release", sequence, codecId: codec_id,
    codecThreads: threads, scope: "after-normal-cur-picture-release",
    dynamicHeapBytes: dynamic_bytes, freeDynamicBytes: free_bytes,
    unclaimedHeapBytes: unclaimed_bytes,
    pools: names.map((name, i) => {
      const at = i * 6, configured = values[at] !== 0;
      const complete = configured && values[at + 1] !== 0;
      return { name, poolIdentity: values[at], configured, statisticsComplete: complete,
        entryPayloadBytes: complete ? values[at + 2] : null,
        entryRequestedAllocationBytes: complete ? values[at + 3] : null,
        checkedOutEntries: complete ? values[at + 4] : null,
        cachedEntries: complete ? values[at + 5] : null };
    }) });
});

void within_mpeg2_encoder_pool_release_diagnostic(const AVCodecContext *context,
    AVRefStructPool *mbskip, AVRefStructPool *qscale, AVRefStructPool *mbtype,
    AVRefStructPool *motion, AVRefStructPool *refindex);
void within_mpeg2_encoder_pool_release_diagnostic(const AVCodecContext *context,
    AVRefStructPool *mbskip, AVRefStructPool *qscale, AVRefStructPool *mbtype,
    AVRefStructPool *motion, AVRefStructPool *refindex) {
  static unsigned sequence;
  if (sequence >= 16 || !context || context->codec_id != AV_CODEC_ID_MPEG2VIDEO ||
      context->thread_count != 1) return;
  AVRefStructPool *pools[5] = {mbskip, qscale, mbtype, motion, refindex};
  size_t records[30] = {0};
  for (unsigned i = 0; i < 5; i++) {
    size_t *row = records + i * 6;
    row[0] = (size_t)(uintptr_t)pools[i];
    if (pools[i]) row[1] = within_refstruct_pool_diagnostic(pools[i], row + 2);
  }
  mpeg2_encoder_pool_release_emit(++sequence, context->codec_id, context->thread_count,
    records, emmalloc_dynamic_heap_size(), emmalloc_free_dynamic_memory(),
    emmalloc_unclaimed_heap_memory());
}

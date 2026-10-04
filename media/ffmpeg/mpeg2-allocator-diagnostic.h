/* Private allocation diagnosis only. No media data, allocator mutation,
 * trimming, extra codec frames, heap growth, or changed encoding settings.
 * At most 96 scalar snapshots plus 32 fixed free-block buckets per snapshot.
 */
#include <emscripten/emmalloc.h>

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

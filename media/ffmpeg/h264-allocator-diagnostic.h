/* Private diagnostic only; never enabled in a public engine or speed trial.
 * Emscripten 6.0.4 emmalloc API. Free-block walks run at most every 2.5s.
 * No allocation, trimming, heap growth, codec setting or file-data logging. */
#include <emscripten/emmalloc.h>
#include <libavformat/avformat.h>
#include <libavutil/time.h>

EM_JS(void, h264_allocator_emit,
      (unsigned count, double input, double output, unsigned dynamic_bytes,
       unsigned free_bytes, unsigned unclaimed_bytes, unsigned free_regions,
       const size_t *buckets, double elapsed_us, unsigned index_entries,
       unsigned index_logical_bytes, unsigned index_limit), {
  const callback = Module["withinBridge"].allocatorDiagnostic;
  if (!callback) return;
  callback({ sequence: count, inputBytes: input, outputBytes: output,
    dynamicHeapBytes: dynamic_bytes, freeDynamicBytes: free_bytes,
    unclaimedHeapBytes: unclaimed_bytes, freeRegions: free_regions,
    freeBlockSizeBuckets: Array.from(HEAPU32.subarray(buckets >> 2, (buckets >> 2) + 32)),
    samplerElapsedUs: elapsed_us, demuxIndexEntries: index_entries,
    demuxIndexLogicalBytes: index_logical_bytes, inputIndexLimitBytes: index_limit });
});

static void h264_allocator_snapshot(const AVFormatContext *context, int64_t input, int64_t output) {
  static int64_t last_sample_us;
  static unsigned count;
  int64_t now = av_gettime_relative();
  if (count >= 256 || (count && now - last_sample_us < 2500000)) return;
  last_sample_us = now;
  size_t buckets[32];
  size_t dynamic_bytes = emmalloc_dynamic_heap_size();
  size_t free_bytes = emmalloc_free_dynamic_memory();
  size_t unclaimed_bytes = emmalloc_unclaimed_heap_memory();
  size_t free_regions = emmalloc_compute_free_dynamic_memory_fragmentation_map(buckets);
  unsigned index_entries = 0;
  for (unsigned i = 0; i < context->nb_streams; i++)
    index_entries += avformat_index_get_entries_count(context->streams[i]);
  h264_allocator_emit(++count, (double)input, (double)output, dynamic_bytes,
      free_bytes, unclaimed_bytes, free_regions, buckets, av_gettime_relative() - now,
      index_entries, index_entries * sizeof(AVIndexEntry), context->max_index_size);
}

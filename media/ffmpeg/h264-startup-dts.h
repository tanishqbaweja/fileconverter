/* Bounded missing-prefix scheduling, not a codec or a nominal-CFR rewrite.
 * Matroska may omit the initial reordered DTS. Keep every known DTS/PTS and
 * derive ONLY that missing prefix from observed presentation intervals. A
 * verified reorder depth and a matching first-known DTS/earliest-PTS anchor
 * are required; otherwise return failure without modifying the output array.
 */
#ifndef WITHIN_H264_STARTUP_DTS_H
#define WITHIN_H264_STARTUP_DTS_H
#include <stdint.h>
#define WITHIN_H264_STARTUP_MAX_DELAY 16
#define WITHIN_H264_STARTUP_MAX_PACKETS 33

static int within_h264_startup_dts(int count, int delay, int64_t max_span,
                                  const int64_t *pts, const int64_t *dts,
                                  int64_t *output) {
  if (!pts || !dts || !output || delay < 1 ||
      delay > WITHIN_H264_STARTUP_MAX_DELAY || count != 2 * delay + 1 ||
      count > WITHIN_H264_STARTUP_MAX_PACKETS || max_span <= 0)
    return -1;
  int missing = 0;
  while (missing < count && dts[missing] == INT64_MIN) missing++;
  if (missing > delay) return -1;
  int64_t sorted[WITHIN_H264_STARTUP_MAX_PACKETS];
  int64_t previous = INT64_MIN;
  for (int i = 0; i < count; i++) {
    if (pts[i] == INT64_MIN) return -1;
    if (i >= missing) {
      if (dts[i] == INT64_MIN || dts[i] <= previous || dts[i] > pts[i])
        return -1;
      previous = dts[i];
    }
    sorted[i] = pts[i];
    for (int j = i; j > 0 && sorted[j] < sorted[j - 1]; j--) {
      const int64_t value = sorted[j];
      sorted[j] = sorted[j - 1]; sorted[j - 1] = value;
    }
  }
  for (int i = 1; i < count; i++)
    if (sorted[i] <= sorted[i - 1]) return -1;
  if ((uint64_t)sorted[count - 1] - (uint64_t)sorted[0] >
      (uint64_t)max_span) return -1;
  if (missing) {
    const int64_t anchor = dts[missing];
    const uint64_t span = (uint64_t)sorted[missing] - (uint64_t)sorted[0];
    if (anchor != sorted[0] || span > INT64_MAX ||
        anchor < INT64_MIN + 1 + (int64_t)span) return -1;
    for (int i = 0; i < missing; i++) {
      const int64_t delta = (int64_t)((uint64_t)sorted[missing] - (uint64_t)sorted[i]);
      if (anchor - delta > pts[i]) return -1;
    }
  }
  for (int i = 0; i < count; i++) output[i] = dts[i];
  for (int i = 0; i < missing; i++)
    output[i] = dts[missing] - (int64_t)((uint64_t)sorted[missing] - (uint64_t)sorted[i]);
  return missing;
}
#endif

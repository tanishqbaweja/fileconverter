#include <assert.h>
#include <string.h>
#include "h264-startup-dts.h"

int main(void) {
  const int64_t n = INT64_MIN;
  int64_t pts[5] = {0, 250, 83, 167, 500};
  int64_t dts[5] = {n, n, 0, 83, 167}, out[5];
  assert(within_h264_startup_dts(5, 2, 2000, pts, dts, out) == 2);
  assert(out[0] == -167 && out[1] == -84);
  assert(memcmp(out + 2, dts + 2, 3 * sizeof(int64_t)) == 0);
  assert(dts[0] == n && dts[1] == n); /* Inputs never mutated. */
  for (int i = 0; i < 5; i++) { pts[i] += 5000; if (dts[i] != n) dts[i] += 5000; }
  assert(within_h264_startup_dts(5, 2, 2000, pts, dts, out) == 2);
  assert(out[0] == 4833 && out[1] == 4916 && out[2] == 5000);
  const int64_t sentinel[5] = {9, 8, 7, 6, 5};
  memcpy(out, sentinel, sizeof(out));
  dts[3] = n; /* Interior missing time cannot be filled. */
  assert(within_h264_startup_dts(5, 2, 2000, pts, dts, out) < 0);
  assert(memcmp(out, sentinel, sizeof(out)) == 0);
  dts[3] = 5000; /* Duplicate/backwards known DTS. */
  assert(within_h264_startup_dts(5, 2, 2000, pts, dts, out) < 0);
  dts[3] = 5083;
  assert(within_h264_startup_dts(4, 2, 2000, pts, dts, out) < 0);
  assert(within_h264_startup_dts(5, 17, 2000, pts, dts, out) < 0);
  assert(within_h264_startup_dts(5, 2, 100, pts, dts, out) < 0);
  dts[2] = 4999; /* No matching observed presentation anchor. */
  assert(within_h264_startup_dts(5, 2, 2000, pts, dts, out) < 0);
  dts[2] = 5000; pts[1] = pts[2];
  assert(within_h264_startup_dts(5, 2, 2000, pts, dts, out) < 0);
  pts[1] = 5250; pts[0] = n;
  assert(within_h264_startup_dts(5, 2, 2000, pts, dts, out) < 0);
  for (int i = 0; i < 5; i++) pts[i] = INT64_MIN + 1 + i * 10;
  dts[0] = n; dts[1] = n; dts[2] = pts[0]; dts[3] = pts[0] + 1; dts[4] = pts[0] + 2;
  assert(within_h264_startup_dts(5, 2, 2000, pts, dts, out) < 0); /* Signed underflow. */
  assert(within_h264_startup_dts(5, 2, 2000, 0, dts, out) < 0);
  /* All supported reorder depths, every possible leading missing count and
     mixed presentation intervals. Known timestamps are never regenerated. */
  for (int delay = 1; delay <= WITHIN_H264_STARTUP_MAX_DELAY; delay++) {
    const int count = 2 * delay + 1;
    int64_t p[33], d[33], plan[33], saved[33];
    p[0] = 7000;
    for (int i = 1; i < count; i++) p[i] = p[i - 1] + (i % 2 ? 24 : 37);
    for (int missing = 0; missing <= delay; missing++) {
      for (int i = 0; i < count; i++) d[i] = i < missing ? n : p[i - missing];
      memcpy(saved, d, (size_t)count * sizeof(int64_t));
      assert(within_h264_startup_dts(count, delay, 2000, p, d, plan) == missing);
      assert(memcmp(d, saved, (size_t)count * sizeof(int64_t)) == 0);
      for (int i = 0; i < count; i++) {
        assert(plan[i] != n && plan[i] <= p[i]);
        if (i) assert(plan[i] > plan[i - 1]);
        if (i >= missing) assert(plan[i] == d[i]);
      }
    }
  }
  return 0;
}

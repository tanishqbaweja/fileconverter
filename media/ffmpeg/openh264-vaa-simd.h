// SPDX-License-Identifier: BSD-2-Clause
// Private exact-result candidate, not enabled in any conversion build yet.
#ifndef WITHIN_OPENH264_VAA_SIMD_H
#define WITHIN_OPENH264_VAA_SIMD_H
#include <stdint.h>
#include <string.h>
#include <wasm_simd128.h>

static inline int32_t within_vaa_sum(v128_t value) {
  value = wasm_i32x4_extadd_pairwise_i16x8(value);
  value = wasm_i32x4_add(value, wasm_i32x4_shuffle(value, value, 2, 3, 0, 1));
  value = wasm_i32x4_add(value, wasm_i32x4_shuffle(value, value, 1, 0, 3, 2));
  return wasm_i32x4_extract_lane(value, 0);
}

static inline void within_vaa_block(const uint8_t* current, const uint8_t* reference,
                                    int32_t stride, int32_t* sad, int32_t* sd, uint8_t* mad) {
  v128_t sums = wasm_i16x8_splat(0), signed_sums = sums, maxima = sums;
  for (int row = 0; row < 8; ++row) {
    // EXACTLY eight bytes per row: never read padding or the next row/block.
    const v128_t cur = wasm_u16x8_extend_low_u8x16(wasm_v128_load64_zero(current));
    const v128_t ref = wasm_u16x8_extend_low_u8x16(wasm_v128_load64_zero(reference));
    const v128_t diff = wasm_i16x8_sub(cur, ref);
    const v128_t absolute = wasm_i16x8_abs(diff);
    signed_sums = wasm_i16x8_add(signed_sums, diff);
    sums = wasm_i16x8_add(sums, absolute);
    maxima = wasm_i16x8_max(maxima, absolute);
    current += stride;
    reference += stride;
  }
  // Each sum lane is in [-2040, 2040]; each maximum is in [0, 255].
  *sad = within_vaa_sum(sums);
  *sd = within_vaa_sum(signed_sums);
  maxima = wasm_i16x8_max(maxima, wasm_i16x8_shuffle(maxima, maxima, 4, 5, 6, 7, 0, 1, 2, 3));
  maxima = wasm_i16x8_max(maxima, wasm_i16x8_shuffle(maxima, maxima, 2, 3, 0, 1, 6, 7, 4, 5));
  maxima = wasm_i16x8_max(maxima, wasm_i16x8_shuffle(maxima, maxima, 1, 0, 3, 2, 5, 4, 7, 6));
  *mad = (uint8_t)wasm_i16x8_extract_lane(maxima, 0);
}

static inline void within_vaa_simd(const uint8_t* current, const uint8_t* reference,
                                  int32_t width, int32_t height, int32_t stride,
                                  int32_t* frame_sad, int32_t* sad, int32_t* sd, uint8_t* mad) {
  const int32_t mb_width = width >> 4, mb_height = height >> 4;
  const int32_t step = (stride << 4) - width;
  int32_t index = 0;
  uint32_t frame = 0;
  for (int32_t y = 0; y < mb_height; ++y) {
    for (int32_t x = 0; x < mb_width; ++x) {
      for (int32_t quadrant = 0; quadrant < 4; ++quadrant) {
        const int32_t offset = (quadrant >> 1) * (stride << 3) + (quadrant & 1) * 8;
        within_vaa_block(current + offset, reference + offset, stride,
                         sad + index, sd + index, mad + index);
        // Explicit modulo-2^32 accumulation, checked against the actual compiled
        // pinned scalar implementation even when its signed frame sum overflows.
        frame += (uint32_t)sad[index++];
      }
      current += 16;
      reference += 16;
    }
    // Preserve the pinned implementation's non-multiple-of-16 width behavior.
    current += step;
    reference += step;
  }
  memcpy(frame_sad, &frame, sizeof(frame));
}
#endif

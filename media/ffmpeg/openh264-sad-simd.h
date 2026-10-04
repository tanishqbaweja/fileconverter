#ifndef WITHIN_OPENH264_SAD_SIMD_H
#define WITHIN_OPENH264_SAD_SIMD_H
#include <stdint.h>
#include <wasm_simd128.h>

// Exact unsigned-byte SAD only. No heuristic, reference or quality change.
// Each lane adds at most 16 * (2 * 255) = 8160; no 16-bit overflow.
// Width 8 reads exactly eight bytes, including at the Wasm memory boundary.
template<int Width, int Height>
static inline int32_t within_sad_simd(uint8_t* current, int32_t current_stride,
    uint8_t* reference, int32_t reference_stride) {
  static_assert((Width == 8 || Width == 16) && (Height == 8 || Height == 16), "SAD shape");
  v128_t sums = wasm_i16x8_splat(0);
  for (int row = 0; row < Height; ++row) {
    const v128_t a = Width == 8 ? wasm_v128_load64_zero(current) : wasm_v128_load(current);
    const v128_t b = Width == 8 ? wasm_v128_load64_zero(reference) : wasm_v128_load(reference);
    const v128_t absolute = wasm_i8x16_sub(wasm_u8x16_max(a, b), wasm_u8x16_min(a, b));
    sums = wasm_i16x8_add(sums, wasm_u16x8_extadd_pairwise_u8x16(absolute));
    current += current_stride;
    reference += reference_stride;
  }
  const v128_t wide = wasm_u32x4_extadd_pairwise_u16x8(sums);
  const v128_t pair = wasm_i32x4_add(wide, wasm_i32x4_shuffle(wide, wide, 2, 3, 0, 1));
  const v128_t total = wasm_i32x4_add(pair, wasm_i32x4_shuffle(pair, pair, 1, 0, 3, 2));
  return wasm_i32x4_extract_lane(total, 0);
}
#endif

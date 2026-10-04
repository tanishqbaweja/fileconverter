#include <emscripten/emscripten.h>
#include "sad-reference.h"
#include "openh264-sad-simd.h"

typedef int32_t (*sad_fn)(uint8_t*, int32_t, uint8_t*, int32_t);
// Keep the SIMD entry behind an actual indirect call like OpenH264's selected
// function pointers. The scalar bodies remain exactly upstream and -O3 may
// inline their SAD8x8 dependencies, just as in the production translation unit.
template<int Width, int Height>
__attribute__((noinline)) static int32_t probe_simd(uint8_t* a, int32_t sa, uint8_t* b, int32_t sb) {
  return within_sad_simd<Width, Height>(a, sa, b, sb);
}
static sad_fn select_sad(int shape, int optimized) {
  static sad_fn scalar[] = { within_sad_reference_8x8, within_sad_reference_16x8,
    within_sad_reference_8x16, within_sad_reference_16x16 };
  static sad_fn simd[] = { probe_simd<8,8>, probe_simd<16,8>, probe_simd<8,16>, probe_simd<16,16> };
  return shape >= 0 && shape < 4 ? (optimized ? simd[shape] : scalar[shape]) : nullptr;
}
extern "C" {
EMSCRIPTEN_KEEPALIVE int32_t sad_reference(int shape, uint8_t* a, int32_t sa, uint8_t* b, int32_t sb) {
  const sad_fn fn = select_sad(shape, 0);
  return fn ? fn(a, sa, b, sb) : -1;
}
EMSCRIPTEN_KEEPALIVE int32_t sad_simd(int shape, uint8_t* a, int32_t sa, uint8_t* b, int32_t sb) {
  const sad_fn fn = select_sad(shape, 1);
  return fn ? fn(a, sa, b, sb) : -1;
}
EMSCRIPTEN_KEEPALIVE uint32_t sad_batch(int shape, int optimized, uint8_t* a, int32_t sa,
    uint8_t* b, int32_t sb, uint32_t iterations) {
  const sad_fn fn = select_sad(shape, optimized);
  if (!fn || iterations > 2000000) return 0;
  uint32_t checksum = 0;
  for (uint32_t i = 0; i < iterations; ++i) {
    const uint32_t offset = (i & 63) * 1024;
    checksum += static_cast<uint32_t>(fn(a + offset, sa, b + offset, sb));
  }
  return checksum;
}
}

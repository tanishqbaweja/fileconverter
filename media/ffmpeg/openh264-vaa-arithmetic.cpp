#include <emscripten/emscripten.h>
#include "vaa-reference.h"
#include "openh264-vaa-simd.h"

extern "C" {
EMSCRIPTEN_KEEPALIVE void vaa_reference(const uint8_t* c, const uint8_t* r, int32_t w,
    int32_t h, int32_t s, int32_t* frame, int32_t* sad, int32_t* sd, uint8_t* mad) {
  within_vaa_reference(c, r, w, h, s, frame, sad, sd, mad);
}
EMSCRIPTEN_KEEPALIVE void vaa_simd(const uint8_t* c, const uint8_t* r, int32_t w,
    int32_t h, int32_t s, int32_t* frame, int32_t* sad, int32_t* sd, uint8_t* mad) {
  within_vaa_simd(c, r, w, h, s, frame, sad, sd, mad);
}
}

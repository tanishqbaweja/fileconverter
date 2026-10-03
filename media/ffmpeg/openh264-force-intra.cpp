#include <wels/codec_api.h>

// OpenH264 2.6.0's C vtable omits the layer argument of the C++ virtual
// ForceIntraFrame(bool, int) method. Wasm rejects that two-argument call.
// Cross the C boundary through a correctly typed function, then let C++ call
// the actual virtual method with its documented all-layers default (-1).
// Do not suppress source I frames or enable runtime function-cast emulation.
extern "C" int within_openh264_force_intra(ISVCEncoder *encoder, bool idr) {
  return encoder->ForceIntraFrame(idr, -1);
}

# JPEG XL header inspector

This separate libjxl 0.12.0 module parses only `JXL_DEC_BASIC_INFO`. It never
requests an image output event or allocates decoded pixels. The module has a
fixed 16 MiB Wasm memory, an 8 MiB tracked decoder-allocation limit, 64 KiB
source reads, a 128 KiB input window, and a hard 1 MiB total inspection ceiling.

The module reports dimensions, intrinsic dimensions, sample depth, color and
alpha channel counts, orientation, and animation timing/loop metadata. Exact
frame enumeration and complete validity remain in the fixed-memory conversion
worker. Reproduce it without Docker with the pinned Emscripten SDK:

```bash
bash images/libjxl-inspector/reproduce-nondocker.sh
```

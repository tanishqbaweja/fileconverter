# JPEG XL header inspector

This separate libjxl 0.12.0 module parses only `JXL_DEC_BASIC_INFO`. It never
requests an image output event or allocates decoded pixels. The module has a
fixed 16 MiB Wasm memory, an 8 MiB tracked decoder-allocation limit, 64 KiB
source reads, a 128 KiB input window, and a hard 4 MiB total inspection ceiling.

The module reports dimensions, intrinsic dimensions, sample depth, color and
alpha channel counts, orientation, and animation timing/loop metadata. It skips
pixel output while enumerating at most 1,000 displayed frame headers; counts are
explicit lower bounds when the 4 MiB scan ceiling is reached. Complete stream
validity remains in the fixed-memory conversion worker. Reproduce it without
Docker with the pinned Emscripten SDK:

The build fetches pinned libjxl, Brotli, Highway, libpng, and skcms commits;
libpng is a configure-time dependency and is not linked into this inspector.

```bash
bash images/libjxl-inspector/reproduce-nondocker.sh
```

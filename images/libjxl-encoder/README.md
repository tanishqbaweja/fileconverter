# Bounded JPEG XL encoder

This specialist module pins libjxl 0.12.0 and uses its chunked frame-input API
and single-buffer output processor. Pixel rectangles are requested only while a
frame is being encoded, output is released in at most 64 KiB writes, and the
output callback waits for each destination write before libjxl can continue.
The module never owns a complete compressed output.

The fixed 56 MiB Wasm heap, tracked 44 MiB encoder-allocation ceiling, 16 MiB
simultaneous pixel-callback ceiling, 8,192-pixel edge limit, 8,388,608-pixel
limit, 1,000-frame limit, 64 GiB aggregate decoded limit, 1,000:1 aggregate
expansion limit, and 128 MiB output limit are enforced independently. Encoding
is lossless at libjxl effort 1, the fastest setting. Animation uses a one-million
tick/second timebase so browser microsecond frame durations do not need rounding.

The public PNG, JPEG, WebP, GIF, AVIF, and BMP input profiles are lazy-loaded
through this module. Browser-decoded animation reuses one RGBA frame allocation
across the complete sequence. BMP avoids `ImageDecoder`: uncompressed 24-bit and
32-bit Windows BMP rows are read sequentially through the 256 KiB source bridge,
normalized with one reusable row of at most 32 KiB, and stored in the capped RGB
plane required by libjxl's synchronous region callbacks. Compressed, paletted,
and bitfield BMP variants fail with a clear unsupported-input error.

A second pinned Docker export reproduced the published JavaScript and Wasm
byte-for-byte. The current SHA-256 values are `15D504CC9AECCF9D20963329D93D7A6B860F21C46675C8DF690D963F8CA66879`
for `within-jxl-encoder.mjs` and `FAFB17CBD0B2E3E03CA7F6E2DD632FC0978DA5436B46943B9246FA3A2006A315`
for `within-jxl-encoder.wasm`.

The exact non-Docker reproduction command is documented with the shared pinned
builder in `../libjxl/README.md` and runs as an independent `jxl-encoder` CI job.

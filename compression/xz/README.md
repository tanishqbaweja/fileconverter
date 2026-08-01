# Bounded XZ Wasm engine

This module compiles the pinned XZ Utils 5.8.3 liblzma streaming API from
source with Emscripten 6.0.4. It exposes only the low-level incremental XZ
encoder/decoder wrapper used by the browser worker.

The worker copies at most 262,144 input bytes into a fixed 48 MiB Wasm memory,
drains at most 65,536 output bytes at a time, and awaits every destination
write before producing more output. Compression uses lossless preset 0 with a
CRC64 integrity check for the fastest low-memory XZ profile. The decoder has a
32 MiB liblzma allocation limit and the browser worker additionally enforces
64 GiB and 100:1 expansion limits.
TAR.XZ-to-ZIP streams those bounded decoder chunks directly into the shared
sequential USTAR parser and ZIP writer without an intermediate TAR file.
ZIP-to-TAR.XZ feeds validated USTAR chunks into the same encoder through a
64 KiB backpressured bridge, also without an intermediate TAR file.

Build reproducibly from the repository root:

```sh
npm run build:xz
```

The build verifies the upstream archive SHA-256 before compilation and exports
the generated ES module, Wasm binary, `LICENSE.xz` 0BSD liblzma license, and build manifest
to `public/engines/xz/`.

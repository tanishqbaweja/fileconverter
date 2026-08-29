# Bounded BZIP2 Wasm engine

This module compiles the pinned upstream libbzip2 1.0.8 low-level streaming API
from source with Emscripten 6.0.4. It does not use libbzip2's whole-buffer or
stdio helpers.

The browser worker copies at most 262,144 input bytes into a fixed 8 MiB Wasm
memory, drains at most 65,536 output bytes at a time, and awaits every
destination write before producing more output. Compression uses the standard
level-1 100 KiB block and work factor 30 for a faster, lower-memory browser
default without changing lossless fidelity. Decompression uses the normal-memory decoder,
rejects trailing data and truncation, and is additionally bounded by the
browser worker's 64 GiB and 100:1 expansion limits.
TAR.BZ2-to-ZIP streams those bounded decoder chunks directly into the shared
sequential USTAR parser and ZIP writer without an intermediate TAR file.
ZIP-to-TAR.BZ2 feeds validated USTAR chunks into the same encoder through a
64 KiB backpressured bridge, also without an intermediate TAR file.

Build reproducibly from the repository root:

```sh
npm run build:bzip2
```

The Docker recipe remains the canonical clean export. CI also performs an exact
non-Docker comparison with the same pinned Emscripten 6.0.4 SDK:

```sh
source work/emsdk/emsdk_env.sh
bash compression/bzip2/reproduce-nondocker.sh
```

That verifier requires Linux, keeps downloads/build/output under `work/`,
refuses unexpected `/src` or `/out` paths, checks available space and the
upstream archive hash, compares every generated file byte-for-byte, and removes
its scratch tree on success or failure.

The build verifies the upstream source SHA-256 before compilation and exports
the generated ES module, Wasm binary, upstream license, and machine-readable
manifest to `public/engines/bzip2/`.

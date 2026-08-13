# Bounded TIFF-to-PNG engine

This directory reproducibly builds the browser-only TIFF reader from pinned
libtiff, libpng, zlib, and Emscripten sources. It decodes one strip- or
tile-organized grayscale, palette, RGB, or RGBA image and streams PNG rows to
the selected destination. Contiguous and separated-planar pixels, none,
PackBits, LZW, Deflate, and baseline JPEG input compression are enabled.
Eight- and sixteen-bit samples plus the four non-transposed TIFF orientations
are supported. Multipage, transposed, and other layouts are rejected explicitly.

The Wasm heap is fixed at 40 MiB. Input reads are split at 256 KiB, output
writes at 64 KiB, decoded strips at 4 MiB, and only one destination write is
pending. Build with `npm run build:tiff` from the repository root.

# Bounded TIFF-to-PNG engine

This directory reproducibly builds the browser-only TIFF reader from pinned
libtiff, libpng, zlib, and Emscripten sources. It decodes one strip- or
tile-organized grayscale, palette, RGB, or RGBA image and streams PNG rows to
the selected destination. Contiguous and separated-planar pixels, none,
PackBits, LZW, Deflate, and baseline JPEG input compression are enabled.
Eight- and sixteen-bit samples plus all eight TIFF orientations are supported.
Transposed orientations are assembled in bounded output-row stripes rather than
a complete rotated raster. Multipage input converts the first page with an
explicit warning; other layouts are rejected explicitly.

The Wasm heap is fixed at 40 MiB. Input reads are split at 256 KiB, output
writes at 64 KiB, decoded strips and tile stripes at 4 MiB, transposed output
stripes at 16 MiB, and only one destination write is pending. Build with
`npm run build:tiff` from the repository root.

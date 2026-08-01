# Bounded 7Z reader

This module compiles the pinned libarchive 3.8.9 7-Zip reader and XZ Utils
5.8.3 liblzma core from source with Emscripten 6.0.4. It converts 7Z archives
to USTAR entirely inside a dedicated browser worker.

The custom callbacks read the browser `File` at arbitrary offsets in chunks no
larger than 262,144 bytes. TAR output is copied out of Wasm in owned chunks no
larger than 65,536 bytes and every destination write is awaited. The browser
adapter can stream those blocks directly through Chromium's GZIP transform for
7Z-to-TAR.GZ without materializing an intermediate TAR. Wasm memory is fixed at
64 MiB. The routes accept regular files and directories using COPY,
LZMA1, LZMA2, or PPMd and rejects encryption, links, special files, duplicates,
unsafe paths, unsupported codecs, more than 10,000 entries, more than 64 GiB of
payload, or expansion above 100:1.

Duplicate detection uses a fixed 32,768-slot open-addressed hash table, keeping
many-entry archives approximately linear instead of rescanning every prior name.

TAR-to-7Z is deliberately not included. Libarchive's 7-Zip writer first stores
the entire encoded archive in a temporary file. In a filesystem-free browser
Wasm build that would become a prohibited full-output memory copy; a future
writer must instead bridge that scratch file to bounded OPFS storage.

Build reproducibly from the repository root:

```sh
npm run build:archive7z
```

# Bounded 7Z reader and writer

This module compiles the pinned libarchive 3.8.9 7-Zip reader and XZ Utils
5.8.3 liblzma core from source with Emscripten 6.0.4. It converts 7Z archives
to USTAR and converts bounded USTAR input to LZMA2-compressed 7Z entirely
inside a dedicated browser worker.

The custom callbacks read the browser `File` at arbitrary offsets in chunks no
larger than 262,144 bytes. TAR output is copied out of Wasm in owned chunks no
larger than 65,536 bytes and every destination write is awaited. The browser
adapter can stream those blocks directly through Chromium's GZIP transform for
7Z-to-TAR.GZ or through the bounded USTAR parser and raw-DEFLATE ZIP writer for
7Z-to-ZIP without materializing an intermediate TAR. Wasm memory is fixed at
56 MiB. The routes accept regular files and directories using COPY,
LZMA1, LZMA2, or PPMd and rejects encryption, links, special files, duplicates,
unsafe paths, unsupported codecs, more than 10,000 entries, more than 64 GiB of
payload, or expansion above 100:1.

For TAR-to-7Z, a small pinned patch replaces libarchive's native temporary-file
calls with synchronous 64 KiB OPFS callbacks. The encoded payload therefore
never enters MEMFS or the Wasm heap, and the app truncates, closes, and deletes
the app-owned scratch file after success, failure, or cancellation. A bounded
256 KiB GZIP sample selects LZMA2 preset 0 when it is useful and lossless COPY
when recompression would only waste CPU or increase the result.

Duplicate detection uses a fixed 32,768-slot open-addressed hash table, keeping
many-entry archives approximately linear instead of rescanning every prior name.

The source patch is retained in this directory and applied by the pinned Docker
build, making the browser scratch bridge reproducible and auditable.

Build reproducibly from the repository root:

```sh
npm run build:archive7z
```

The Docker recipe remains the canonical clean export. CI also performs an exact
non-Docker comparison with the same pinned Emscripten 6.0.4 SDK:

```sh
source work/emsdk/emsdk_env.sh
bash compression/libarchive7z/reproduce-nondocker.sh
```

The verifier requires Linux, keeps both source archives and all build/output
data under `work/`, checks free space plus both upstream hashes, refuses
unexpected `/src` or `/out` paths, compares every artifact byte-for-byte, and
removes only the scratch paths it created on success or failure.

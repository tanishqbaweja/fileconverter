# Reproducible FFmpeg WebAssembly remux core

This directory builds the browser media engine from the official FFmpeg source.
The resulting module uses FFmpeg libraries directly and does not compile or run
the `ffmpeg` command-line program.

## Pinned inputs

- FFmpeg 8.1.2 source archive:
  `464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c`
- Emscripten SDK 6.0.4 amd64 image:
  `sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b`

## Build

From the repository root:

```powershell
docker build --file media/ffmpeg/Dockerfile --output type=local,dest=public/engines/remux media/ffmpeg
```

The Docker build downloads the pinned source archive, verifies its SHA-256,
configures only the documented demuxers/muxers/parsers/bitstream filters, and
exports the JavaScript module, Wasm binary, and a build manifest.

The input and output `AVIOContext` buffers are each 256 KiB. JavaScript handles a
single awaited read or write at a time. Input reads use bounded `Blob.slice()`
ranges. Output writes use positional `FileSystemWritableFileStream` operations,
so neither the source nor completed destination is mirrored into MEMFS.

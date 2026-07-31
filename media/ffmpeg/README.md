# Reproducible FFmpeg WebAssembly remux core

This directory builds the browser media engine from the official FFmpeg source.
The resulting module uses FFmpeg libraries directly and does not compile or run
the `ffmpeg` command-line program.

## Pinned inputs

- FFmpeg 8.1.2 source archive:
  `464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c`
- libvpx 1.16.0 source archive:
  `7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c`
- Emscripten SDK 6.0.4 amd64 image:
  `sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b`

## Build

From the repository root:

```powershell
docker build --file media/ffmpeg/Dockerfile --output type=local,dest=public/engines/remux media/ffmpeg
```

The Docker build downloads the pinned source archives, verifies both SHA-256
values, builds a VP8-encoder-only libvpx, configures only the documented
demuxers, muxers, codecs, parsers, and bitstream filters, and exports the
JavaScript module, Wasm binary, and build manifest.

The build emits two lazy-loaded WebAssembly SIMD modules from the same pinned
libraries and wrapper. `within-remux` has no pthread pool and handles audio,
stream copy, and the pending MPEG-4 profile. `within-webm` preloads a fixed pool
of eight pthread workers for its four-thread HEVC/H.264 decode and four-thread
VP8 encode contexts. The conversion worker and its children are terminated
during job cleanup. VP8 is built in realtime-only mode and uses four token
partitions, realtime deadline, `cpu-used=8`, and zero lookahead. Current stable
Chromium therefore requires cross-origin isolation and `SharedArrayBuffer`. The
scalar file I/O bridge stays single-flight, and each module's shared Wasm memory
retains its 32 MiB initial and 96 MiB maximum sizes.

The input and output `AVIOContext` buffers are each 256 KiB. JavaScript handles a
single awaited read or write at a time. Input uses a bounded browser File stream
and reopens that stream at a genuine FFmpeg seek. Output writes use positional
`FileSystemWritableFileStream` operations, so neither the source nor completed
destination is mirrored into MEMFS.

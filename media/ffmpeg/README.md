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

The build emits four lazy-loaded WebAssembly SIMD modules from the same pinned
libraries and wrapper. `within-remux` has no pthread pool and handles audio and
stream copy. `within-direct` is the direct-save MKV-to-MP4 specialist and uses a
1 MiB output AVIO buffer to reduce synchronous browser-file write crossings.
`within-mpeg4` uses a fixed four-worker pool for two-thread HEVC/H.264 decode and
MPEG-4 Part 2 encode. `within-webm` uses a fixed eight-worker pool for
four-thread decode and VP8 encode. The conversion worker and each module's pool
workers are counted in runtime diagnostics and terminated during job cleanup.
VP8 is built in realtime-only mode and uses four token
partitions, realtime deadline, `cpu-used=8`, and zero lookahead. Current stable
Chromium therefore requires cross-origin isolation and `SharedArrayBuffer`. The
scalar file I/O bridge stays single-flight, and each module's shared Wasm memory
retains its 32 MiB initial and 96 MiB maximum sizes.

The input `AVIOContext` buffer is 256 KiB. Output is 256 KiB except for the
direct-save MKV-to-MP4 specialist's fixed 1 MiB buffer. JavaScript still handles
one read or write at a time. Input uses a bounded browser File stream and reopens
that stream at a genuine FFmpeg seek. Output writes use positional
`FileSystemWritableFileStream` operations, so neither the source nor completed
destination is mirrored into MEMFS.

The shared remux core accepts both Matroska and genuine QuickTime MOV input.
It preserves valid demuxer DTS values (including MOV edit-list timing) and only
synthesizes a video DTS sequence when a stream begins without decode
timestamps, as the protected large Matroska fixture does.

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
one read or write at a time. Input uses synchronous bounded `FileReaderSync`
slices inside the dedicated worker, with the bounded BYOB stream bridge retained
as a compatibility fallback. FFmpeg seeks by requesting a new slice. Output writes use positional
`FileSystemWritableFileStream` operations, so neither the source nor completed
destination is mirrored into MEMFS.

The pinned FFmpeg tree is patched reproducibly with
`patches/amr-bounded-packets.patch`. Its AMR demuxer emits only complete AMR
frames and batches them into packets capped at 32 KiB, avoiding corrupt partial
frames at AVIO refill boundaries and reducing demux overhead. The audio
pipeline also batches frame-size-zero PCM encoders into fixed 8,192-sample FIFO
frames; total FIFO occupancy remains capped at 16,384 samples.

The lean core includes AVI, FLV, and MPEG-TS demuxers plus H.264/HEVC and
MPEG-4 Part 2 parsers. Transport
probing is capped at 2 MiB and two seconds of analyzed media. AAC packets use the
`aac_adtstoasc` bitstream filter before fragmented MP4/M4A muxing; WAV conversion
uses the existing bounded AAC decode, resample, and PCM pipeline. AVI can copy
the verified MPEG-4 Part 2/MP3 combination to fragmented MP4, or decode its MP3
audio through the same bounded PCM path.

The shared remux core accepts Matroska, genuine QuickTime MOV, 3GP, AVI,
MPEG-TS, and FLV input. 3GP reuses the lean MOV-family demuxer and supports the
verified H.264/AAC stream-copy and bounded AAC decode routes without adding a
larger codec module.
It preserves valid demuxer DTS values (including MOV edit-list timing) and only
synthesizes a video DTS sequence when a stream begins without decode
timestamps, as the protected large Matroska fixture does.

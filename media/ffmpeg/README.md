# Reproducible FFmpeg WebAssembly remux core

This directory builds the browser media engine from the official FFmpeg source.
The resulting module uses FFmpeg libraries directly and does not compile or run
the `ffmpeg` command-line program.

## Pinned inputs

- FFmpeg 8.1.2 source archive:
  `464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c`
- OpenCORE AMR 0.1.6 source archive:
  `483eb4061088e2b34b358e47540b5d495a96cd468e361050fae615b1809dc4a1`
- libopus 1.6.1 source archive:
  `6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1`
- libogg 1.3.6 source archive:
  `5c8253428e181840cd20d41f3ca16557a9cc04bad4a3d04cce84808677fa1061`
- libvorbis 1.3.7 source archive:
  `b33cc4934322bcbf6efcbacf49e3ca01aadbea4114ec9589d1b1e9d20f72954b`
- libvpx 1.16.0 source archive:
  `7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c`
- Emscripten SDK 6.0.4 amd64 image:
  `sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b`

## Build

From the repository root:

```powershell
docker build --file media/ffmpeg/Dockerfile --output type=local,dest=public/engines/remux media/ffmpeg
```

The Docker build downloads the pinned source archives, verifies every SHA-256
value, builds static OpenCORE AMR, libopus, libogg, libvorbis, and a VP8/VP9-encoder-only libvpx with both decoders disabled,
configures only the documented demuxers, muxers, codecs, parsers, and bitstream filters, and exports the
JavaScript module, Wasm binary, and build manifest.

The build emits five lazy-loaded WebAssembly SIMD modules from the same pinned
libraries and wrapper. `within-remux` has no pthread pool and handles audio and
stream copy. `within-direct` is the direct-save MKV-to-MP4 specialist and uses a
1 MiB output AVIO buffer to reduce synchronous browser-file write crossings.
`within-mpeg4` uses a fixed four-worker pool for two-thread HEVC/H.264 decode and
MPEG-4 Part 2 encode. `within-webm` uses a fixed eight-worker pool for
four-thread decode and VP8 encode. `within-vp9` uses a fixed eight-worker pool
and four-thread VP9 encode; inputs wider than 1,280 pixels limit decoding to two
threads while the 640-wide encoder remains four-threaded. The conversion worker
and each module's pool workers are counted in runtime diagnostics and terminated
during job cleanup.
VP8 uses four token partitions. VP8 and VP9 use realtime deadline,
`cpu-used=8`, and zero lookahead; VP9 also enables row multithreading and two
tile columns. Current stable
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
frames; total FIFO occupancy remains capped at 16,384 samples. The FIFO is
preallocated to that hard cap and is reallocated only if the current free space
is insufficient, avoiding allocator work in the normal audio hot path.

The same single-threaded audio core writes genuine AIFF with signed 16-bit
big-endian PCM for the measured AAC/ALAC M4A, raw AAC, AMR-NB, MP3, FLAC, WAV,
WMA2, Vorbis, and Opus inputs. Destination packets are coalesced before the
single-flight positional write, while the custom AVIO buffer and FIFO retain
their fixed bounds. The build enables only the AIFF muxer and `pcm_s16be`
encoder needed for these profiles; it adds no codec library or extra worker.

The same lean module links the pinned static OpenCORE AMR library and writes
genuine 8 kHz mono AMR-NB in fixed MR122 mode for AAC/ALAC M4A, raw AAC, MP3,
FLAC, WAV, WMA2, AIFF, Vorbis, and Opus inputs. The encoder consumes signed
16-bit samples from the bounded resampler/FIFO pipeline. AMR frames reach the
custom AVIO callback as 32-byte writes, with one destination operation in
flight and no complete output copy. This requires FFmpeg's `--enable-version3`;
the configured FFmpeg build is therefore LGPL-3.0-or-later, while OpenCORE AMR
is distributed under Apache-2.0.

The lean core also links pinned static libopus and writes genuine Ogg Opus for
AAC/ALAC M4A, raw AAC, AMR-NB, MP3, FLAC, WAV, WMA2, AIFF, and Vorbis input.
The measured fastest quality-valid profile uses complexity 0, packed float,
64 kb/s mono or 128 kb/s stereo VBR, and preserves supported libopus input
rates to avoid needless resampling. Ogg output uses a deterministic serial path
so header generation cannot block on unavailable Wasm entropy and clean builds
produce repeatable bytes.

The same bounded audio pipeline links pinned reference libvorbis and writes
genuine Ogg Vorbis from AAC/ALAC M4A, raw AAC, AMR-NB, MP3, FLAC, WAV, WMA2,
AIFF, and Opus input. The measured quality-4 VBR setting was 27.7% faster than
FFmpeg's experimental native encoder on the protected five-minute reference,
while producing a 41.5% smaller file and balanced 23.5 dB channel ASDR. Source
rates through 48 kHz are preserved; this made the one-hour AMR path 5.47x
faster than unnecessary 48 kHz upsampling. Ogg headers use the deterministic
bitexact path, and all decoding, resampling, FIFO, AVIO, and single-flight
destination bounds remain unchanged.

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
The same core writes certified H.264/AAC FLV directly through custom AVIO. It
copies only the first video/audio pair, explicitly reports unsupported stream
and metadata exclusions, and seeks back only for the muxer's fixed-size
duration and file-size trailer updates rather than retaining a growing index.
For certified AV1 Matroska input, the same lean core skips decoder-oriented
stream analysis and copies AV1 plus compatible Opus/Vorbis packets directly to
live WebM. Five-second or 5 MiB clusters bound muxer buffering; duration and cue
indexes are omitted so memory cannot grow with media duration.
It preserves valid demuxer DTS values (including MOV edit-list timing) and only
synthesizes a video DTS sequence when a stream begins without decode
timestamps, as the protected large Matroska fixture does.

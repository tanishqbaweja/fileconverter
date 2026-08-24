# Bounded AVIF encoder

This reproducible module combines pinned FFmpeg 8.1.2 with libaom 3.13.2 and
uses a project-owned FFmpeg AVIF muxer patch to stream media data through a
seekable custom AVIO bridge instead of retaining the complete output in Wasm.
It uses one backpressured destination operation, 64 KiB output writes, bounded
256 KiB RGBA input strips and reusable YUV420/alpha frames. Static jobs lazy
load a fixed 80 MiB Wasm heap; animations lazy load a separate fixed 88 MiB
variant so static first-use memory remains below the complete-Chromium ceiling.

The fastest accepted policy uses realtime libaom, one thread, `cpu-used=8`,
zero lookahead, reduced references, single-frame mode for static output, color
CRF 32, and lossless grayscale alpha. Static and animated
outputs carry BT.709/sRGB color tags; animated timing uses an exact microsecond
timebase. Public routes still require independent browser correctness,
repeatability, and complete-Chromium incremental-private-memory evidence.

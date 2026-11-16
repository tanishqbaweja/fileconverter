# Reusable qualification code (not user media)

`within-test-mkv-header-core.mjs` and `.wasm` are a single explicitly reusable
private test engine, about 2.33 MiB combined. They are not served by the public
site or advertised as a released converter. No selected file, converted output,
profile, decoded media, or user metadata is retained here.

These exact code bytes are bound to the complete source-built proof
`evidence/2026-11-15T08-00-36-051Z-mkv-hevc-header-parser-loop-source-control.json`.
The loader rechecks full hashes, byte counts, ABI, source/build identity and
fixed Wasm limits before each use. Cached delivery is explicitly identified;
it does not claim that an old remote artifact still exists or that a new build
was performed. All disposable extraction archives/runtime data are removed.

Source: commit `0e2f2caa924413a1edc81c23c49c027dd952fec8`, pinned non-Docker
FFmpeg/Emscripten derivations under `media/ffmpeg/`. The engine's LGPL license
is retained here at `LICENSE.ffmpeg-lgpl3` with the auditable
source/build scripts. The cache prevents repeated identical builds caused only
by one-day hosted-artifact expiry. Remove this exact pair when superseded or no
longer needed for qualification; do not accumulate obsolete engine copies here.
The original artifact's exact LGPL license bytes are also authenticated against
the complete source-built proof and checked before cached code is used.

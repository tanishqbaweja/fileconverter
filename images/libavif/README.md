# Bounded AVIF decoder

This engine combines pinned libavif, libaom, FFmpeg, libpng, and zlib sources to
decode animated AVIF incrementally into a streamed PNG-frame ZIP. Its published
memory, size, frame, write, and expansion bounds are declared in
`public/engines/avif/build-manifest.json`.

The Docker recipe remains the canonical clean export. CI also reproduces the
decoder and encoder exactly without Docker using Emscripten 6.0.4:

```sh
source work/emsdk/emsdk_env.sh
bash images/libavif/reproduce-nondocker.sh decoder
bash images/libavif/reproduce-nondocker.sh encoder
```

Each Linux verifier keeps every clone, download, build, and output under
`work/`, checks free space and all pinned source identities, refuses unexpected
`/src` or `/out` paths, compares every artifact byte-for-byte, and removes only
the scratch paths it created on success or failure.

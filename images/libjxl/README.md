# Bounded JPEG XL decoder

This specialist engine pins libjxl 0.12.0 and decodes JPEG XL to PNG. The still
route emits the first rendered frame; the animation route emits every displayed,
coalesced frame as an ordered PNG entry in a stored ZIP with `animation.json`
timing and loop metadata. Input is supplied incrementally through a 1 MiB window
filled by at most 256 KiB browser reads. Still images use a bounded 256-row
stripe. Animation accepts libjxl's arbitrary callback order in one explicitly
capped 16 MiB frame surface, then releases it before decoding the next frame.
libpng output and ZIP payload are written directly in at most 64 KiB chunks with
one pending destination operation; no complete frame set or archive is buffered.

The module has a fixed 112 MiB Wasm memory, a 102 MiB tracked libjxl allocation
ceiling, an 8,192-pixel edge limit, an 8,388,608-pixel image limit, a 16 MiB
output stripe/frame-surface limit, a 4 MiB ICC-profile limit, a 96 MiB PNG-output
limit per frame, a 1,000-frame limit, a 64 GiB aggregate decoded limit, and a
1,000:1 aggregate expansion limit.
It applies the encoded orientation, unpremultiplies associated alpha, and embeds
the decoder output ICC profile when libjxl provides one. Extra channels other
than the primary alpha are rendered or omitted according to libjxl's display
semantics and are not preserved as independent PNG channels.

Both public browser routes passed native-decoder correctness, failure cleanup,
direct-destination behavior, and three complete-Chrome memory profiles. The
animation route uses measured compression level 1 for speed; the same setting
remains rejected for the larger still profile because that profile exceeded the
memory ceiling. Exact results and reproducibility evidence are in `TESTED.md`.

Regenerate the tracked animation fixture with `npm run fixtures:jxl-animation`.
The generator requires the exact `cjxl` 0.12.0 executable through `WITHIN_CJXL`,
the project-local extracted release, or `PATH`; it rejects other versions. The
official Windows static-release URL and SHA-256 are pinned in the generator.
This native tool is development-only and is never shipped to or invoked by the
browser application.

The Docker recipes remain the canonical clean exports. CI also performs exact
non-Docker decoder and encoder comparisons with the same pinned Emscripten 6.0.4
SDK and libjxl commit:

```sh
source work/emsdk/emsdk_env.sh
bash images/libjxl/reproduce-nondocker.sh decoder
bash images/libjxl/reproduce-nondocker.sh encoder
```

Each verifier requires Linux, keeps its clone, downloads, build, and output
under `work/`, verifies every pinned source identity, refuses unexpected `/src`
or `/out` paths, compares all artifacts byte-for-byte, and removes only the
scratch paths it created on success or failure.

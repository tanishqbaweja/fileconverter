# Bounded JPEG XL decoder

This specialist engine pins libjxl 0.12.0 and decodes the first rendered JPEG XL
frame to PNG. Input is supplied incrementally through a 1 MiB window filled by
at most 256 KiB browser reads. libjxl writes partial scanlines into a bounded
256-row stripe; completed stripes are immediately encoded by libpng and emitted
through at most 64 KiB destination writes with one pending write.

The module has a fixed 112 MiB Wasm memory, a 102 MiB tracked libjxl allocation
ceiling, an 8,192-pixel edge limit, an 8,388,608-pixel image limit, a 16 MiB
output stripe limit, a 4 MiB ICC-profile limit, and a 96 MiB PNG-output limit.
It applies the encoded orientation, unpremultiplies associated alpha, and embeds
the decoder output ICC profile when libjxl provides one. Extra channels other
than the primary alpha are rendered or omitted according to libjxl's display
semantics and are not preserved as independent PNG channels.

The public browser route passed native-decoder correctness, failure cleanup,
direct-destination behavior, three complete-Chrome memory profiles, and clean
build reproducibility. Exact results and the rejected faster-but-over-budget
compression experiment are recorded in `TESTED.md`.

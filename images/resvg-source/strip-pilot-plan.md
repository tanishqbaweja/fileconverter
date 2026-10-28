# Next private SVG experiment — not a supported profile

The6M effects input and independent reference are immutable (see the allocation
terminal receipt). The observed blocker is a24MB null payload allocation before
PNG encoding under the existing96MiB Wasm maximum. The Arc-overflow alternative
was excluded by the actual native probe. Do not replay that diagnostic unchanged.

Rejected shortcut: the upstream `crop` render option allocates/renders the entire
pixmap first, then clones the requested rectangle. It cannot avoid this failure.
Upstream `cropByBBox` instead changes the parsed tree's viewBox/size before
`render()`. This is a candidate for a private viewport experiment, not proof of
correct tiled rendering. Resvg's group/filter bounding-box clipping depends on
canvas size and coordinate transforms; nested masks/filters can change results.

Pinned source locations:

- [Wrapper render/crop](https://github.com/thx/resvg-js/blob/9ca058462ac529120c8cc84ddcd6fef644cc5406/src/lib.rs)
- [Group/filter clip regions](https://github.com/RazrFalcon/resvg/blob/3495d8705b302d6d266748516973606ca9657906/crates/resvg/src/render.rs)
- [Actual premultiplied pixels and PNG demultiplication](https://github.com/RazrFalcon/tiny-skia/blob/v0.10.0/src/pixmap.rs)

Implementation sequence:

1. Reuse the parsed tree and one owned native BBox, not a fresh parse per strip.
   Map each output strip into the ORIGINAL viewBox/aspect-ratio transform.
   Do not assume that arbitrary viewBox coordinates equal output pixel positions.
   The first6M pilot may explicitly restrict its private coordinate contract to
   the unchanged fixture; that restriction is not general SVG support.
2. Render a bounded viewport with required overlap, retain only its central rows,
   and free each RenderedImage before rendering the next. Use an owned virtual
   source overlay in the existing Vite worker build; no silent production switch,
   Node renderer, native converter, fixture simplification, or cap increase.
   Keep the production direct destination, atomic cancel, error lifecycle, and
   normal-profile complete-tree measurement.
3. Derive safe overlap from supported filter influence and transforms. A fixed
   guessed overlap is NOT a universal solution for blur, offset, displacement,
   morphology, lighting, turbulence, or multi-primitive chains. Record exact
   bounds and reject unsupported private cases rather than silently clip effects.
4. The pixels getter returns copied PREMULTIPLIED RGBA, whereas the incremental
   writer requires STRAIGHT RGBA. Match the pinned tiny-skia0.10 conversion's
   f64 rounding and transparent/opaque behavior. Validate alpha with native
   decoded RGBA, not only the existing rgb24 SSIM threshold. Never feed raw
   premultiplied pixels directly into the PNG writer.
5. Feed complete central rows through `workers/rgba-png-stream.ts` with its
   fixed256KiB filtered-strip and64KiB serial destination-write caps. No full
   PNG/RGBA collection, Blob, second full-frame surface, or unbounded messages.
   Count every pixel copy, codec/queue buffer, and actual Wasm peak honestly.
6. First actual experiment: original6M source/reference, fixed96MiB Wasm and
   same fidelity>=0.99, additional seam/alpha checks, zero service exclusions,
   unchanged early stable blank/250MiB formula. Record failure and stop duplicate
   runs if it still fails; successful output is independently decoded/validated.
7. Only after correctness: compare identical-input/settings timings, tune strip
   height/overlap/filtering with controlled candidates, retain only faster valid
   configurations. Then three same-session repeats plus clean-session checks,
   real UI cancel, direct-write failure, same-page retries, all owned cleanup.

The strip writer alone does not fix native allocation, establish a speed gain,
qualify any SVG input, or close the original project goal. No public adoption
until all relevant source/reproducibility, fidelity, security, memory, recovery,
registry, UI, and documentation gates agree.

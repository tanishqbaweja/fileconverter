# Private SVG source reconstruction

## Blur-boundary extent candidate (private, numeric only, 2026-10-30 IST)

New alpha components isolate two differences: rounded shapes without filters
differ at7776 alpha pixels/max18, hard rectangles without filters match exactly,
and hard rectangles with the original filter differ at38067/max34. All RGB scores
pass0.99, but the exact-alpha gate still FAILS. Bounded spatial evidence places
the largest filtered error near the cropped convolution edge. See
`evidence/2026-10-29-svg-alpha-components-terminal.json`. Do not replay these
unchanged components or relabel their214.906MiB small diagnostic as acceptance.

The pinned [box-blur source](https://raw.githubusercontent.com/RazrFalcon/resvg/3495d8705b302d6d266748516973606ca9657906/crates/resvg/src/filter/box_blur.rs)
uses five finite-extent passes. A compiled numeric negative control observes
edge alpha79 versus136 when intermediate values are retained on a larger
zero-extended domain, with identical center255. The private
`blur-boundary-entry.rs` correction adds one zero halo through all passes and
crops only afterward, leaving every kernel, weight, pass count and rounding
function unchanged. Source checksum/reversal is enforced by
`blur-boundary-patch.mjs`; the original MPL notice remains in the resulting file.
This targets the [zero-extension boundary rule](https://www.w3.org/TR/filter-effects-1/#element-attrdef-fegaussianblur-edgemode),
not altered SVG parameters or post-render alpha smoothing.

All four host numeric tests pass using installed Rust1.75.0, NOT the pinned Wasm
nightly. At sigma6 the unchanged kernel widths9,9,9,9,11 require a21-pixel halo.
For a3000x224 viewport, two expanded temporary buffers specify6,473,376 bytes,
plus2,688,000 input bytes; this is payload arithmetic, NOT a measured renderer
peak. The96MiB global cap must not increase. Checked extents and a pre-allocation
guard are tested, but browser OOM/recovery is not proved. Those first host tests
were numeric-only; the separately executed source build below now integrates the
patch. Rounded-edge coverage remains unresolved. See
`evidence/2026-10-29-svg-blur-boundary-numeric-terminal.json`.

The fifth-proof integration now exists separately in
`blur-boundary-build-recipe.mjs`, `owned-blur-boundary-patch.mjs` and
`reproduce-blur-boundary-source.mjs`, with the dedicated
`svg-source-blur-boundary.yml` workflow. Generated compiler/reproducer syntax,
lint, source ownership/replay guards and workflow cleanup checks pass13 focused
tests. The subsequent run40952659246 at7a60933d succeeded in206s: both fresh
builds ran both4-test numeric sets with the pinned nightly, verified retained
source corrections and produced exactly identical3,669,418B raw Wasm,
SHA b71a7cb32dea835ab11d3369b2aedcb39aabbcb60f27e4679d803d62f0a802fc.
Source/driver/owner/inspection scratch and duplicate raw/lock are removed, with no
local binary copies. See `evidence/2026-10-29-svg-blur-boundary-source-terminal.json`.
Next cap/repeat postprocessing and qualify the changed bytes
in the browser. Do not rebuild the unchanged old candidate, publish the
source-only patch, loosen exact alpha, or infer speedup.

The single source run40952659246 was originally recorded in
`evidence/2026-10-29-svg-blur-boundary-source-dispatch.json`. During that run,
`blur-boundary-postprocess-recipe.mjs` and
`postprocess-blur-boundary-source.mjs` prepare the next distinct stage without
editing historical postprocessors. The new inspector mode
`scripts/inspect-svg-filter-build.mjs --blur-boundary` requires the exact hosted
run/head to finish successfully, verifies the artifact digest and all six
members, both fresh source receipts, all five patches and pinned-nightly4+4
numeric proofs. Only its authenticated input pin may feed postprocessing. The
new postprocessing workflow may now use that verified raw pin.
No local source artifact copies are retained. Postprocessing still requires two
byte-identical bindgen/glue/cap results and unchanged static ABI/96MiB maximum;
neither stage counts as rendering, memory, fidelity, recovery or public acceptance.

## Premultiplied-transfer candidate (private, 2026-10-29)

The opacity controls reproduced predictions recorded before execution: the
opaque case matched, opacity 0.65 exposed a red-channel discrepancy, and 0.9
exposed a green-channel discrepancy. This supports testing the order of transfer,
premultiplication and rounding; it does not prove Chromium's internal algorithm.
See `evidence/2026-10-29-svg-precision-opacity-terminal.json`.

The new candidate starts from the lifetime-patched source, not the rejected
floating-point final merge. It preserves 8-bit multi-input compositing and
replaces the transfer methods with fixed premultiplied lookup tables. Each table
has 65,536 byte entries; two tables total 128 KiB, independent of file or viewport
size. There is no viewport-sized float accumulator. A single-input merge can
copy through the existing output dimensions without unnecessary color transfer.

Four compiled host arithmetic tests pass, including the opaque-row fingerprint
of both original lookup tables. Run the local arithmetic check after meaningful
changes with an installed `WITHIN_RUSTC_EXECUTABLE` and
`node scripts/run-repository-owned-node.mjs scripts/test-svg-filter-precision-kernel.mjs --premultiplied`.
This is not a renderer or browser conversion test.

The `svg-source-premultiplied-transfer.yml` workflow invokes
`node images/resvg-source/reproduce-filter-context-source.mjs --premultiplied`,
requires two fresh locked builds and pinned-nightly numeric tests, and compares
complete raw bytes. Its actions and Node version are pinned. Raw output is not
browser-ready: repeated bindgen/cap/ABI verification and actual browser fidelity,
250 MiB full-tree memory, speed and recovery testing remain mandatory. The
original 96 MiB cap and acceptance inputs must not change.

Source run `40842628275` at `96a4a09a` now succeeds: both fresh raw builds are
byte-identical and both pinned-nightly arithmetic checks pass. The authenticated
raw module is 3,667,913 bytes, SHA-256
`1df4c1453ea928d7c29e2cc9b06d3cb708d4a32438c524dd9e5e9517080e0f1b`.
See `filter-premultiplied-raw-input.json` and
`evidence/2026-10-29T08-37-13-491Z-svg-filter-source-artifact.json`. No local binary
copies remain. Repeated capped postprocessing has also succeeded below; do not
rebuild this unchanged source or replay the completed controls to restate it.

Processing run `40844028971` also succeeds and its exact artifact is authenticated.
The private capped module is 2,687,070 bytes, SHA-256
`8641a4135ecc96c61edd9ff9efabb225a2c4ac041e78ec8322440ee5f44c35e0`, with 26
initial pages and the unchanged 1,536-page (96 MiB) maximum, unshared. Its binding
bytes and static ABI match the preceding candidate. See
`filter-premultiplied-processed-input.json` and
`evidence/2026-10-29-svg-premultiplied-build-terminal.json`. No local binary copies
remain. Browser conversion has now run for these bytes: the original opaque
small full/strip pair passes all-band fidelity, three original six-million-pixel
runs pass functional fidelity, and basic transparent rectangles match an
independent analytic golden exactly. The original large strict verdict still
FAILS because the earliest blank baseline was unstable; it is not memory or
publication acceptance. Buffer lifecycle, real cancellation, first-write failure
and same-page recovery were also exercised. See
`evidence/2026-10-29-svg-premultiplied-6m-repeat-terminal.json`,
`evidence/2026-10-29-svg-strip-lifecycle-terminal.json`, and
`evidence/2026-10-29-svg-transparent-terminal.json`.

The additional filtered-alpha fidelity gate removes only the small effects scene's opaque
background, retaining its filters, mask and geometry. It checks independent
Chromium/native validation, exact full/strip RGBA and alpha, all original seam
thresholds, and bounded buffer cleanup. It is not the original large stress
replacement. Invoke `node scripts/run-repository-owned-node.mjs
scripts/test-svg-small-fidelity-control.mjs --premultiplied-filtered-alpha` only
after reviewing its separate no-replay ledger entry; never infer support from
test discovery or a successful source build.

This gate has now FAILED exact alpha at source `a5c28aad`: both full and strip
match each other, and whole0.999023/minimum8bands0.997423 pass0.99, but52,879 alpha
pixels differ from Chromium, maximum50/255. The failure is shared by both render
modes; strip seams are not its cause. See
`evidence/2026-10-29-svg-filtered-alpha-terminal.json`. The ledger now blocks this
unchanged pair. Small175.742MiB is diagnostic only, not profile acceptance. Next
isolate geometry coverage versus blur/merge on different component inputs; do
not relax alpha equality, rerun unchanged for green or rebuild the same source.

## Final-merge precision candidate (private, 2026-10-29)

The default identity-filter diagnostic demonstrated an 8-bit linearRGB round-trip
loss. Its 16 sampled output colors matched the predicted quantization; the
matching sRGB controls passed. This does not authorize rewriting SVG inputs or
weakening the original six-million-pixel acceptance case.

`filter-precision-patch.mjs` adds a floating-point final linearRGB merge to the
pinned region/context/lifetime candidate. Earlier kernels and non-final or sRGB
merges remain unchanged. The extra accumulator uses 16 bytes per viewport pixel,
with checked multiplication, fallible reservation and a 16 MiB request ceiling.
That ceiling is not a total-engine memory measurement. Exceeding it currently
returns the renderer's existing filter error; user-facing error/recovery behavior
must be qualified before publication. The original 96 MiB Wasm cap and 250 MiB
complete-browser-tree requirement still apply.

The exact final opaque sRGB input can replace prior layers without color-space
arithmetic. Other pixels are composited in premultiplied f32 linearRGB and encoded
directly to sRGB, avoiding the demonstrated intermediate 8-bit round trip.

Four compiled host-Rust arithmetic tests pass, including every legal scalar
channel/alpha pair and 10,000 mixed-space cases against an f64 reference. These
are arithmetic tests, not browser image conversions. To repeat after a meaningful
kernel change, set `WITHIN_RUSTC_EXECUTABLE` to an installed compiler binary, then
run `node scripts/run-repository-owned-node.mjs scripts/test-svg-filter-precision-kernel.mjs`.
Executables, compiler outputs and scratch are repository-local and removed.

The `svg-source-filter-precision.yml` workflow runs
`node images/resvg-source/reproduce-filter-context-source.mjs --precision` on
Linux without Docker. It requires two fresh locked builds, pinned-nightly
arithmetic tests in both builds, all four patch proofs, and full raw-byte equality.
Use `node scripts/inspect-svg-filter-build.mjs --precision` only after the exact
recorded source run succeeds. The verifier checks the run/head, archive digest,
exact members, both compiler receipts and cleanup. Subsequent bindgen/cap
processing must authenticate its own immutable source pin and retain unchanged
ABI, byte-equality and memory-cap checks. No public engine has been replaced.

Source run `40834686084` and processing run `40835665062` have now succeeded and
their exact artifacts are authenticated in the retained reports. The resulting
private module is 2,691,689 bytes, SHA-256
`3bb55dc356427d760021c4aea7aff7db06f776505f1fcefc96251a2bad0d7c8c`, with 24
initial and 1,536 maximum pages (96 MiB), unshared. Its ABI and binding bytes match
the preceding private candidate. See `filter-precision-raw-input.json`,
`filter-precision-processed-input.json` and
`evidence/2026-10-29-svg-precision-build-terminal.json`. The subsequent original
small-scene browser pair **failed fidelity**, despite identical full/strip pixels:
whole SSIM 0.979103 and minimum band 0.946037 are below 0.99 and worse than the
earlier candidate. See `evidence/2026-10-29-svg-small-precision-terminal.json`.
This candidate is rejected; 187.75 MiB diagnostic memory is not profile acceptance.
No large-scene run is justified. Do not rebuild or replay the unchanged pair.
The subsequent bounded integration diagnostic shows that the identity case
passes, but the Chromium reference itself quantizes opaque colors in real effects
chains: `[29,11,17]` in identity becomes `[28,13,13]` in effects. The float candidate
incorrectly removes this reference behavior. A shadow-only red-channel mismatch
also remains. See `evidence/2026-10-29-svg-precision-integration-terminal.json`.
That run lacked a stable blank baseline, so its incremental memory is `null`, not
a pass. Next distinguish premultiplication/quantization order with varied-opacity
controls before another native change. Do not repeat the completed diagnostic.

`svg-source-lock` is a manual CI scope, not a published engine recipe. It checks
out resvg-js v2.6.2 by full commit, verifies its original Cargo manifest SHA,
replaces two Git references with full immutable revisions and pins the published
Wasm's wasm-bindgen family (0.2.92 / js-sys 0.3.69).

Cargo 1.90.0 resolves a **new candidate** lock with Rust-version fallback and a
declared Rust 1.76 floor. The recorded historical compiler is nightly-2023-12-11;
resolution is not proof the graph compiles with that compiler. Upstream shipped
no Cargo.lock, so this does not recover or claim the historical publication graph.
The resolver's release manifest is hash-checked. Rust/Cargo downloads, sources,
temp and caches stay in a fresh repository-owned directory removed on exit.
Only bounded manifest, lock and provenance survive for review.

Source compilation and a first private bindgen stage have since executed; see
the stage boundaries below. None of these build stages writes `public/engines`,
runs a conversion, uses Docker or accesses `test.mkv`. Strict source-build
completeness remains failed until the published engine's source-reproduction
requirement is actually met.

The retained `Cargo.candidate.lock` is the actual verified output of run
40513908373 (158 packages). Do not rerun the resolver unchanged.

`svg-source-compile` attempts one release build with that exact lock,
nightly-2023-12-11 / rustc d86d65bbc, and wasm32-unknown-unknown. It verifies the
nightly distribution manifest and compiler version; Cargo cannot change the
lock. Dedicated owned Rust/Cargo/target/temp directories are removed in finally
after normal subprocess exit. Interrupted/unverified children prevent deletion.
Only a bounded report and, if successful, a raw Wasm candidate survive for the
next processing step. Logs retain a 32KiB tail plus full-stream hash/byte count.

Raw Rust Wasm is **not** yet wasm-bindgen output, an ABI-compatible replacement,
a render test, exact publication reproduction or memory qualification. Failed
compilation is retained as failed and must be diagnosed before any retry. Public
engine files and conversion code are never written by this stage.

First compile 40516685917 failed with eight E0658 errors in pathfinder_simd0.5.6
(`round_ties_even` is unstable in the recorded compiler). Its exact receipt and
executed inputs are retained; compiler scratch was removed and no Wasm produced.

`svg-source-compile-pathfinder` / `--pathfinder-0.5.2` is a separate explicit
private candidate. It pins the original manifest's declared version0.5.2 exactly
and changes only that package's version/checksum in the otherwise byte-identical
lock. Official checked crate sources show the same dependency/feature surface,
but scalar rounding uses `round()` instead: do not claim equivalent rendering
from this preparation. Compiler, build flags and quality gates stay unchanged.
The original failed lock and published engine remain untouched. The repaired
manifest/lock hashes are fixed, a repaired lock is retained for follow-up, and
Cargo must compile with `--locked` without changing it. No resolver/version sweep.

That Pathfinder-only compile40519469540 got past its prior API error but failed
in WOFF2: newer bytes1.12.1 adds `Buf::try_get_*` methods conflicting with WOFF2's
existing `SafeBuf` methods. The failure, exact sources and cleanup remain saved.
`svg-source-compile-bytes` / `--bytes-1.6.0` adds exactly the bytes1.6.0 version
and checksum pin, witnessed in actual published Wasm and checked official crate
source. It keeps the Pathfinder repair, same compiler and WOFF2 source, with no
remaining graph re-resolution. This is another explicit private candidate, not
rendering/security qualification or permission to publish. Strict memory-contract
tests also expose the old published SVG module's missing declared maximum; a
source build alone cannot close that requirement or the full process-tree gate.

## Executed stages and open gates

| Stage | Actual evidence | What it does not prove |
| --- | --- | --- |
| Locked source compile with both measured dependency repairs | Run40521129468; raw3,676,614 B, SHA3e93d4dd…0404da3f | Bindgen output, rendering, source-repeat equality |
| Pinned bindgen0.2.92 and deterministic experimental96 MiB maximum | Run40525478469; private2,695,842 B candidate, SHA6e5b1920…499fd6 | Exact old publication bytes, complete-browser memory, safe OOM recovery |
| Ten existing production-browser SVG correctness/fidelity/direct-save/error/policy checks | All ten passed; both failed and passed full-tree small-suite runs retained | Repeatable conversion optimization, maximum-size stress, cancellation/OOM and release qualification |
| Source path audit |188 random scratch-prefix occurrences in data section11 | A successful second reproducible build |
| Fresh remapped source-repeat workflow | Run40637485225: two distinct fresh builds, raw3,665,540 B SHA c6014e1c…ee5c09, full bytes equal | Processed/browser engine repeatability or public promotion |
| Twice-processed reproducible private candidate | Run40638268353: full Wasm/glue equal across both passes; bounded2,684,770 B SHA4068ccdc…afab9d | Browser fidelity, maximum-size stress/OOM/cancellation, release acceptance |

The published engine is still the original pinned npm binary, not this private
candidate. It has no explicit Wasm maximum. The private cap changes only the
memory declaration and preserves all other section payloads, but96 MiB is an
experimental budget, not a qualified production setting. Import/export names and
kinds match the current glue; the actual small browser cases additionally test
functional compatibility. Full fidelity, stress, recovery, legal/security and
whole-process-tree release gates remain mandatory.

The normal-service Chrome small-suite results include275.04 MiB (failed) and
241.76 MiB (passed after diagnostic-session recovery). These are different runs,
not an established causal or repeatable conversion-memory improvement. Three
allocator probes and a rejected snapshot/HAR-option control are diagnostic only.
The default harness retains complete DOM/HAR tracing and the original250 MiB
formula; unavailable realm measurements stay null. See
`evidence/2026-10-28-cdp-session-recovery-browser-terminal.json` and the prior
failure references in `TESTED.md`.

## Independent raw source reproduction

`.github/workflows/svg-source-reproduction.yml` runs:

```sh
node images/resvg-source/reproduce-raw-source.mjs
```

This is an isolated Linux Actions build, not a local conversion command. The
workflow is manual after its exact-file push bootstrap. Do not dispatch again
while a confirmed run is live; retain its run ID and estimated next-check time.

The wrapper `remap-rustc.mjs` verifies the exact compiler under each fresh owned
Rust home, then prepends
`--remap-path-prefix=<owned-compile-runtime>=/within/resvg-build` to each rustc
invocation. All original rustc arguments are preserved; competing compiler flags
and unexpected roots/compilers are rejected. The original `compile-candidate.mjs`
driver, nightly, locked dependency graph and Cargo release arguments are not
rewritten. This changes source-location strings, not codec or optimizer settings;
new output still needs its own qualification.

Two builds use distinct fresh Cargo/Rustup/target/temp directories. Both actual
receipts must show success and completed owned cleanup, the exact compiler/lock,
and no random scratch prefix left in raw Wasm. The recipe compares the full raw
bytes, not merely package versions or source metadata. Only after equality and
file-identity checks does it remove the second duplicate raw binary and lock.
Both compact receipts plus one raw candidate/lock survive for the next stage in
a one-day artifact. Failure evidence may retain the second candidate for diagnosis.

Raw equality alone does not qualify wasm-bindgen output. The next stage must
pin the new artifact/receipt hashes, run the pinned postprocessor and cap, compare
outputs, and qualify real browser rendering/recovery/memory. Existing artifact
input JSONs refer to the earlier immutable runs and expire; do not silently swap
their IDs or claim an unexecuted pipeline passed.

The first remapped build attempt40636660255 failed before code generation because
the wrapper rejected Rustup's host-qualified name for the already pinned nightly.
Its receipt remains failed. The corrected guard accepts only the short name and
its exact x86_64 host-qualified form, with the same owned compiler path. The
subsequent two-fresh-build run40637485225 passed and removed both compiler/runtime
scratch directories plus the verified redundant second raw binary/lock. Its exact
five-member artifact is pinned in `remapped-raw-input.json`; do not rerun those
source compilations unchanged.

The next standalone build stage is:

```sh
node images/resvg-source/postprocess-repeated-source.mjs
```

It verifies both retained source-build receipts and the exact raw-repeat artifact,
then runs checksum-pinned bindgen twice in separate temporary output directories.
Both generated glue files and bounded Wasm outputs must compare byte-for-byte.
Only one candidate/glue/receipt is retained; scratch is removed in finally.
Its dedicated `svg-source-postprocess-repeat.yml` workflow bootstraps only on its
own file push, then permits manual dispatch. It does not recompile Rust or alter
the public engine. A new result still needs real browser stress/recovery/fidelity
and unchanged whole-process-tree acceptance before any production adoption.

Run40638268353 completed this stage successfully. The new Wasm is2,684,770 B,
SHA-2564068ccdc36f10df407150752bcae5af699dd1190700c5ebb78e578ea9aafab9d;
both capped outputs and both glue files were byte-identical. The generated glue
also matches the earlier private candidate's glue hash. The exact three-member
artifact is pinned in `repeated-processed-input.json`; only one candidate/glue
copy was retained, all owned postprocessor scratch removed, public engine unchanged.
Do not replay either raw compilation or postprocessing unchanged. Browser evidence
for the earlier unremapped candidate does not qualify these new bytes.

## Confirmed allocation failure and private strip work

`node scripts/test-reproduced-svg-stress.mjs --effects-allocation-probe` was
executed once against the same6M effects source/reference. Two scalar globals
and balanced stores identify which original trap edge was taken. Removing only
the diagnostic additions restores every original Wasm byte; the96MiB maximum
and all original branch conditions are unchanged. The actual counter selected
payload-allocation-null/site3 with requested size24,000,000 bytes and matching
get_input/function532 trap0x1a91ff. This is NOT the Arc-overflow alternative.
See `evidence/2026-10-28-svg-allocation-probe-terminal.json`. Do not rerun this
unchanged diagnostic. It produced zero output and does not qualify fidelity or
memory, even though the diagnostic full-tree increase was204.46484375MiB.

The upstream `crop` option runs after full rasterization, so it cannot avoid
the allocation. `workers/rgba-png-stream.ts` is an unconnected private foundation
for incremental lossless PNG writing from straight-alpha RGBA strips. Each
filtered strip is capped at256KiB; each destination write is at most64KiB and
awaited, with one active write. No full-output collection/Blob is used. Synthetic
algorithm tests validate CRCs, independent zlib inflate, exact channel/alpha
bytes, errors, cancellation, and producer release. They do not execute an SVG
renderer or qualify a browser conversion. Resvg pixels are premultiplied; they
must NOT be passed directly to this straight-alpha encoder. Real viewport/halo
rendering, alpha conversion, independent seam/fidelity, memory, and recovery
tests are still required before connecting or advertising any strip route.

The first real viewport attempt did render/release one112-row canvas and stream
64central rows/93,748 partial bytes, then failed in native Pixmap::new on the
second viewport. No completed PNG or fidelity/memory acceptance. Its source
finding is important: apply_inner's filter.region is still the original full
region; flood/composite/merge allocate by it even when the source canvas is
bounded. Merely changing the viewport is insufficient. The failure and all
cleanup are retained in `evidence/2026-10-28-svg-strip-first-render-terminal.json`.

`filter-region-patch.mjs` proposes intersecting that allocation extent with the
already bounded source canvas. It requires the entire pinned upstream module,
retains the MPL notice, and reverses to all original bytes. It does not delete
primitives, alter their parameters or move subregions, but clipping/fidelity is
still unverified. The original source is archived with attribution in
`fixtures/source/resvg-filter-3495d870-preimage.json`, not replaced in public assets.

The private build command is Linux Actions-only:

```sh
node images/resvg-source/reproduce-filter-region-source.mjs
```

Its dedicated `svg-source-filter-region.yml` workflow runs two fresh locked
compilations, patches only the exact newly fetched owned dependency checkout,
checks source bytes after compilation, compares full raw outputs, and removes
the second verified duplicate. Frozen baseline build files remain unchanged;
generated drivers are archived. Compilation/byte equality still do NOT prove
browser fidelity, safety, speed or source reproduction of the old public binary.
New artifacts require pinned postprocessing/capping and unchanged browser gates.

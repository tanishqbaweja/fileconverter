# Private SVG source reconstruction

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
| Fresh remapped source-repeat workflow | Recipe prepared; run result must be checked separately | Processed/browser engine repeatability or public promotion |

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

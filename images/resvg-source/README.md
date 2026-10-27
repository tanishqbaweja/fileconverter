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

Next: inspect the lock, pin the compiler/bindgen tool dependencies, compile a
private candidate, compare binary and JS ABI against the published engine. If
different, qualify correctness, fidelity, memory, privacy and cleanup before any
replacement. This preparation never writes `public/engines`, runs a conversion,
uses Docker or accesses `test.mkv`. Strict source-build completeness remains
failed until the original source-reproduction requirement is actually met.

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

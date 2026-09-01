# Remaining work audit

Updated 2026-09-01. This is the living requirement audit for the original
privacy-first browser converter specification. It is deliberately stricter than
the public route ledger: a green route registry proves the advertised routes,
not the entire product specification.

## Status definitions

- **Verified complete** — current source plus an appropriate test or retained
  report directly proves the requirement.
- **Partially implemented** — useful implementation exists, but a named part of
  the requirement or its evidence is absent.
- **Missing** — no conforming implementation or adequate evidence was found.
- **Intentionally unsupported** — the exact surface is hidden from the public
  selector and has a recorded technical, legal, quality, or memory reason.

## Product and acceptance contract

| ID | Requirement | Status | Current evidence | Remaining work |
| --- | --- | --- | --- | --- |
| P-01 | Real conversions execute entirely in the browser; the server serves only application assets | Verified complete | Worker implementations under `workers/`; custom engines under `public/engines/`; production-browser tests under `tests/browser/`; privacy description in `README.md` | Keep network tests mandatory as routes are added. |
| P-02 | Never transmit files, filenames, decoded data, extracted text, temporary data, or outputs | Verified complete | `tests/browser/privacy-offline.spec.ts` rejects non-GET, cross-origin, filename, and fixture-content requests; `.github/workflows/ci.yml` runs it as an explicit hosted gate; `README.md` documents the same boundary | Keep the explicit privacy gate mandatory as routes are added. |
| P-03 | No PDF input, output, or tooling | Verified complete | Registry/unit gate and `TESTED.md` report zero PDF profiles | Preserve this prohibition. |
| P-04 | Broadest technically practical mainstream format coverage | Partially implemented | 388 public passed profiles across all named categories in `TESTED.md`; exact gaps are listed at its end | Complete feasibility audits and implement or defensibly reject the missing media, audio-control, HEIF/HEIC, raw-image, and SVG surfaces below. |
| P-05 | Public selector exposes only genuine, tested routes from the central registry | Verified complete | `lib/capability-registry.ts`, `publicProfilesFor`, registry unit tests, and the generated `TESTED.md` table | Re-run the registry/report consistency audit after every promotion. |
| P-06 | Every public profile remains at or below 250 MiB complete-Chromium incremental private memory | Verified complete for the current registry | `npm run audit:public-evidence` now proves 388/388 have strict passing reports, three-run evidence, and evidence at the published maximum; `scripts/memory-profile.mjs` uses the required process-tree formula and per-process sampling | Apply the same gate to every new route. |
| P-07 | Memory remains approximately independent of total file size | Partially implemented | Valid 6 GiB and 10 GiB MKV-to-MP4 remux runs stayed at 194.8 and 210.3 MiB; the latter figure is memory, while its genuine output was 10,746,764,442 bytes; bounded category reports cover smaller stress sizes | Add progressive multi-gigabyte evidence for representative newly added media families and at least one genuine re-encode topology where disk/time permits. Do not describe remux evidence as re-encode evidence. |
| P-08 | Optimize conversion speed without weakening correctness, privacy, fidelity, cleanup, or memory | Partially implemented | `TESTED.md` contains measured accepted and rejected optimizations. `evidence/remux-performance-audit-2026-08-28.json` records an identical three-run 2.958 GB A/B: the retained 1 MiB direct specialist's 36.064 s median is 16.4% faster than the 256 KiB candidate, with identical output SHA-256 and both under 250 MiB | Continue benchmark-before/after work per remaining route; record rejected candidates here and in `TESTED.md`. |

## Bounded architecture and storage

| ID | Requirement | Status | Current evidence | Remaining work |
| --- | --- | --- | --- | --- |
| A-01 | No complete large-file ArrayBuffer, MEMFS copy, full-output Blob, base64 copy, or unbounded output-chunk collection | Verified complete for current public routes | Bounded workers and custom I/O; source search finds only bounded slice/sample uses in `webp-animation.ts` and `sevenzip-conversion.ts`; browser metrics enforce read/write/queue limits | Keep a static forbidden-pattern audit and review any future Blob/ArrayBuffer use for a hard size bound. |
| A-02 | Bounded read-only seekable browser source with documented maximum reads | Verified complete | Shared source adapter and custom media AVIO; reports expose `maxReadChunkBytes`, generally capped at 256 KiB | Preserve the report gate for new engines. |
| A-03 | Real random-access direct destination with seek, truncate, flush, close, error propagation, cancellation, and backpressure | Verified complete | `workers/random-access-destination.ts`, direct-destination worker/bridge, direct-handle browser tests, headed success/cancellation/failure audit | Add equivalent headed sampling for more engine families. |
| A-04 | At most a small fixed number of pending writes and a hard queued-byte limit | Verified complete | Route reports and browser assertions require at most one pending operation and bounded queued bytes | Keep profile-specific queue ceilings explicit. |
| A-05 | OPFS is fallback/scratch only, with quota checks, warnings, persistence handling, fixed-buffer copy, automatic cleanup, and manual management | Verified complete | Storage estimate, startup/manual cleanup UI, abandonment/reload/quota/failure tests, fixed-buffer destinations | Continue route-specific scratch cleanup tests. |
| A-06 | Generated fixtures and converted copies remain project-local and disposable data is removed | Verified complete | `scripts/cleanup-generated.mjs`, category `finally` cleanup, cleanup ledger, current `work/.gitkeep` convention | Preflight free space before every new large run and inspect cleanup after every failure. |
| A-07 | Expensive work runs in dedicated workers; engines are lazy-loaded and terminated/released | Verified complete for current engines | `workers/conversion.worker.ts`, route-specific workers, worker lifecycle tests and metrics | Verify the invariant for every new engine. |
| A-08 | Fixed-size logs/samples/messages; references released; Wasm initial/max memory explicit and fail-safe | Partially implemented | Bounded runtime metrics and fixed Wasm builds are documented and stress-tested | Perform a source-level lifecycle audit across every worker; add static/unit checks for newly introduced unbounded histories or messages. |
| A-09 | Full diagnostic telemetry: stable blank/loaded baselines, process-tree RSS/private memory, per-process data, every accessible JS realm, Wasm, SAB, queues, workers, output, storage, throughput, and peaks; missing samples are null/retried | Verified complete for the current Chrome profiler | `scripts/memory-profile.mjs` samples the Windows Chrome tree, page/worker heaps, storage, and route metrics; retained JSON/CSV/HTML reports include null-capable samples and graphs | Validate equivalent process-tree collection on any additional supported runner OS before claiming cross-platform profiling. |

## Media engines and format coverage

| ID | Requirement | Status | Current evidence | Remaining work |
| --- | --- | --- | --- | --- |
| M-01 | Custom reproducible FFmpeg Wasm libraries, native wrappers, custom AVIO, genuine mux/demux/decode/encode | Verified complete | `media/ffmpeg/Dockerfile`, `within_remux.c`, pinned manifests, published remux engines, browser/native validation | Extend only through reproducible specialist builds. |
| M-02 | Automatically inspect codecs/streams and select standards-compliant stream copy when possible, otherwise bounded re-encode | Partially implemented | Registry/worker probes select certified copy or encode paths; `lib/media-source-inspection.ts` presents bounded details for every named standalone audio family plus multi-stream MP4/MOV/3GP, Matroska/WebM, FLV, MPEG-TS, AVI, and Ogg/Theora inputs; `lib/media-conversion-plan.ts` now applies the selected fixed profile to every inspected stream and distinguishes copy, re-encode, exclusion, and codec rejection before start | Build automatic copy-versus-re-encode selection across missing codec combinations; the current selector still asks the user to choose a separately certified destination profile. Extend inspection when new containers are added. |
| M-03 | Preserve all compatible streams, timestamps, chapters, subtitles, attachments, language, rotation, aspect, color, and metadata; explicitly disclose exclusions | Partially implemented | `evidence/complex-matroska-field-retention-browser-2026-09-01.json` and `evidence/complex-container-field-retention-browser-2026-09-01.json` prove genuine complex Matroska-source copies across all six compatible stream-copy destinations: Matroska, MP4, MOV, 3GP, MPEG-TS, and FLV. Matroska preserves all five streams, chapters, tags, and dispositions. MP4/MOV/3GP retain representable geometry, aspect, exact 90° display rotation, explicit BT.709 fields, both AAC payloads, languages, and dispositions while disclosing topology exclusions. MPEG-TS/FLV retain BT.709 and exact unrotated compressed pictures while explicitly disclosing unrepresentable rotation; MPEG-TS retains both AAC tracks/languages and FLV retains its first AAC plus title. The full shared-core browser regression passed 488/488. | Extend field-level evidence across complex MOV/3GP/MPEG-TS/FLV/AVI/WebM source mappings; attached-picture dispositions remain explicitly excluded by the fixed binary. |
| M-04 | Mainstream containers and practical codecs named by the specification | Partially implemented | Extensive MKV/MP4/MOV/3GP/MPEG-TS/FLV/AVI/WebM/OGV and H.264/HEVC/VP8/VP9/AV1/MPEG-2/MPEG-4 routes are public | Investigate the additional OGV, 3GP, AVI, VP9, AV1, MPEG-2 audio/codec combinations and elementary/raw outputs listed in `TESTED.md`. |
| M-05 | User-selectable video resolution, bitrate, frame rate, codec, and quality where re-encoding/compatibility requires them | Verified complete for all 22 public video re-encode profiles | A single independently validated option object spans UI, plan, request, worker, nine-integer JS/Wasm ABI, and native allowlist. Genuine browser output proves codec, dimensions, frame count/rate, bitrate, visual-quality ordering, cancellation/write-failure cleanup, and backward compatibility. The no-Docker higher-quality specialist passed the 181,825,549-byte maximum-settings three-run gate at 232.9 MiB with byte-repeatable fully decoded output; automatic keeps the prior fastest core unchanged. | Re-run the same gates for any new codec, setting, or worker topology. |
| M-06 | Mainstream audio conversion and extraction | Verified complete for the currently advertised fixed profiles | Broad standalone/container audio matrix, independent decode/quality tests, and stress reports | Extend variants only after the controls/metadata model is defined. |
| M-07 | User-selectable audio bitrate, sample rate, channel layout, codec/quality, lossless/lossy choice | Verified complete for the published practical audio surface | Validated codec, compression, bitrate, rate, channel, and quality controls span UI, route normalization, request/worker, codec-aware JS/Wasm ABI, and native allowlists. Production Chrome passed 10/10 including genuine AAC, Opus, Vorbis, WMA2, FLAC, ALAC, AIFF/PCM, AMR-NB, MP3, video-regression, quality-ordering, cancellation, and write-failure paths. Maximum AAC 320 kb/s/48 kHz/stereo passed 3/3 on 153,600,106 bytes in 13.35–13.84 seconds at 192.6 MiB worst complete-Chrome incremental private memory with 256 KiB reads, 938-byte writes/queueing, one pending operation, and fixed 32 MiB Wasm. Hosted run `33432010221` reproduced the published FFmpeg artifacts exactly without Docker in 568 seconds, ran cleanup, skipped mismatch upload, and retained zero artifacts. `evidence/audio-output-controls-2026-09-01.json` records the exact gate. | Re-run the same gates for any new codec, setting, or worker topology. Tags and embedded artwork remain separately tracked under M-08. |
| M-08 | Audio tags, embedded artwork, and metadata preservation | Partially implemented; bounded common-tag and MP3/FLAC artwork subset verified | `evidence/audio-artwork-retention-2026-09-01.json` records the complete bounded subset. MP3 and FLAC outputs copy seven common text tags where representable and packet-copy the first attached JPEG/PNG without decode when it is at most 4 MiB, 4,096 pixels per side, and 16 megapixels; unsupported, additional, oversized, malformed, or unrepresentable art is explicitly excluded. Deterministic AAC/M4A, MP3/MP4, Ogg Vorbis, and Ogg Opus fixtures retain the exact 178-byte PNG packet. Production Chrome passed genuine M4A-to-MP3, M4A-to-FLAC, MP4-MP3 stream-copy, standalone MP3-to-FLAC, standalone FLAC-to-MP3, Vorbis-to-MP3/FLAC, Opus-to-MP3/FLAC, and raw-AAC exclusion cases with exact tags/artwork and full native decode; the complete 11/11 media-options regression passed in 50.8 seconds. The Ogg mapping promotes only the seven allowlisted stream comments and does not duplicate `METADATA_BLOCK_PICTURE`. The 134,402,091-byte random-access fixture passed FLAC 3/3 in 0.376–0.733 seconds at 95.9 MiB worst complete-Chromium incremental private memory and MP3 3/3 in 0.234–0.551 seconds at 88.4 MiB; exact output, artwork, tags, packet/decode, bounded I/O, one pending operation, fixed 32 MiB Wasm, and cleanup all passed. Two H.264-bearing designs were rejected at 270.8 and 253.7 MiB because unrelated excluded-video renderer overhead crossed the unchanged limit. No-Docker publication run `33480650192` rebuilt every FFmpeg artifact exactly at commit `b087c58` in 8m56s, skipped mismatch upload, completed repository-local cleanup, and retained zero artifacts. The candidate archive and four older branch mismatch archives were deleted, leaving zero Actions artifacts on the branch. Prior representative title retention remains in `evidence/audio-metadata-retention-browser-2026-08-28.json`. | Independently validate remaining source-container-specific field mappings and any future destination-specific artwork representation; representative coverage does not imply every metadata field in every public route. |
| M-09 | WebCodecs optional acceleration with capability detection and controlled-memory CPU/Wasm fallback | Partially implemented | Capability detection and browser-native image decoding are present; media routes use controlled Wasm | Benchmark practical video/audio WebCodecs paths before adopting them; document rejection if they cannot preserve container/metadata or deterministic fallback behavior. |

## Images, archives, subtitles, data, ebooks, and documents

| ID | Requirement | Status | Current evidence | Remaining work |
| --- | --- | --- | --- | --- |
| N-01 | Purpose-built bounded image paths with dimension, pixel, decompression, and memory protections | Verified complete for current public formats | Image workers, fixed Wasm engines, pixel/surface caps, rejection tests, and image stress reports | Apply the same protections to any new decoder. |
| N-02 | Practical PNG/JPEG/WebP/AVIF/GIF/TIFF/BMP/ICO/JPEG XL and animated conversion coverage | Verified complete for the advertised matrix | Public registry, full image browser suites, independent native/pixel/timing validation | Continue fixing only documented fidelity gaps; do not imply every theoretical pair. |
| N-03 | HEIF/HEIC conversion where legally and technically practical | Missing | No HEIF/HEIC registry route or decoder; explicitly listed as absent | Perform a pinned decoder/licensing/memory feasibility study, then implement bounded routes or record a defensible rejection. |
| N-04 | Common camera-raw conversion where a secure decoder is available | Missing | No raw decoder/routes; explicitly listed as absent | Evaluate a maintained, reproducible, bounded decoder and attack surface; implement or document rejection. |
| N-05 | Broad SVG rasterization including text/CSS/animation/linked resources/filter/mask behavior where safe | Partially implemented | A certified bounded SVG subset and reproducible SVG engine are public | Decide safe behavior for fonts, CSS, animation, links, filters, and masks; prohibit network/resource exfiltration and validate rendered fidelity. |
| N-06 | Incremental archive/compression conversion with traversal, duplicate, expansion-ratio, size, and bomb protections | Verified complete for advertised ZIP/TAR/GZIP/BZIP2/XZ/7Z routes | Archive workers, validators, malicious-input tests, category reports | Re-audit limits when adding formats. |
| N-07 | SRT/WebVTT/ASS/SSA/TTML conversion preserving representable timing, styling, positioning, speakers, and metadata | Partially implemented | Public SRT/WebVTT/ASS/TTML routes and large stress reports | Build a field-level preservation matrix; add SSA aliases and preserve or explicitly disclose styling/position/speaker/metadata losses. |
| N-08 | Genuine bounded EPUB/TXT/HTML/Markdown/data/office conversions with independent structural validation | Verified complete for advertised extraction/generation profiles | Dedicated workers, independent ZIP/XML/data validators, stress reports, and explicit fidelity limitations | Broaden office fidelity only where a reliable bounded engine exists; keep extraction-only limitations visible. |

## Interface, browser capability, privacy, and offline behavior

| ID | Requirement | Status | Current evidence | Remaining work |
| --- | --- | --- | --- | --- |
| U-01 | Responsive polished UI with drag/drop, picker, detection, output selection, destination, storage mode, real progress, throughput, elapsed/remaining time, engine, memory, warnings, cancellation, errors, and cleanup | Partially implemented | `app/converter/ConverterApp.tsx` implements the core states and metrics; source details cover all named standalone audio and multi-stream MP4/MOV/3GP, Matroska/WebM, FLV, MPEG-TS, AVI, and Ogg/Theora inputs; the source-aware plan visibly states every inspected stream outcome before start | Add genuine conversion controls after the engine ABI supports them and perform broader headed usability review. |
| U-02 | Prominent on-device privacy indicator | Verified complete | Privacy chip and explanatory UI | Preserve prominence through redesigns. |
| U-03 | Pause only where truly supportable | Verified complete by omission | No misleading pause control is advertised | Add pause only if an engine can safely suspend all producer/consumer work. |
| U-04 | Runtime detection for Wasm/features, workers, File System Access, OPFS, SAB/isolation, storage, WebCodecs, and engine requirements | Partially implemented | `detectCapabilities` covers the main browser primitives and displays limited-browser state | Audit required Wasm feature detection and engine-specific codec/configuration probes; distinguish API presence from functional support. |
| U-05 | Current stable Chrome, Edge, Brave, and Opera targets with clear unsupported state | Partially implemented | The same production-build CSV-to-TSV conversion/privacy test now passes Chrome 151, Edge 151, Brave 151, and Opera GX 134; compact evidence is in `evidence/browser-compatibility-2026-08-27.json` | Expand beyond one small smoke route, test standard Opera when available, and retain Chrome-only wording for stress/process-memory claims. |
| U-06 | Installable PWA and offline conversion after assets/engine are cached; service worker never handles user data | Verified complete for tested engines | Service worker and `privacy-offline.spec.ts` exercise app shell and multiple cached engines offline | Add focused offline coverage for every new engine family. |
| U-07 | CSP, COOP/COEP/CORP, no analytics/ads/telemetry, no user-data service-worker path | Verified complete | Production headers, network tests, and README security section | Keep explicit CI privacy coverage. |

## Fixtures, validation, reports, builds, and CI

| ID | Requirement | Status | Current evidence | Remaining work |
| --- | --- | --- | --- | --- |
| T-01 | Preserve and inspect the exact root `test.mkv`; use it for real browser remux, extraction, audio, and genuine video re-encode routes | Verified complete | Protected size/hash checks, FFprobe manifest, retained MKV route reports, and browser tests | Re-check size/hash before and after future relevant large-media work. |
| T-02 | At least one large browser output comparable to `test.mkv` and independent validation | Verified complete | 2.958 GiB-class remux/re-encode evidence and 10 GiB remux output evidence | Keep terminology explicit: remux is genuine container conversion, not codec re-encode. |
| T-03 | Valid progressively larger media up to approximately 10 GB through production Chromium | Verified complete for the MKV-to-MP4 remux topology | Valid 6 GiB and 10 GiB Matroska reports with full hashes, packet counts, traversal, and cleanup | Add representative scaling for newly added media paths under P-07. |
| T-04 | Deterministic fixtures for every supported category and correct independent validators | Verified complete for current public categories | Fixture generators and route-specific validators under `scripts/` and `tests/browser/` | Add fixtures/validators with each new capability. |
| T-05 | Success, unsupported/corrupt input, cancellation, repeated conversion, write failure, quota, permissions, Unicode, >4 GB, complex streams, batch, worker failure, reload, and cleanup tests | Partially implemented | Browser suites cover these cases across representative routes; complex remux fixture covers tracks/subtitles/chapters/attachments/VFR/metadata | Produce a requirement-to-test index and close any scenario that is only indirectly or narrowly covered. |
| T-06 | Headed manual review of real UI success, progress, destination, cancellation, understandable errors, and responsiveness | Partially implemented | `TESTED.md` records one headed MKV success/direct/cancel/write-failure audit with reviewed screenshots/trace | Repeat headed audits across representative image, audio, archive, data/document, ebook/subtitle, quota/permission, reload, and batch families. |
| T-07 | Three-run same-session repeatability, cleanup recovery, clean-session repeats, and failure artifact retention for major profiles | Verified complete for current route promotion evidence | Retained reports and profiler checks; historical failures remain in `outputs/reports` | Define which routes are “major” in the audit and add clean-session repeats where evidence is only same-session. |
| T-08 | Timestamped JSON, CSV, and readable HTML memory reports with graphs | Verified complete | `scripts/memory-profile.mjs` and compact retained reports | Preserve compact reports while deleting payloads. |
| T-09 | Every published binary is pinned, reproducible, and auditable from source | Verified complete | `scripts/engine-reproducibility-manifest.mjs` audits all 11 published engine directories and supplies an executable exact no-Docker recipe for each. Hosted run `33297796443`, TIFF rerun `33298467168`, and clean AVIF-encoder publication run `33311548748` prove every directory against pinned Emscripten 6.0.4; `evidence/non-docker-all-engine-repro-2026-08-30.json` records job IDs, sources, hashes, AVIF cache diagnosis, browser re-certification, and cleanup. | Keep each fail-independent exact comparison mandatory whenever its source or published bytes change. |
| T-10 | CI runs unit, production build, small browser, network privacy, validators, and reproducibility checks | Verified complete for the current branch | Final integrated run `33312105530` passed 16/16 jobs at `5e46a66`: verification/build/lint/TypeScript/evidence, 13/13 privacy/offline, all 871 browser conversions (152 image, 484 media, 235 streaming), and exact clean no-Docker reproduction for all 11 engine directories. | Keep the partitioned browser, privacy, and fail-independent engine jobs mandatory; rerun the affected partitions whenever behavior or published engine bytes change. |
| T-11 | Detailed README covers architecture, copies, limits, storage, privacy, compatibility, fidelity, licensing, builds, tests, and measured results | Verified complete for current implementation | `README.md` documents all named areas and links the generated route ledger | Update it whenever remaining work changes behavior or evidence. |

## Intentionally unsupported surfaces with current reasons

| Surface | Status | Recorded reason | Revisit condition |
| --- | --- | --- | --- |
| All PDF inputs, outputs, and tools | Intentionally unsupported | Explicit project boundary; handled by a separate product | Never add under this goal. |
| OGV/Vorbis to AMR-NB | Intentionally unsupported | Retained quality result -3.58873 dB failed the unchanged -3 dB floor | A materially better bounded encoder/configuration passes the same floor. |
| Raw HEVC input wrapping with B-frames | Intentionally unsupported | Presentation timing cannot be reconstructed losslessly without container timestamps | A bounded standards-correct timestamp source/parser is demonstrated. |
| AMR-WB output encoding | Intentionally unsupported | Withheld pending explicit patent/licensing clearance | Documented legal clearance plus a reproducible bounded encoder. |
| Unsafe/unbounded SVG external resources and unsupported effects | Intentionally unsupported | Network/privacy and bounded-rendering constraints | A self-contained, bounded, non-networked implementation passes fidelity/security tests. |

## Ordered implementation backlog

1. Audit stream/metadata preservation for every public media route; implement
   representable fields and make every exclusion explicit.
2. Expand the passing Edge, Brave, and Opera smoke evidence into representative
   route and headed interaction coverage.
3. Perform bounded feasibility work for HEIF/HEIC, camera raw, broader SVG, and
   the missing media combinations. Promote only fully evidenced routes.
4. Expand headed interaction audits and representative multi-gigabyte scaling.
5. Run final build, lint, TypeScript, unit, browser, privacy/offline, validator,
   reproducibility, registry/report-consistency, cleanup, and protected-fixture
   gates before removing all partial/missing statuses.

## Rejected or deferred approaches

- Do not replace a re-encode scaling requirement with the fast 10 GiB remux;
  the latter proves bounded I/O and muxing, not codec-transcode performance.
- Do not expose fixed encoder settings as if they were user-selectable controls.
- Do not claim Chrome evidence proves Edge, Brave, or Opera behavior.
- Do not add a format solely because an extension can be emitted; structural and
  independent content validation remains mandatory.
- Do not replace the direct MKV-to-MP4 specialist with the ordinary 256 KiB
  core. Under an identical three-run Chrome 152/direct-destination comparison,
  that candidate produced the same output but raised median elapsed time from
  36.064 to 43.141 seconds (16.4% slower). It was reverted; compact evidence is
  retained in `evidence/remux-performance-audit-2026-08-28.json`.
- The 2026-08-28 UI-only MP3-controls draft remains a useful rejected approach:
  without a rebuildable native ABI it could not prove that the encoder honored
  its settings. The 2026-08-30 implementation replaces it with a validated
  request/worker/JS/Wasm/native contract and a no-Docker rebuilt engine; the old
  audit remains in `evidence/media-option-abi-audit-2026-08-28.json` as the
  before-state rather than a description of the current implementation.

## Implementation and verification log

### 2026-09-01 — Ogg Vorbis/Opus tag and artwork mapping checkpoint

- Added deterministic Vorbis and Opus fixtures using standard
  `METADATA_BLOCK_PICTURE` comments. Both regenerate byte-for-byte, expose the
  same exact 178-byte PNG as a bounded attached picture, and carry the seven
  certified text fields as stream-scoped Ogg comments.
- The native audio wrapper now promotes only `title`, `artist`, `album`,
  `genre`, `date`, `track`, and `comment` from container scope or, when needed,
  the selected audio stream into MP3/FLAC destination metadata. It does not copy
  the base64 picture comment into destination tags; artwork remains one bounded
  packet-copy stream under the existing 4 MiB/4,096-side/16-megapixel limits.
- The first production-browser run preserved artwork but correctly failed when
  Ogg text tags were absent at destination scope. The published fix passed
  Vorbis-to-MP3, Vorbis-to-FLAC, Opus-to-MP3, and Opus-to-FLAC with exact tags,
  exact artwork, bounded I/O, and full native audio decode. The focused gate
  passed 1/1 in 21.0 seconds and the complete media-options file passed 11/11 in
  50.8 seconds.
- Candidate run `33479466650` produced the expected two-file diff while all 18
  peer artifacts remained exact. Publication run `33480650192` then rebuilt
  every committed FFmpeg artifact exactly without Docker in 8m56s, skipped
  mismatch upload, and completed repository-local cleanup. The local download,
  browser outputs, Playwright state, and remote candidate archive were deleted;
  the branch retains zero Actions artifacts.
- M-08 remains partial: these verified source mappings do not imply every field
  or every public source/destination topology is covered.

### 2026-08-30 — video-control source and native ABI checkpoint

- Added one bounded video option contract for all 22 public re-encode profiles:
  automatic/VP8/VP9/MPEG-4 codec selection, automatic/320/480/640 px no-upscale
  width, automatic/300–4,000 kb/s bitrate, automatic/15/24/25/30 fps
  no-upconvert frame-rate cap, and automatic/smaller/balanced/higher quality.
- The production UI, preflight stream plan, request, worker validator, JS/Wasm
  bridge, and C wrapper all carry the same values. Switching VP8/VP9 also moves
  the selector to the matching public profile so the displayed destination is
  not misleading. Unsupported profiles, cross-container codecs, and arbitrary
  values are rejected independently in TypeScript and native code.
- Native width caps preserve aspect ratio and never upscale. Lower frame-rate
  caps uniformly discard decoded frames before scaling; caps at or above the
  source retain source-average timing rather than inventing frames. Automatic
  mode leaves the earlier width, bitrate, frame-rate, quality, thread, and
  zero-lookahead branches unchanged.
- Updated the no-Docker build order so the current MPEG-4/VP8/VP9 specialists
  can change while the high-throughput direct-remux core remains byte-certified
  at `79e4db4`. The generated reverse patch reconstructs the exact historical
  C blob (`307fd688fb11f322ae7e3552f0dd0e5012615901`); the disposable verification
  copy was deleted immediately.
- Current source gates pass: TypeScript, ESLint, production build, 84/84 unit
  tests, 4/4 production-browser media-option tests, and the 11-engine recipe
  declaration audit. The browser cases also prove the nine-value JS bridge is
  backward-compatible with the currently published four-value MP3 core.
- This is explicitly partial. No custom-video claim is public until new Wasm
  bytes pass independent codec/dimension/bitrate/frame-rate/quality validation,
  cleanup faults, speed comparison, and the complete-Chromium three-run memory
  ceiling.
- Hosted no-Docker run `33327587571` then compiled the nine-value ABI in 9m52s.
  It proved the direct-remux loader/binary and all loaders/licenses remained
  byte-identical while only the expected manifest and four Wasm binaries
  changed. The candidate passed genuine direct VP9 and MPEG-4 output checks,
  isolated bitrate/quality effects, cancellation, and injected-write cleanup.
- The maximum VP9 settings passed 3/3 on the 936,003-byte source at 234.7 MiB,
  but the required 181,825,549-byte three-run stress gate peaked at 264.1 MiB
  despite fixed 80 MiB Wasm and bounded I/O. That candidate is therefore not a
  completed/public result. Its 349.3/351.9/348.6-second runs were repeatable and
  correct, but renderer retention on runs two and three exceeded the hard limit.
- The next measured candidate keeps automatic/smaller/balanced on the fastest
  eight-worker core and routes only `higher` WebM quality to a separate lazy
  four-worker/two-codec-thread specialist. This targets the measured allocation
  source without weakening quality, memory accounting, or automatic speed.
- Hosted no-Docker run `33329599236` built that specialist in 10m24s. Its expected
  pre-publication comparison differed only by the manifest and new quality
  loader/Wasm (`cc5a54a...` / `1919cbb6...`); every existing loader, binary, and
  license stayed byte-identical.
- The tuned maximum settings (VP9, 640 px, 4 Mbit/s, 30 fps cap, higher quality)
  passed 3/3 on the 181,825,549-byte stress source at 232.9 MiB, fixed 72 MiB
  Wasm, five active workers, one pending 256 KiB write, and complete cleanup.
  Runs took 399.7/397.7/398.1 seconds and produced the same independently decoded
  50,010,269-byte VP9 WebM hash each time. The small maximum-settings gate also
  passed at 202.3 MiB in 1.544/1.237/1.146 seconds. The retained evidence records
  both the rejected faster topology and this accepted bounded one.
- After publication, hosted no-Docker run `33363432256` rebuilt and compared all
  19 FFmpeg files exactly at pushed commit `94923a3`. The mismatch-upload step
  was skipped, hosted cleanup passed, and the completed run retains zero
  artifacts. This closes M-05 for the 22 currently public video re-encode
  profiles without changing automatic-mode speed or the 250 MiB limit.

### 2026-08-30 — exact clean no-Docker reproduction for all engines

- Added pinned Linux no-Docker recipes and fail-independent matrix entries for
  BZIP2, full and decoder-only XZ, 7Z, TIFF, JPEG XL decode/encode, and AVIF
  decode/encode, joining the established SVG and five-module FFmpeg entries.
  Hosted run `33297796443` proved nine entries exactly in parallel; TIFF's only
  failure was a pre-build transient zlib download checksum and its unchanged
  recipe passed targeted run `33298467168` in 167 seconds.
- The clean AVIF encoder consistently produced 4,509,195-byte static/animation
  Wasm files with SHA-256 `4c28a20a06cb480344d2488307fe41c3842255f1df5607e7058bc974a9ec0a03`
  and `4f1d2902897f39f32bc22078bdce2d1ffb67ca70978a4bac0783f1430955085f`.
  The former 4,508,341-byte files came from a persistent BuildKit cache mount,
  so source-only clean builds could not reproduce them. Three SDK-path
  diagnostics repeated the clean hashes; code was the only differing Wasm
  section, with 22 of 2,824 function bodies changed and an 854-byte increase.
- Before publishing the clean bytes, all seven static/animated profiles passed
  3/3 at 207.3–224.3 MiB and static WebP passed an additional 10/10 gate.
  Chromium's prior I420/BGRX alternation was normalized through managed sRGB
  conversion before the existing bounded RGBA copy. The focused genuine
  browser/native decoder gate passed 5/5 and the standalone fixed-heap,
  positioned-write, truncate, flush, and box-order probe passed every case. The
  complete clean-binary image regression then passed 152/152 in 4.4 minutes.
- Temporary engine exports, converted outputs, validation copies, probe files,
  and Chrome profiles remained repository-local and were deleted after compact
  evidence was recorded. `work/` returned to only `.gitkeep`; protected
  `test.mkv` remained 2,958,573,265 bytes with SHA-256
  `31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34`.
  Full details are in `evidence/non-docker-all-engine-repro-2026-08-30.json`.
- Final integrated run `33312105530` passed all 16 jobs at `5e46a66`: 13/13
  privacy/offline tests, 152/152 image, 484/484 media, and 235/235 streaming
  browser cases, plus all 11 exact engine rebuilds. Every failure-upload step
  was skipped and the run retains zero artifacts, closing T-10 for this branch.

### 2026-08-30 — bounded MP3 bitrate, sample-rate, and channel controls

- Added one bounded option contract for every MP3-output route: automatic or
  64/96/128/192/256/320 kb/s, automatic or 32/44.1/48 kHz, and automatic/mono/
  stereo. Unsupported values and non-MP3 use are rejected independently in the
  browser contract, conversion worker, and native wrapper. Automatic retains
  the previously certified source-aware policy and fastest LAME
  `compression_level=9`; the controls add no extra worker, queue, or Wasm heap.
- Focused production Chrome passed 3/3: UI/request/plan propagation; genuine
  WAV-to-MP3 at exactly 256 kb/s, 44.1 kHz mono with full native decode and ASDR
  above 20 dB; and injected direct-write failure with no retained partial file.
  Reads/writes stayed at or below 256 KiB, one operation was pending, and every
  OPFS/validation copy was deleted in `finally`.
- The maximum selectable topology converted a genuine 153,600,106-byte,
  800-second WAV three times in 9.61–12.73 seconds (62.8–83.3× realtime).
  Every output was the same genuine 32,002,657-byte 320 kb/s, 48 kHz stereo MP3
  with SHA-256 `e9384cd1947d9de6aee88349d39bfe707ee50e7ab4603f7f03a40dc2cbc84bd5`.
  Worst complete-Chrome incremental private memory was 191.7 MiB, Wasm stayed
  at 32 MiB, reads at 262,144 bytes, writes/queueing at 1,057 bytes, pending
  operations at one, and cleanup recovery within 27.3 MiB of loaded idle.
- The first stress attempt produced the valid 32,002,657-byte output but the
  profiler still applied the automatic 192 kb/s size ceiling. It was correctly
  left unclaimed, the ceiling was derived from the selected bitrate, and the
  same unchanged encoder then passed all three runs. The compact failed report
  remains so this harness mistake is not diagnosed again as an engine failure.
- The hosted no-Docker candidate comparison changed only the expected general
  Wasm and manifest; all four specialist modules, JavaScript glue files, and
  six licenses remained byte-identical. Its bounded artifact, the 153.6 MB
  source, every converted/validation copy, and the Chrome profile were deleted;
  `work/` returned to only `.gitkeep`, and `test.mkv` remained byte-identical.
- After publication, GitHub Actions run `33268736116` rebuilt and compared all
  17 FFmpeg files byte-for-byte in 539 seconds at commit `f21bc98`. Cleanup
  passed, the mismatch-upload step was skipped, and zero artifacts remain.
  `evidence/mp3-output-controls-2026-08-30.json` retains the exact hashes and
  focused/stress/reproducibility facts.
- M-07 remains partial: selectable codec/quality, explicit lossless/lossy choice,
  and equivalent controls for other practical audio destinations are not yet
  implemented or claimed.

### 2026-08-29 — exact FFmpeg reproduction without Docker

- Added a Linux-hosted, pinned Emscripten 6.0.4 reproduction path that verifies
  every upstream source archive, builds all five FFmpeg modules, recursively
  compares JavaScript/Wasm/manifests/licenses against the published directory,
  and keeps all scratch data under repository-local `work/`. GitHub Actions run
  `33242017745` completed the exact comparison in 557 seconds without Docker;
  its always-run cleanup passed and zero hosted artifacts remain.
- Diagnosed the failed attempts instead of treating differing binaries as a
  success. The original isolated `/src` build sat outside the repository's ESM
  package scope, so a scratch CommonJS boundary is required for Autoconf's
  extensionless Emscripten probes. Current-source rebuilds then matched the
  general core exactly but correctly exposed older source provenance for the
  four video specialists.
- Git history and a mechanical source-hash check identified specialist commit
  `79e4db4`. A SHA-256-pinned reverse patch reconstructs it from the current
  wrapper after the general core builds. This reproduces the certified binaries
  byte-for-byte instead of replacing them and invalidating their retained
  three-run speed and complete-Chromium memory evidence.
- The rejected current-wrapper specialist candidates still passed 4/4 genuine
  production-browser direct-save, MPEG-4, VP8, and VP9 conversions in 18.7
  seconds. Their diagnostic artifact, converted copies, and scratch tree were
  deleted; the protected `test.mkv` remained byte-identical. Full details are in
  `evidence/non-docker-ffmpeg-repro-audit-2026-08-29.json`.
- The ordinary CI engine matrix now installs the exact pinned SDK for each
  binary-engine entry and runs every comparison independently alongside SVG.
  The all-engine implementation and final AVIF clean-byte publication are
  recorded in the 2026-08-30 section above.
- Main run `33252270830` then passed all seven integrated jobs at `098a7a7`:
  871/871 browser conversions, 75/75 unit tests, 13/13 privacy/offline cases,
  exact SVG, and exact FFmpeg. The FFmpeg build/comparison took 470 seconds,
  its cleanup passed, and the complete run retained zero uploaded artifacts.

### 2026-08-28 — fixed-ABI audit and source-aware conversion plan

- Persisted the request/worker/native ABI and non-Docker toolchain probe in
  `evidence/media-option-abi-audit-2026-08-28.json`, including exact absent
  option fields, the single-number Wasm call, installed-tool findings, and disk
  preflight. This prevents another loop that attempts to attach controls to a
  binary that cannot receive them.
- Benchmarked the direct MKV-to-MP4 production path against the ordinary 256 KiB
  core using the same protected 2.958 GB source, direct selected destination,
  Chrome 152 build, validator, and three-run gate. Both candidates wrote the
  identical 2,962,151,538-byte output hash and remained below 250 MiB, but the
  retained 1 MiB specialist improved median throughput by 19.6% (82.14 versus
  68.66 MB/s). The temporary selector change was reverted, converted copies and
  rejected raw reports were deleted, and no Docker environment was used.
- Added `lib/media-conversion-plan.ts`. It applies the actual fixed FFmpeg
  profile policy to every bounded-inspection stream and reports **Copy**,
  **Re-encode**, **Exclude**, or **Reject** before conversion. Codec-incompatible
  stream-copy inputs are shown as rejections; they are never described as an
  implicit transcode or extension rename.
- Corrected initial route selection: it now prefers an exact same-category
  profile and, for video, a standards-compliant non-elementary stream copy. A
  selected Matroska file therefore opens on `mkv-to-mp4`, not generic GZIP;
  MP4 opens on `mp4-to-mkv`, OGV on `ogv-to-mkv`, and raw/unknown binary still
  falls back to GZIP. This removes a manual step and starts from the fastest
  preservation-valid media topology.
- The production UI now displays those outcomes, details first-stream and
  destination policies, connects detected metadata signals to the exact
  destination limitations, and disables Start when bounded inspection proves a
  required codec/stream is absent or incompatible. Eight policy tests cover
  MP4/Matroska copy, incompatible rejection, first-stream extraction, all-stream
  M4A AAC copy, missing-codec blocking, OGV audio preservation, audio
  re-encoding, and AV1 WebM copy/exclusion.
- Production build, ESLint, TypeScript, and all 75 unit tests pass. Headed Chrome
  152 against the then-current 780,953-byte pre-rotation complex Matroska
  fixture revision showed the
  correct four-stream plan for both `mkv-to-mp4` and `mkv-to-webm-vp9`; it also
  blocked `mkv-to-mp3` before start because the fixture has no MP3 stream. The
  UI rendered without clipping and emitted zero console errors. Evidence is in
  `evidence/media-conversion-plan-browser-2026-08-28.json`; the headed check made
  no converted output and its disposable CLI screenshots/state were deleted.
- The complex Matroska retention gate now uses a byte-deterministic 780,989-byte
  fixture with explicit limited-range BT.709 primaries/transfer/matrix and a
  90° display matrix. It asserts output stream order/codecs, geometry,
  sample/display aspect, every named color field, rotation, chroma location,
  field order, video/audio titles, languages, default disposition, subtitle
  language, attachment identity/type, chapter titles, container tags, and exact
  decoded video/audio equality. Genuine production-browser copies to Matroska
  and MP4 passed 2/2 in 14.7 seconds without an engine rebuild, with exact VFR
  decoded-frame and both AAC access-unit hashes; MP4 also proved explicit
  subtitle/attachment/chapter exclusions. Both outputs were deleted.
  Evidence is in
  `evidence/complex-matroska-field-retention-browser-2026-09-01.json`.
- The remaining compatible Matroska-source stream-copy destinations now have
  field-level production-browser evidence. MOV/3GP retain the exact display
  matrix, every explicit BT.709 field, both AAC tracks/languages/dispositions,
  and exact VFR video/AAC payloads. MPEG-TS/FLV retain every explicit color
  field and exact unrotated compressed pictures while explicitly warning that
  their containers cannot represent the source Display Matrix; MPEG-TS retains
  both AAC tracks/languages, while FLV retains its first AAC track and title and
  discloses the additional audio exclusion. The focused gate passed 4/4 in
  14.1 seconds, the legacy MP4/Matroska gate passed 2/2 in 10.9 seconds, the
  media-options suite passed 11/11 in 40.9 seconds, and the complete shared-core
  remux suite passed 488/488 in 8.7 minutes. Candidate no-Docker run
  `33511638898` changed only `within-remux.wasm`; all companion artifacts were
  byte-exact. Publication run `33514702550` was the final exact-rebuild gate.
  It passed every artifact byte-exact in 10m11s, skipped mismatch upload, and
  completed hosted cleanup. The candidate download and remote artifact, all
  outputs, and browser artifacts were deleted; retained evidence is in
  `evidence/complex-container-field-retention-browser-2026-09-01.json`.
- A registry-wide disclosure gate now evaluates all 259 public FFmpeg profiles.
  It requires explicit metadata/container semantics, copy-versus-re-encode
  wording, first-stream and video exclusion disclosures for all 65 container-
  video-to-audio re-encode profiles, and first/additional-stream policy for all
  17 container video re-encode profiles. It found and corrected the two real
  gaps (`aiff-to-wav` and `wav-to-flac`); compact counts and corrections are in
  `evidence/media-disclosure-audit-2026-08-28.json`. This closes disclosure
  consistency, not the still-open field-retention implementation audit.
- The audio field-retention gate now covers all eight tag-capable destination
  families with representative production-browser routes: WAV, FLAC, AIFF,
  ALAC/M4A, WMA/ASF, MP3/ID3, Opus/Ogg, and Vorbis/Ogg. Native FFprobe found the
  exact source title in every genuine output; lossless routes also matched exact
  decoded PCM, and lossy routes retained their codec/rate/quality checks. The
  matrix passed 8/8 in 17.5 seconds; converted copies and Playwright artifacts
  were deleted afterward. Raw AAC/ADTS and AMR are correctly excluded because
  they cannot carry these tags. Evidence is in
  `evidence/audio-metadata-retention-browser-2026-08-28.json`.

### 2026-08-27 — bounded Ogg/Theora multi-stream source inspection

- Added bounded multiplexed Ogg page scanning for Theora and Vorbis BOS
  identification packets plus final per-serial granules. The tail scanner safely
  starts mid-page, rejects incomplete candidates, and caps valid page count.
- The genuine Theora/Vorbis fixture matches FFprobe on two logical streams,
  640×360, 24 fps, 4.0 seconds, mono 48 kHz Vorbis at 96 kb/s, and a 1,427,744
  b/s whole-file average from one 64 KiB head and one 66 KiB tail read.
- Focused malformed/bounds/parser and production Chrome panel coverage pass
  without decoding, conversion, Docker, or output copies. This closes the named
  standalone-audio and mainstream-container source-panel backlog; automatic
  planning and user-selectable conversion controls remain separate open work.

### 2026-08-27 — directed AVI multi-stream source inspection

- Added defensive RIFF/AVI and nested LIST traversal with a 256 KiB cumulative
  ceiling and explicit chunk/nesting limits. The walker reads `avih`, each
  stream's `strh`/`strf`, and INFO headers while seeking over `movi` media data.
- The genuine MPEG-4 Part 2/MP3 fixture matches its FFprobe manifest on two
  streams, 640×360, 24 fps, 4.041667-second video, 4.032-second mono 48 kHz MP3,
  192 kb/s audio, and INFO metadata after only 394 directed bytes. The largest
  individual read is 56 bytes.
- Focused malformed/bounds/parser and production Chrome panel coverage pass
  without decoding, conversion, Docker, or output copies.

### 2026-08-27 — bounded MPEG-TS multi-stream source inspection

- Added bounded 188/192/204-byte transport synchronization, PAT/PMT program
  discovery, stream-type/PID mapping, PES timestamp sampling, H.264 Annex-B SPS
  dimension parsing, and AAC ADTS rate/channel parsing. Defensive limits cover
  head/tail reads, elementary-header collection, program sections, and streams.
- The genuine retained H.264/AAC fixture matches its independent FFprobe
  manifest: two streams, 640×360, 24 fps, 3.999667-second video, and 3.967833-
  second mono 48 kHz AAC. One 64 KiB head read and one 64 KiB tail read provide
  the result; no middle payload is read or decoded.
- Focused malformed/bounds/parser coverage and production Chrome source-panel
  coverage pass without conversion, engine loading, Docker, or output copies.

### 2026-08-27 — bounded FLV multi-stream source inspection

- Added a 64 KiB-bounded FLV header/tag walker with signature, version, data-
  offset, tag-size, and 512-tag limits. It identifies video/audio codec tags and
  parses only bounded AMF `onMetaData` values for duration, dimensions, frame
  rate, sample rate, channel count, and declared data rates.
- AAC sequence headers override FLV's legacy one-bit stereo flag, so the genuine
  H.264/AAC fixture correctly reports mono 48 kHz instead of false stereo.
- The retained 938,798-byte FLV fixture reports H.264, 640×360, 24 fps, AAC,
  mono 48 kHz, 4.031 seconds, and script metadata from one 65,536-byte read.
  Focused parser and production Chrome panel coverage pass without conversion,
  engine loading, Docker, or retained disposable output.

### 2026-08-27 — bounded Matroska/WebM multi-stream source inspection

- Added a defensive EBML variable-integer walker with 64 KiB cumulative/input
  ceiling, seven-level nesting limit, 1,024-element limit, signature/document-
  type checks, and an explicit stop at the first Cluster. It reports Matroska or
  WebM, duration/timecode scale, video dimensions/default frame duration,
  effective audio output sample rate, channels, lossless bit depth, subtitles,
  and title/chapter/attachment/tag signals present in the bounded header prefix.
- Whole-file bitrate is explicitly labeled as a container average because EBML
  track headers do not declare per-track encoded byte totals. HE-AAC uses its
  declared output sampling frequency (48 kHz for the protected source), not its
  24 kHz coded core frequency.
- The genuine complex Matroska fixture exposes H.264, two AAC tracks, SubRip,
  title, chapters, attachment presence, and tags. A new deterministic 95,150-byte
  VP9/Opus WebM fixture is retained with a native-FFmpeg generator, ffprobe
  manifest, and SHA-256; Docker is not involved.
- Direct inspection of the protected 2,958,573,265-byte `test.mkv` performs one
  65,536-byte read and reports HEVC, 1920×804, approximately 24 fps, AAC 48 kHz
  six-channel audio, SubRip, and 12,340.096-second duration without loading,
  hashing, converting, or copying the whole file.
- Nineteen focused parser tests and the combined production Chrome source-panel
  test pass. Browser teardown deletes its repository-local profile and creates
  no converted output.

### 2026-08-27 — bounded MP4/MOV/3GP multi-stream source inspection

- Generalized the existing 64 KiB-budget ISO-BMFF walker to retain all complete
  audio and video tracks and report the primary video codec, resolution,
  duration, average frame rate, encoded-sample bitrate, and each companion audio
  stream's codec, duration, bitrate, sample rate, and channel layout.
- Classic QuickTime's later non-media `url ` handler no longer overwrites the
  track's earlier `vide`/`soun` handler. Track display duration and media-table
  duration remain distinct so edit-list-adjusted duration and encoded bitrate
  both match independent FFprobe manifests.
- Genuine retained H.264/AAC MOV and 3GP fixtures match 640×360, approximately
  24.01 fps, 3.999-second video at 1,740,889 b/s, and 4.011-second mono 48 kHz
  AAC at 125,008 b/s. The directed parser reads only 1,768 MOV bytes and 1,728
  3GP bytes; its largest individual read is 756 bytes.
- Sixteen focused parser tests pass, including MP4 routing, malformed ISO
  rejection, exact cumulative bounds, and preservation of prior standalone
  audio results. The production Chrome source-panel test passes both video
  containers and all standalone audio families without creating a converted
  copy. No Docker command or engine rebuild was used.

### 2026-08-27 — complete standalone-audio source inspection surface

- Added bounded Ogg page/identification/tail-granule parsing for Vorbis and Opus,
  raw AMR-NB signature/frame-window parsing, and a 64 KiB-read-budget ISO-BMFF
  box walker for M4A AAC, fragmented M4A ALAC, and AMR-WB inside real 3GP.
- The ISO walker follows `moov`/track/sample tables and bounded fragment runs,
  derives fragmented duration and encoded sample bytes, overrides misleading
  generic sample-entry fields with mandatory AMR mono/rate semantics, and uses
  AMR frame sizes to identify the exact 23.85 kb/s codec mode.
- Added directed ASF header-object and `WAVEFORMATEX` inspection. The genuine WMA2
  fixture reports its 320 kb/s stream rate rather than its 603 kb/s whole-file
  container rate, plus both content-metadata object signals.
- Fifteen focused parser tests pass across genuine fixtures, fragmented timing,
  exact codec/container distinctions, format signatures, structural rejection,
  and fixed read budgets. One production Chrome session passes the entire named
  standalone-audio family set while switching files repeatedly; it creates no
  converted copy and teardown removes its project-local browser profile.

### 2026-08-27 — FLAC, AIFF/AIFC, and AAC/ADTS source inspection

- Extended the directed-read inspector to native FLAC STREAMINFO/metadata-block
  headers, AIFF/AIFC `COMM` and metadata chunk headers (including the 80-bit
  sample-rate field), and consistent raw AAC/ADTS frame headers.
- The retained genuine fixtures require 50 bytes for FLAC, 54 bytes for AIFF,
  and 234 bytes for AAC. FLAC/AIFF facts are exact from standardized headers;
  AAC duration and bitrate are visibly labeled estimates from at most 32 frame
  headers. Renamed payloads are rejected by format signatures/sequences.
- Ten focused parser tests pass across all five implemented format families,
  exact bounds, large skipped ID3v2 tags, inconsistent MP3 sync, and renamed
  inputs. The production Chrome UI test passes all five retained genuine audio
  fixtures through one real app session without producing converted copies.

### 2026-08-27 — bounded WAV and MP3 pre-conversion inspection

- Added a browser-only source inspector for RIFF/RF64 WAVE and MPEG Layer III.
  It reports container, codec, duration, bitrate, sample rate, channels/layout,
  declared bit depth, and bounded metadata signals before conversion.
- Normal WAV files use directed RIFF chunk reads: the retained fixture requires
  only 52 bytes, including `fmt`, `LIST`, and `data` chunk headers. MP3 reads are
  capped at 4,234 bytes across the ID3 header, first-frame window, and ID3v1
  tail; large ID3v2 bodies are skipped by bounded random access rather than read.
- Unsupported formats continue to receive an explicit honest message instead
  of fabricated stream facts. Inspection errors do not become conversion
  claims, and the UI states that no payload was uploaded or decoded.
- Focused verification passed: six Node parser/bounds tests; TypeScript; ESLint;
  production Chrome WAV+MP3 UI inspection; and the existing same-origin GET-only
  CSV conversion/privacy test. Both browser tests removed their project-local
  profile/OPFS state in teardown and created no converted validation copy.
- Native audio controls remain missing. The unbuilt draft was removed after the
  Docker failure described above, so the current public UI and Wasm stay in
  agreement.

### 2026-08-27 — engine declaration audit and non-Docker reproducibility scope

- Added one checked manifest for every directory under `public/engines` and a
  local `npm run audit:engine-reproducibility` command. It currently covers all
  11 published engine directories and fails if a directory or package build
  command is omitted.
- The manifest now separates declaration coverage from executable non-Docker
  rebuild coverage. On the current hosted/local toolchains, SVG is the only
  executable clean rebuild; the ten binary-engine entries retain Docker-based
  recipes and are not falsely counted as non-Docker artifact comparisons.
- Split network privacy/offline tests into an explicit CI step; the remaining
  production-browser suites retain their independent validators.
- Local verification passed: manifest declaration audit 11/11, ESLint,
  TypeScript, workflow parse, and unit tests 42/42. The exact non-Docker SVG
  rebuild also passes hosted; equivalent non-Docker rebuild paths for the other
  ten engines remain pending.

### 2026-08-27 — cross-browser production conversion smoke

- Google Chrome 151.0.7922.174, Microsoft Edge 151.0.4129.107, Brave
  151.1.93.138, and Opera GX 134.0.5954.67 each passed the identical production
  build CSV-to-TSV worker conversion and strict same-origin GET-only privacy
  assertion.
- Each test deleted its isolated OPFS output and persistent test profile in
  teardown. The standard Opera distribution was not installed, so the Opera
  result is correctly labeled Opera GX rather than generalized to all Opera.
- This closes the missing basic compatibility evidence, but not broader route,
  headed-interaction, offline-engine, or process-memory coverage in each browser.

### 2026-08-27 — mechanical public evidence audit

- Added `npm run audit:public-evidence` and made it an explicit CI gate.
- The audit imports the actual registry, rejects PDF leakage, pending profiles,
  and public non-passing profiles, and validates the retained report contract:
  exact 250 MiB ceiling, required process/queue/read/write/Wasm/cleanup checks,
  positive source/output/validation byte counts, output hashes, no more than one
  pending operation, and per-run process-memory compliance.
- Current result: 388 public passed profiles, 388 with three-run evidence, 388
  tested at their published maximum size, zero pending, zero public non-passing,
  and zero PDF formats or routes.
- Raw JSON reports remain local/ignored to avoid committing hundreds of bulky
  diagnostic files. `evidence/public-profile-evidence.json` is the tracked
  388-entry index of selected report names, SHA-256 hashes, run counts, source
  sizes, and incremental-memory peaks. Local audits require it to match the raw
  reports; fresh CI checkouts validate it against the live registry.

### 2026-08-27 — honest basic source inspection

- Added an expandable source panel with locally detected format/category,
  browser MIME, exact aggregate bytes, file count, and modification time.
- The UI explicitly distinguishes these bounded browser facts from the deeper
  engine-side media stream/codec check and promises warnings for exclusions; it
  does not claim that MIME or extension detection is a complete container probe.
- Focused production Chrome CSV-to-TSV/privacy coverage passed with assertions
  for the new panel; ESLint, TypeScript, unit 42/42, both evidence audits, and
  artifact cleanup passed. Detailed pre-conversion media stream presentation and
  user-selectable conversion controls remain open.

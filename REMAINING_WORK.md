# Remaining work audit

Updated 2026-08-27. This is the living requirement audit for the original
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
| P-02 | Never transmit files, filenames, decoded data, extracted text, temporary data, or outputs | Verified complete | `tests/browser/privacy-offline.spec.ts` rejects non-GET, cross-origin, filename, and fixture-content requests; `README.md` documents the same boundary | Add the privacy project as an explicit CI step rather than relying only on the aggregate browser command. |
| P-03 | No PDF input, output, or tooling | Verified complete | Registry/unit gate and `TESTED.md` report zero PDF profiles | Preserve this prohibition. |
| P-04 | Broadest technically practical mainstream format coverage | Partially implemented | 388 public passed profiles across all named categories in `TESTED.md`; exact gaps are listed at its end | Complete feasibility audits and implement or defensibly reject the missing media, audio-control, HEIF/HEIC, raw-image, and SVG surfaces below. |
| P-05 | Public selector exposes only genuine, tested routes from the central registry | Verified complete | `lib/capability-registry.ts`, `publicProfilesFor`, registry unit tests, and the generated `TESTED.md` table | Re-run the registry/report consistency audit after every promotion. |
| P-06 | Every public profile remains at or below 250 MiB complete-Chromium incremental private memory | Verified complete for the current registry | `npm run audit:public-evidence` now proves 388/388 have strict passing reports, three-run evidence, and evidence at the published maximum; `scripts/memory-profile.mjs` uses the required process-tree formula and per-process sampling | Apply the same gate to every new route. |
| P-07 | Memory remains approximately independent of total file size | Partially implemented | Valid 6 GiB and 10 GiB MKV-to-MP4 remux runs stayed at 194.8 and 210.3 MiB; bounded category reports cover smaller stress sizes | Add progressive multi-gigabyte evidence for representative newly added media families and at least one genuine re-encode topology where disk/time permits. Do not describe remux evidence as re-encode evidence. |
| P-08 | Optimize conversion speed without weakening correctness, privacy, fidelity, cleanup, or memory | Partially implemented | `TESTED.md` contains measured accepted and rejected optimizations, including BYOB media input and Markdown/TXT-to-EPUB improvements | Continue benchmark-before/after work per remaining route; record rejected candidates here and in `TESTED.md`. |

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
| M-02 | Automatically inspect codecs/streams and select standards-compliant stream copy when possible, otherwise bounded re-encode | Partially implemented | Registry/planner and route-specific probes select certified copy or encode paths; `lib/media-source-inspection.ts` presents bounded pre-conversion details for every named standalone audio family plus multi-stream MP4/MOV/3GP, Matroska/WebM, and FLV inputs, including primary video, audio/video/subtitle tracks, resolution, average frame rate, duration, sample rate, channel layout, and bitrate semantics available from each container | Extend the bounded inspection contract to MPEG-TS, AVI, and Ogg video, then build a broader automatic planner across missing combinations. |
| M-03 | Preserve all compatible streams, timestamps, chapters, subtitles, attachments, language, rotation, aspect, color, and metadata; explicitly disclose exclusions | Partially implemented | Complex remux fixture and many route-specific validators/warnings cover preservation or explicit exclusions | Audit every public media profile field-by-field; expand preservation where the destination supports it instead of relying on first-stream policies. |
| M-04 | Mainstream containers and practical codecs named by the specification | Partially implemented | Extensive MKV/MP4/MOV/3GP/MPEG-TS/FLV/AVI/WebM/OGV and H.264/HEVC/VP8/VP9/AV1/MPEG-2/MPEG-4 routes are public | Investigate the additional OGV, 3GP, AVI, VP9, AV1, MPEG-2 audio/codec combinations and elementary/raw outputs listed in `TESTED.md`. |
| M-05 | User-selectable video resolution, bitrate, frame rate, codec, and quality where re-encoding/compatibility requires them | Missing | No production option model or controls were found; public re-encode profiles use fixed certified settings | Design bounded option schemas, planner support, UI controls, encoder validation, and separate evidence per memory-relevant profile. |
| M-06 | Mainstream audio conversion and extraction | Verified complete for the currently advertised fixed profiles | Broad standalone/container audio matrix, independent decode/quality tests, and stress reports | Extend variants only after the controls/metadata model is defined. |
| M-07 | User-selectable audio bitrate, sample rate, channel layout, codec/quality, lossless/lossy choice | Missing | `TESTED.md` explicitly lists these controls as remaining | Add validated bounded controls and keep each materially different memory topology as a separately gated profile. |
| M-08 | Audio tags, embedded artwork, and metadata preservation | Partially implemented | Some container/language metadata is preserved or exclusions are disclosed | Implement supported tag/artwork paths and clear per-destination limitations; independently validate them. |
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
| U-01 | Responsive polished UI with drag/drop, picker, detection, output selection, destination, storage mode, real progress, throughput, elapsed/remaining time, engine, memory, warnings, cancellation, errors, and cleanup | Partially implemented | `app/converter/ConverterApp.tsx` implements these core states and metrics; the source panel has tested details for all named standalone audio families plus MP4/MOV/3GP, Matroska/WebM, and FLV multi-stream inputs and discloses exact bounded read ceilings/estimates | Extend stream details to MPEG-TS, AVI, and Ogg video, add the missing relevant conversion controls, and perform broader headed usability review. |
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
| T-09 | Every published binary is pinned, reproducible, and auditable from source | Partially implemented | Docker/source recipes exist for FFmpeg, BZIP2, XZ, 7Z, TIFF, JXL, and AVIF; SVG has a deterministic build script; `scripts/engine-reproducibility-manifest.mjs` now audits all 11 published engine directories | Execute the new CI matrix and inspect all 11 clean artifact comparisons before upgrading this claim to verified complete. |
| T-10 | CI runs unit, production build, small browser, network privacy, validators, and reproducibility checks | Partially implemented | `.github/workflows/ci.yml` now has explicit privacy/offline and conversion/validator steps plus a parallel 11-engine reproducibility matrix | Obtain a successful hosted CI run; tune only job topology/timeouts if a clean cold build exceeds runner limits. |
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

1. Make reproducibility coverage manifest-driven and extend CI to every published
   engine without creating a single timeout-prone build job.
2. Extend the bounded multi-stream source inspector to MPEG-TS, AVI, and Ogg
   video containers, and add a bounded option model beginning with audio
   bitrate/sample-rate/channel-layout and video resolution/bitrate/frame-rate/
   quality controls.
3. Audit stream/metadata preservation for every public media route; implement
   representable fields and make every exclusion explicit.
4. Expand the passing Edge, Brave, and Opera smoke evidence into representative
   route and headed interaction coverage.
5. Perform bounded feasibility work for HEIF/HEIC, camera raw, broader SVG, and
   the missing media combinations. Promote only fully evidenced routes.
6. Expand headed interaction audits and representative multi-gigabyte scaling.
7. Run final build, lint, TypeScript, unit, browser, privacy/offline, validator,
   reproducibility, registry/report-consistency, cleanup, and protected-fixture
   gates before removing all partial/missing statuses.

## Rejected or deferred approaches

- Do not replace a re-encode scaling requirement with the fast 10 GiB remux;
  the latter proves bounded I/O and muxing, not codec-transcode performance.
- Do not expose fixed encoder settings as if they were user-selectable controls.
- Do not claim Chrome evidence proves Edge, Brave, or Opera behavior.
- Do not add a format solely because an extension can be emitted; structural and
  independent content validation remains mandatory.
- A real WAV-to-MP3 bitrate/rate/channel ABI and UI draft was removed before
  exposure because the changed FFmpeg Wasm could not be rebuilt and tested:
  Docker Desktop 4.47.0 crashed on its `dockerInference` runtime socket, and the
  user explicitly directed this goal not to use Docker. Do not restore those
  controls against the old binary; use a non-Docker reproducible toolchain or a
  separately authorized build environment first.

## Implementation and verification log

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

### 2026-08-27 — complete-engine CI reproducibility coverage

- Added one checked manifest for every directory under `public/engines` and a
  local `npm run audit:engine-reproducibility` command. It currently covers all
  11 published engine directories and fails if a directory or package build
  command is omitted.
- Replaced the five-engine sequential CI subset with a fail-independent,
  four-at-a-time matrix covering FFmpeg/remux, BZIP2, XZ, compact XZ decode,
  libarchive/7Z, TIFF, JXL decode/encode, AVIF decode/encode, and SVG.
- Split network privacy/offline tests into an explicit CI step; the remaining
  production-browser suites retain their independent validators.
- Local verification passed: manifest audit 11/11, ESLint, TypeScript, workflow
  parse, and unit tests 42/42. Hosted cold-build reproducibility remains pending.

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

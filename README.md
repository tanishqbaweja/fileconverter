# Within

Within is a privacy-first file converter for current Chromium browsers. User
files are processed inside a dedicated browser worker and written directly to a
destination selected with the File System Access API. The hosting service
delivers only application code, static assets, and WebAssembly; it has no upload
or conversion endpoint.

PDF input, PDF output, and PDF tooling are intentionally out of scope.

## Verified public routes

The selector and published matrix are generated from
`lib/capability-registry.ts`. A route is visible only when its implementation,
independent output validation, three-run repeatability check, cleanup check, and
complete-Chromium memory profile have passed. The current registry publishes 57
routes:

| Category | Verified routes | Largest tested source |
| --- | --- | ---: |
| Compression | bytes -> GZIP; GZIP -> bytes | 268,517,399 B |
| Archives | TAR -> TAR.GZ; TAR.GZ -> TAR; ZIP -> TAR; TAR -> ZIP | 268,517,551 B |
| Subtitles | SRT <-> WebVTT; ASS -> SRT/WebVTT; SRT/WebVTT -> TTML; TTML -> SRT/WebVTT | 101,393,068 B |
| Documents | TXT -> safe preformatted HTML; Markdown -> HTML; HTML -> visible TXT | 143,850,123 B |
| Structured data | CSV <-> TSV; CSV/TSV -> NDJSON; NDJSON -> CSV/TSV/JSON; JSON -> NDJSON | 293,633,883 B |
| Images | PNG/JPEG/WebP/GIF/AVIF/BMP to every implemented PNG/JPEG/WebP/BMP destination | 24,883,254 B |
| Video/container | MKV -> MP4; MKV -> M4A; MKV -> WAV; MKV -> WebM | 10,737,988,703 B |
| Standalone audio | M4A/MP3/FLAC/AIFF/OGG/Opus -> WAV; M4A/MP3/WAV -> FLAC | 201,600,106 B |

The registry records the exact tested size and limitations for every individual
route; the UI exposes that same evidence. VP8 WebM is public after passing its
three-run gate on the untouched 2,958,573,265-byte fixture. MPEG-4 Part 2 video
remains hidden while its final large-fixture gate is incomplete. The app never
substitutes an extension rename or a server conversion.

## Bounded-memory architecture

```text
Browser File
  -> reusable BYOB reader (<= 256 KiB)
  -> dedicated conversion worker
  -> custom FFmpeg AVIOContext / streaming transform
  -> one positional write in flight (<= 256 KiB)
  -> user-selected destination
```

Media conversion uses FFmpeg libraries directly through
`media/ffmpeg/within_remux.c`; it does not run the FFmpeg CLI and does not use
MEMFS for large input or output.

For sequential reads, a persistent BYOB byte-stream buffer is reused. A genuine
FFmpeg seek cancels that reader and opens a new bounded stream at the requested
offset. Bytes are copied once from the browser-owned BYOB view into FFmpeg's
256 KiB AVIO input buffer. FFmpeg's output callback exposes at most 256 KiB. A
dedicated destination worker owns the user-selected
`FileSystemWritableFileStream` and its writer for the full job. The conversion
worker copies one chunk into a 256 KiB `SharedArrayBuffer`, waits with Atomics,
and cannot queue another operation until the destination worker acknowledges
the write. Random offsets, truncate, close, abort, and a bounded 4 KiB error
message use the same one-command bridge. Browsers without that isolated-worker
capability retain the awaited asynchronous stream fallback.

The automated large-file harness uses synchronous OPFS access so it can profile
and independently validate an output without creating another multi-gigabyte
copy. That path rotates the access handle every 128 MiB and flushes every 8 MiB.
It is test/fallback storage, not the normal production destination.

A separate real-Chrome test remuxes H.264/AAC Matroska through the normal
asynchronous `FileSystemFileHandle` destination, streams the result to a
project-local verifier in 64 KiB chunks, probes and fully decodes it with native
FFmpeg, and deletes both test-owned copies. It asserts one pending write and a
262,144-byte ceiling for reads, writes, and queued output.

Hard limits:

- AVIO input buffer: 262,144 bytes
- AVIO output buffer: 262,144 bytes
- maximum browser read or write chunk: 262,144 bytes
- outstanding output operations: 1
- maximum queued output bytes: 262,144
- direct-writer shared command, payload, and error storage: 266,272 bytes
- active workers during direct media output: 2
- initial Wasm memory: 32 MiB
- maximum Wasm memory: 96 MiB
- shared Wasm memory: 96 MiB hard maximum; 32 MiB observed for lean media
  routes and 80 MiB observed for threaded WebM
- completed large input/output in MEMFS: prohibited
- text line, record, XML node, or subtitle cue: 1 MiB
- structured-data columns: 4,096
- image input: 64 MiB; decoded surface: 8,388,608 pixels; edge: 8,192 px
- archive entries: 10,000; total expanded bytes: 64 GiB; expansion ratio: 100:1
- ZIP central directory: 8 MiB; ZIP64, encryption, links, and special files:
  rejected

The worker is terminated after completion, cancellation, or failure. A failed or
cancelled OPFS job truncates and removes its app-owned entry. On a normal app
start, stale entries whose names begin with `within-` are removed. The storage
panel also provides manual cleanup. These operations never enumerate, alter, or
delete user-selected destination files.

Browser tests exercise write rejection, quota exhaustion, revoked destination
permission, and an uncaught worker crash after a real bounded write. Fault
injection is accepted only by the localhost `?test=1` harness. Write, quota, and
permission failures run through both its synchronous `within-test-*` adapter and
an isolated asynchronous `FileSystemFileHandle`; the application never sends a
fault request for a user-selected handle. Each case verifies that the partial
test output is empty or removed, deletes its test-created entry, and, after a
crash, verifies that a fresh conversion worker becomes ready.
Direct-handle faults are raised inside the destination worker after the bounded
write, then cross the 4 KiB shared error channel so writer-thread DOMException
names and messages cannot be hidden by a secondary shared-buffer decode error.
Cancellation is also exercised through the direct-save worker after more than
1 MiB of output has been written. The test verifies that abort discards the
transaction, leaves a zero-byte test entry, releases the destination lock,
restarts the conversion worker, and explicitly deletes the entry.

Files with the same detected input format can be selected as a batch. The user
chooses one destination folder, existing names are never overwritten, and files
are converted strictly sequentially through the same bounded engine with one
write in flight; the worker is terminated after the batch. The browser suite
converts Unicode-named files in one batch, parses both outputs, checks the queue
limits, and deletes every test-owned copy.

An abandonment test reloads the page during a real large streaming conversion.
The next app start removes the locked job's released `within-*` partial while an
unrelated browser-storage sentinel remains unchanged, proving cleanup is scoped
to app-owned entries.

Development conversions, stress fixtures, browser profiles, and validation
copies stay under this repository's `fixtures/stress/`, `outputs/`, and `work/`
directories. Each browser smoke test deletes its copied output in teardown, each
category profiler cleans its generated fixtures and converted copies in a
`finally` block, and `npm run clean:generated` performs the same bounded,
project-local cleanup manually. Compact JSON/CSV/HTML evidence is retained under
`outputs/reports/`; `npm run clean:reports` keeps only the newest passing and
newest failing record per profile.

## Media decisions and limitations

The current media core is deliberately small. It enables only the documented
AIFF, FLAC, Matroska, MOV/MP4, MP3, Ogg, and WAV demuxers; fragmented MP4/M4A,
WAV, FLAC, and WebM muxers; the required audio and H.264/HEVC decoders; PCM,
FLAC, MPEG-4 Part 2, and libvpx VP8 encoders; libswresample; libswscale; and the
necessary parsers and bitstream filters. It stream-copies compatible HEVC and
AAC packets, performs real bounded audio decode/resample/encode pipelines, or
decodes H.264/HEVC video and performs a real video encode.

The lossless MKV-to-MP4 planner accepts only H.264 or HEVC video plus AAC audio,
the combinations proven by its browser and stress tests. M4A extraction accepts
AAC. A different codec is rejected before the muxer writes media data, with a
readable explanation that a verified bounded re-encoder is not installed; it is
never silently dropped or passed to an incompatible container.

For the supplied `test.mkv`, the MP4 route preserves the main HEVC video, AAC
5.1 audio, language, color/aspect information, dispositions, timestamps, and
compatible general metadata. The SRT stream and attached PNG cannot be
stream-copied into this MP4 profile; the worker emits explicit warnings before
excluding them. M4A intentionally excludes video, subtitle, and attachment
streams and reports each limitation. It uses a fixed five-second fragment
duration so audio-only sample tables cannot grow with total duration. The WAV
profile converts only the first audio stream, preserves its channel count and
sample rate, and discloses the container metadata it cannot represent.

The reproducible `complex-remux-source.mkv` fixture adds VFR H.264, two AAC
tracks with English and Spanish language tags and distinct dispositions, French
SRT, two named chapters, a text attachment, and container metadata. A real
browser MKV-to-MP4 test preserves both audio tracks, VFR packet timing,
dispositions, languages, and compatible metadata; verifies explicit warnings
for the three unrepresentable source elements; and fully decodes the output with
native FFmpeg. Rebuilding the fixture produces the same SHA-256. A separate
corrupt-MKV browser case proves FFmpeg errors reach the interface, its partial
OPFS output is removed, and a replacement worker becomes ready.

The MPEG-4 video profile is intentionally narrow: it accepts YUV420P H.264 or
HEVC, converts only the first non-attached video stream at 2 Mbit/s, and
explicitly excludes audio, subtitles, attachments, and chapters. Its current
evidence is only a deterministic small fixture, so the normal selector hides it.
The VP8 profile similarly converts the first video stream to a video-only WebM,
bounds output to 640 pixels wide, uses four decoder threads, four encoder
threads, four token partitions, realtime deadline, `cpu-used=8`, and zero
lookahead, and reports excluded audio, subtitles, attachments, and chapters.
It is loaded from a dedicated eight-worker pthread module so audio and remux
routes do not pay that pool's memory cost.

## Non-media engines and limitations

Archive conversion never extracts an archive tree to memory or disk. TAR.GZ
routes validate each USTAR header while passing the original TAR bytes through
the browser compression streams. ZIP-to-TAR reads the bounded ZIP32 central
directory, validates every local header, path, size, method, CRC-32, and
expansion limit, and inflates one entry at a time. TAR-to-ZIP reads one USTAR
entry at a time and writes DEFLATE data descriptors plus a bounded central
directory. Both directions reject traversal, absolute and drive-letter paths,
duplicates, encryption, ZIP64, multi-disk records, links, devices, GNU/PAX
extensions, and archive bombs. Permissions, owners, comments, and unsupported
container-specific fields are disclosed as not preserved.

Still-image routes use `ImageDecoder` in the conversion worker, request one
deterministic RGBA frame, enforce compressed-size, dimensions, pixel-count,
decoded-byte, and expansion-ratio limits before allocating the surface, and
write the encoded output in bounded chunks. Animated inputs intentionally use
only the first frame. EXIF, ICC, text metadata, and animation are not preserved;
JPEG and BMP composite transparency over white, and JPEG/WebP outputs are lossy
at the disclosed quality.

Subtitle and structured-data engines are incremental UTF-8 parsers with a
1 MiB cue/record/line ceiling. SRT, WebVTT, ASS, and TTML routes validate timing
and emit real destination syntax. TTML rejects DTDs and custom entities, accepts
clock/second/millisecond time expressions, and maps only basic italic, bold,
underline, and line-break styling. CSV/TSV quoting is parsed across chunk
boundaries; NDJSON and JSON-array routes preserve nested values but normalize
equivalent JSON whitespace and lexical forms. Column-shape losses are warned.

Document routes are deliberately semantic rather than extension renames. TXT
is escaped into a complete preformatted HTML document. Markdown renders a
bounded documented subset and escapes raw HTML. HTML-to-TXT tokenizes the input,
decodes the supported entities, retains visible block/list/table text, and
removes scripts, styles, templates, metadata, layout, images, SVG/canvas, and
form controls. Unsupported Markdown extensions and HTML named entities produce
clear limitations or errors rather than silently invoking a server converter.

## Deliberately unsupported routes

Absence from the registry means unsupported; the app does not guess a route.
PDF is excluded by product scope. HEIC/HEIF, TIFF, ICO, JPEG XL, SVG, camera raw,
animated-image output, 7Z, BZIP2, XZ, EPUB, DOCX/XLSX/PPTX, ODT/ODS/ODP, and
additional legacy/proprietary media codecs are not published because this build
does not yet contain a bounded, auditable browser engine and independent
large-fixture evidence for them. Office and ebook files are not flattened to
plain text and called converted. ZIP64 and files requiring an individual ZIP
entry or completed ZIP above 4 GiB are rejected instead of silently wrapping or
truncating sizes.

The same rule applies to codec/container combinations. A listed container name
does not imply every codec can be copied into it. The planner exposes only the
exact source/destination profiles in the registry, and each profile lists its
stream exclusions, metadata losses, browser requirements, CPU class, memory
class, largest tested input, and automated-test state.

## Privacy, security, and offline behavior

- no upload, filename, extracted-text, analytics, advertising, or file-content
  telemetry
- CSP limits scripts, workers, connections, forms, frames, and objects to the
  application origin
- COOP, COEP, CORP, Origin-Agent-Cluster, nosniff, no-referrer, and restricted
  Permissions-Policy headers
- network Playwright test fails if a conversion emits a non-GET request,
  cross-origin request, filename, or fixture content
- service worker caches only same-origin GET application/engine assets
- test routes are excluded from service-worker caching
- selected files and converted outputs are browser File API objects and never
  pass through `fetch`, Cache Storage, or a service worker
- after one online controlled reload, the installed app shell and media engine
  load offline

The direct-save route requires a secure context and the File System Access API.
Current Chrome, Edge, Brave, and Opera are the primary targets. Missing features
produce a visible limited-browser state; there is no full-memory or server-side
fallback.

## Reproducible FFmpeg/Wasm build

Pinned inputs:

- FFmpeg 8.1.2 official source archive, SHA-256
  `464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c`
- libvpx 1.16.0 official source archive, SHA-256
  `7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c`
- `emscripten/emsdk:6.0.4-x64` image digest
  `sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b`

Build the auditable artifacts:

```powershell
npm ci
npm run build:ffmpeg-remux
npm run build
```

The Docker build verifies the source archive before configuring FFmpeg. Exact
configure switches and Emscripten flags are in
`media/ffmpeg/build-libraries.sh` and `media/ffmpeg/build-remux.sh`. Generated
hash-independent settings are recorded in
`public/engines/remux/build-manifest.json`.

## Validation and memory results

The unmodified project-root fixture:

- path: `test.mkv`
- bytes: 2,958,573,265
- SHA-256:
  `31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34`
- duration: 12,340.096 seconds
- streams: HEVC Main 1920×804, HE-AAC 48 kHz 5.1 Hindi, English SRT,
  attached PNG 250×140
- chapters: none

The deterministic complex remux fixture is 780,953 bytes with SHA-256
`ef3675ef5a258230de70970a4c3e0f0545d74538661fe7df98a48f1b525f1ad2`.

Chrome 150.0.7871.188 was launched as a clean process tree. The acceptance
formula is exactly:

```text
incrementalPrivateMiB =
  peak private memory of the complete Chrome process tree during conversion
  - stable private memory of the same clean Chrome instance on about:blank
```

Current exact-build results:

| Profile | Runs/session | Source | Output | Worst incremental private memory | Peak Wasm | Cleanup delta range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MKV → MP4 | 3 | 2,958,573,265 B | 2,962,151,522 B | 173.8 MiB | 52.6 MiB | −16.8–31.9 MiB |
| MKV → MP4, shared direct writer | 1 | 2,958,573,265 B | 2,962,151,522 B | 212.7 MiB | 52.6 MiB | 14.4 MiB |
| MKV → M4A | 3 | 2,958,573,265 B | 249,427,974 B | 164.7 MiB | 32 MiB | −1.1–0.9 MiB |
| MKV → WAV | 3 | 2,958,573,265 B | 7,107,834,734 B | 178.0 MiB | 32 MiB | −7.2–−4.3 MiB |
| MKV → WebM | 3 | 2,958,573,265 B | 921,524,214 B | 208.8 MiB | 80 MiB | 0.7–6.0 MiB |
| MKV → MP4 scale | 1 clean session | 10,737,988,703 B | 10,746,764,426 B | 182.4 MiB | 49.4 MiB | −11.1 MiB |
| GZIP compress | 1 | 256 MiB | streamed | 172.4 MiB | 0 | <= 53.6 MiB |
| GZIP decompress | 1 | 256.1 MiB | streamed | 145.0 MiB | 0 | <= 33.2 MiB |

Representative three-run category peaks from the same full-process-tree
profiler:

| Category/profile | Source | Worst incremental private memory | Output validation |
| --- | ---: | ---: | --- |
| Images, BMP -> WebP | 24,883,254 B | 239.6 MiB | native decode, dimensions, alpha/fidelity |
| Audio, MP3 -> WAV | 50,401,224 B | 247.6 MiB | full decode and APSNR |
| Records, JSON -> NDJSON | 293,633,883 B | 229.3 MiB | independent streamed hash/parse |
| Archives, TAR -> TAR.GZ | 268,436,992 B | 219.3 MiB | full TAR validation |
| Archives, ZIP -> TAR | 268,517,517 B | 194.4 MiB | libarchive entry size/SHA-256 |
| Subtitles, WebVTT -> TTML | 73,788,904 B | 204.5 MiB | exact streamed output hash |
| Documents, HTML -> TXT | 143,850,123 B | 231.6 MiB | exact streamed output hash |

The three MP4 outputs shared SHA-256
`aff831693c020c02a0163e25d0f08a7529d0fb0e4022f0cb984c60d90348334a`
and completed in 9.3–16.2 seconds with the compatibility-gated Wasm build.
The shared direct-writer run produced the same byte-identical hash in 33.0
seconds, 8.8% faster than the initial 36.2-second asynchronous path. It uses one
256 KiB payload, one write in flight, a persistent stream writer, and a second
worker; its report records `destinationMode: "direct-handle"` separately from
synchronous OPFS evidence.
The three M4A outputs shared SHA-256
`334d44f28c7eefc4c2393b32db991c886c32444254868b1e4c602252f40f8a38`.
The three WAV outputs shared SHA-256
`659d36eac2310b7d20d8c694a8eafb11760061def608a9241a64913fc003e1eb`.
The three WebM outputs shared SHA-256
`b192fb8b0cb3e4356b54ed242d0de5fbeb6a56f421381c426ca19321e0807e1f`;
they completed in 2,682.0–2,687.1 seconds, passed full native decode as VP8,
and produced a midpoint SSIM of 0.967634. A fixed 120-second benchmark improved
from 122.48 seconds on the old single-thread artifact to 26.29–27.44 seconds on
the final four-thread artifact while remaining below the same memory ceiling.
Native `ffprobe` validates structure and metadata; native FFmpeg traverses every
selected output packet. JSON, CSV, and HTML reports remain under the ignored
`outputs/reports/` folder. Multi-gigabyte output files and Chrome profiles are
deleted after validation.

Run the local checks:

```powershell
npm run lint
npx tsc --noEmit --incremental false
npm test
npm run test:browser
```

Run a three-pass real-fixture profile:

```powershell
$env:WITHIN_RUN_COUNT = "3"
npm run profile:memory -- test.mkv mkv-to-mp4 fixtures/media/test-mkv.manifest.json
```

Profile the normal asynchronous destination-handle adapter without creating a
second multi-gigabyte validation copy outside the project-local Chrome profile:

```powershell
$env:WITHIN_DESTINATION_MODE = "direct-handle"
$env:WITHIN_RUN_COUNT = "1"
npm run profile:memory -- test.mkv mkv-to-mp4 fixtures/media/test-mkv.manifest.json
Remove-Item Env:WITHIN_DESTINATION_MODE,Env:WITHIN_RUN_COUNT
```

Create and profile a valid 10 GiB scale fixture, then remove it after its report:

```powershell
npm run fixtures:media-stress -- 10
$env:WITHIN_RUN_COUNT = "1"
npm run profile:memory -- fixtures/stress/media/remux-10g.mkv mkv-to-mp4
npm run clean:generated
```

Profile an implemented category sequentially. The runner generates fixtures
only inside this repository and removes the large fixtures, converted outputs,
and browser profiles whether the category passes, fails, or is interrupted:

```powershell
npm run profile:audio
npm run profile:images
npm run profile:records
npm run profile:subtitles
npm run profile:archives
npm run profile:documents
```

`scripts/memory-profile.mjs` records complete per-process private/RSS samples,
accessible page/worker heaps, Wasm memory, SharedArrayBuffer totals, buffers,
queue depth, worker count, storage estimates, throughput, output size, and
cleanup recovery. Failed runs retain compact reports for diagnosis but delete
the browser profile and converted payload. CI exercises small fixtures;
multi-gigabyte profiling is documented for a dedicated Windows runner with
installed stable Chrome and native FFmpeg.

## Repository map

- `app/` — interface, runtime capability display, PWA registration, cleanup UI
- `lib/capability-registry.ts` — single source for formats and public matrix
- `workers/` — bounded media, archive, subtitle, image, record, and document
  transforms; FFmpeg bridge, destinations, and lifecycle
- `media/ffmpeg/` — reproducible build and native AVIO wrapper
- `public/engines/` — auditable generated engine artifacts
- `scripts/` — fixtures, validators, cleanup, process-tree memory reports
- `tests/browser/` — correctness, privacy, offline, and bounded-I/O tests
- `worker/` — production security headers and static application handler

## Licensing

Application code is project-owned. FFmpeg licensing depends on the exact
configured components; this build excludes GPL/nonfree switches. libvpx is
BSD-3-Clause licensed. Deployers must still review FFmpeg's LGPL terms, the
bundled third-party notices, and any codec patent obligations applicable to
their jurisdiction and distribution model.

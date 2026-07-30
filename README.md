# Within

Within is a privacy-first file converter for current Chromium browsers. User
files are processed inside a dedicated browser worker and written directly to a
destination selected with the File System Access API. The hosting service
delivers only application code, static assets, and WebAssembly; it has no upload
or conversion endpoint.

PDF input, PDF output, and PDF tooling are intentionally out of scope.

## Verified public routes

The selector and this table come from `lib/capability-registry.ts`. A route is
visible only when its implementation, independent output validation, and
complete-Chromium memory profile have passed.

| Input | Output | Route | Largest tested source | Status |
| --- | --- | --- | ---: | --- |
| Any byte stream | GZIP | Browser compression stream | 256 MiB | Passed |
| GZIP | Original bytes | Browser decompression stream | 256.1 MiB | Passed |
| MKV with compatible codecs | MP4 | FFmpeg stream copy | 10,737,988,703 bytes | Passed |
| MKV with compatible AAC | M4A | FFmpeg audio extraction/stream copy | 2,958,573,265 bytes | Passed |

SRT/WebVTT and CSV/TSV/NDJSON engines are implemented and browser-tested, but
remain hidden from the normal selector while their dedicated large-fixture
memory records are pending. MKV-to-WebM re-encoding is declared non-public and
pending; the app never substitutes an extension rename or a server conversion.

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
normal user-selected `FileSystemWritableFileStream` receives one owned chunk
because its asynchronous write may outlive the Wasm heap view; backpressure
prevents a second write from being queued.

The automated large-file harness uses synchronous OPFS access so it can profile
and independently validate an output without creating another multi-gigabyte
copy. That path rotates the access handle every 128 MiB and flushes every 8 MiB.
It is test/fallback storage, not the normal production destination.

Hard limits:

- AVIO input buffer: 262,144 bytes
- AVIO output buffer: 262,144 bytes
- maximum browser read or write chunk: 262,144 bytes
- outstanding output operations: 1
- maximum queued output bytes: 262,144
- initial Wasm memory: 32 MiB
- maximum Wasm memory: 96 MiB
- SharedArrayBuffer allocation: 0 bytes in verified media runs
- completed large input/output in MEMFS: prohibited

The worker is terminated after completion, cancellation, or failure. A failed or
cancelled OPFS job truncates and removes its app-owned entry. On a normal app
start, stale entries whose names begin with `within-` are removed. The storage
panel also provides manual cleanup. These operations never enumerate, alter, or
delete user-selected destination files.

## Media decisions and limitations

The current media core is deliberately small. It enables Matroska demuxing,
fragmented MP4/M4A muxing, the HEVC and AAC parsers required by the verified
fixture, and the necessary bitstream filters. It stream-copies compatible HEVC
and AAC packets.

For the supplied `test.mkv`, the MP4 route preserves the main HEVC video, AAC
5.1 audio, language, color/aspect information, dispositions, timestamps, and
compatible general metadata. The SRT stream and attached PNG cannot be
stream-copied into this MP4 profile; the worker emits explicit warnings before
excluding them. M4A intentionally excludes video, subtitle, and attachment
streams and reports each limitation. It uses a fixed five-second fragment
duration so audio-only sample tables cannot grow with total duration.

The project does not claim that every MKV codec combination is compatible with
MP4/M4A. Genuine codec conversion routes stay absent until a separately pinned
decoder/encoder core passes the same correctness and process-tree memory gate.

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
| MKV → MP4 | 3 | 2,958,573,265 B | 2,962,151,522 B | 151.6 MiB | 49.4 MiB | 20.0–61.1 MiB |
| MKV → M4A | 3 | 2,958,573,265 B | 249,427,974 B | 133.1 MiB | 32 MiB | 4.6–21.8 MiB |
| MKV → MP4 scale | 1 clean session | 10,737,988,703 B | 10,746,764,426 B | 182.4 MiB | 49.4 MiB | −11.1 MiB |
| GZIP compress | 1 | 256 MiB | streamed | 172.4 MiB | 0 | <= 53.6 MiB |
| GZIP decompress | 1 | 256.1 MiB | streamed | 145.0 MiB | 0 | <= 33.2 MiB |

The three MP4 outputs shared SHA-256
`aff831693c020c02a0163e25d0f08a7529d0fb0e4022f0cb984c60d90348334a`.
The three M4A outputs shared SHA-256
`334d44f28c7eefc4c2393b32db991c886c32444254868b1e4c602252f40f8a38`.
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

Create and profile a valid 10 GiB scale fixture, then remove it after its report:

```powershell
npm run fixtures:media-stress -- 10
$env:WITHIN_RUN_COUNT = "1"
npm run profile:memory -- fixtures/stress/media/remux-10g.mkv mkv-to-mp4
npm run clean:generated
```

`scripts/memory-profile.mjs` records complete per-process private/RSS samples,
accessible page/worker heaps, Wasm memory, SharedArrayBuffer totals, buffers,
queue depth, worker count, storage estimates, throughput, output size, and
cleanup recovery. Failed runs retain their reports for diagnosis. CI exercises
small fixtures; multi-gigabyte profiling is documented for a dedicated Windows
runner with installed stable Chrome and native FFmpeg.

## Repository map

- `app/` — interface, runtime capability display, PWA registration, cleanup UI
- `lib/capability-registry.ts` — single source for formats and public matrix
- `workers/` — bounded transforms, FFmpeg bridge, destinations, lifecycle
- `media/ffmpeg/` — reproducible build and native AVIO wrapper
- `public/engines/` — auditable generated engine artifacts
- `scripts/` — fixtures, validators, cleanup, process-tree memory reports
- `tests/browser/` — correctness, privacy, offline, and bounded-I/O tests
- `worker/` — production security headers and static application handler

## Licensing

Application code is project-owned. FFmpeg licensing depends on the exact
configured components; this build excludes GPL/nonfree switches and external
codec libraries. Deployers must still review FFmpeg's LGPL terms and any codec
patent obligations applicable to their jurisdiction and distribution model.

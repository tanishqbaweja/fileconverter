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
complete-Chromium memory profile have passed. The current registry publishes 121
routes:

| Category | Verified routes | Largest tested source |
| --- | --- | ---: |
| Compression | bytes -> GZIP/BZIP2/XZ; GZIP/BZIP2/XZ -> bytes | 270,593,081 B |
| Archives | TAR -> TAR.GZ/TAR.BZ2/TAR.XZ; TAR.GZ/TAR.BZ2/TAR.XZ -> TAR; ZIP -> TAR/TAR.GZ; TAR/TAR.GZ -> ZIP | 270,592,763 B |
| Subtitles | SRT <-> WebVTT; ASS -> SRT/WebVTT; SRT/WebVTT -> TTML; TTML -> SRT/WebVTT | 101,393,068 B |
| Documents | DOCX/ODT -> visible TXT; TXT -> safe preformatted HTML; Markdown -> HTML; HTML -> visible TXT | 143,850,123 B |
| Ebooks | EPUB -> spine-ordered visible TXT | 134,219,595 B |
| Spreadsheets | XLSX/ODS -> first-visible-sheet CSV | 135,267,834 B |
| Presentations | PPTX/ODP -> slide/page-ordered TXT | 135,296,355 B |
| Structured data | CSV <-> TSV; CSV/TSV <-> JSON/NDJSON; NDJSON <-> JSON; XML -> NDJSON | 293,633,883 B |
| Images | PNG/JPEG/WebP/GIF/AVIF/BMP to implemented PNG/JPEG/WebP/BMP/ICO destinations | 24,883,254 B |
| Video/container | MKV -> MP4/MPEG-4 MP4/M4A/WAV/WebM; MOV/3GP/MPEG-TS/FLV -> MP4/M4A/WAV; AVI -> MP4/WAV; OGV -> WebM/WAV; MPEG-2 M2V -> MPEG-4 MP4/VP8 WebM; MP4 -> M4A/WAV | 10,737,988,703 B |
| Standalone audio | AAC -> M4A/WAV/FLAC; raw AMR-NB -> WAV/FLAC; M4A (AAC/ALAC), MP3, FLAC, WMA, AIFF, OGG, or Opus -> WAV; M4A (AAC/ALAC), MP3, WAV, WMA, AIFF, OGG, or Opus -> FLAC; WAV/FLAC -> ALAC M4A or WMA2 | 220,800,108 B |

The registry records the exact tested size and limitations for every individual
route; the UI exposes that same evidence. VP8 WebM and MPEG-4 Part 2 MP4 are
public after passing their three-run gates on the untouched
2,958,573,265-byte fixture. The app never substitutes an extension rename or a
server conversion.

The living [tested conversion ledger](TESTED.md) lists every public passed
profile, retained Chrome stress evidence, exact I/O bounds, cleanup status, and
explicit remaining gaps. Regenerate it after profiling with
`npm run tested:ledger`.

## Bounded-memory architecture

```text
Browser File
  -> synchronous worker slice reader, with BYOB fallback (<= 256 KiB)
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

Audio muxers often expose only 2-24 KiB at a time even though the destination
accepts a larger bounded write. The direct-save media bridge therefore copies
adjacent M4A, WAV, and FLAC packets into one reusable 256 KiB coalescing buffer.
It flushes before a non-contiguous write, truncate, close, or explicit flush;
the destination still permits only one operation and at most 256 KiB in flight.
This changes only write granularity, not decoding, encoding, samples, metadata,
or output bytes.

Raw BZIP2 and TAR.BZ2 use a separate lazy-loaded libbzip2 1.0.8 Wasm module.
It reuses a 256 KiB browser read buffer, copies that bounded view into a fixed
8 MiB Wasm heap, drains owned 64 KiB output chunks, and awaits the one active
destination write before continuing. Compression uses the standard lossless
level-1 100 KiB block for lower memory and faster browser throughput; no full
source, output, or TAR tree is materialized.

Raw XZ and TAR.XZ use a separate lazy-loaded XZ Utils 5.8.3 liblzma Wasm
module. It uses the same 256 KiB reads, owned 64 KiB output chunks, one awaited
write, and streaming TAR validation with a fixed 48 MiB Wasm heap. Compression
uses standard lossless preset 0 and CRC64 for the fastest low-memory XZ route;
the decoder is additionally capped at 32 MiB of liblzma allocations.

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
- AVIO output buffer: 262,144 bytes normally; 1,048,576 bytes for direct MKV -> MP4
- maximum browser read chunk: 262,144 bytes
- maximum browser write and queued output: 262,144 bytes normally; 1,048,576 bytes for direct MKV -> MP4
- direct audio packet-coalescing buffer: 262,144 bytes
- BZIP2 input/output buffers: 262,144 / 65,536 bytes; fixed Wasm memory: 8 MiB
- XZ input/output buffers: 262,144 / 65,536 bytes; fixed Wasm memory: 48 MiB;
  decoder allocation limit: 32 MiB
- outstanding output operations: 1
- direct-writer shared command, payload, and error storage: 1,052,704 bytes for direct MKV -> MP4
- active workers during direct media output: 2
- initial Wasm memory: 32 MiB
- maximum Wasm memory: 96 MiB
- shared Wasm memory: 96 MiB hard maximum; 32 MiB observed for lean media
  routes and 80 MiB observed for threaded WebM
- completed large input/output in MEMFS: prohibited
- text line, record, or subtitle cue: 1 MiB
- XML markup token: 256 KiB; nesting: 256 elements; attributes: 4,096 per element
- DOCX package metadata part: 1 MiB; main XML token: 256 KiB; package expansion: 100:1
- EPUB package metadata part: 2 MiB; spine items: 10,000; package expansion: 100:1
- XLSX metadata part: 2 MiB; shared-string XML: 64 MiB; shared strings:
  262,144 items, 8 MiB total characters, and 1 MiB per cell; worksheets:
  1,048,576 rows by 16,384 columns; package expansion: 100:1
- PPTX metadata part: 2 MiB; declared slides: 10,000; XML token: 256 KiB;
  package expansion: 100:1
- OpenDocument manifest: 2 MiB; XML token: 256 KiB; nesting: 256 elements;
  package expansion: 100:1; ODS cells and rows: 1 MiB text, 16,384 columns,
  and 1,048,576 rows; ODP pages: 10,000
- structured-data columns: 4,096
- image input: 64 MiB; decoded surface: 8,388,608 pixels; edge: 8,192 px
- ICO output: one PNG-compressed image; 256 px maximum per edge
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
newest failing record per profile, destination mode, and distinct source
fixture, so a short A/B benchmark cannot erase multi-gigabyte evidence.

## Media decisions and limitations

The current media core is deliberately small. It enables only the documented
AIFF, AVI, FLAC, FLV, Matroska, MOV/MP4/3GP, MPEG-TS, MP3, Ogg, and WAV demuxers; fragmented MP4/M4A,
WAV, FLAC, and WebM muxers; the required audio and H.264/HEVC decoders; PCM,
FLAC, MPEG-4 Part 2, and libvpx VP8 encoders; libswresample; libswscale; and the
necessary parsers and bitstream filters. It stream-copies compatible HEVC and
AAC packets, performs real bounded audio decode/resample/encode pipelines, or
decodes H.264/HEVC video and performs a real video encode.

The lossless MKV/MOV/MPEG-TS-to-MP4 planner accepts only H.264 or HEVC video plus AAC;
3GP-to-MP4 accepts the verified H.264/AAC combination.
FLV-to-MP4 accepts the verified H.264/AAC combination, and AVI-to-MP4 accepts
the verified MPEG-4 Part 2/MP3 combination. M4A extraction
from MKV, MOV, 3GP, MPEG-TS, FLV, or MP4 accepts AAC. WAV extraction from MKV,
MOV, 3GP, MPEG-TS, FLV, or MP4 performs
genuine AAC decode, libswresample conversion, and PCM s16le encoding. A different codec is
rejected before the muxer writes media data, with a readable explanation that a
verified bounded re-encoder is not installed; it is never silently dropped or
passed to an incompatible container.

AVI-to-WAV converts the first MP3 stream through the same bounded decode,
resample, and PCM s16le pipeline while explicitly excluding video and auxiliary
streams.

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

The OGV profile uses that same bounded module to decode the first Theora video
stream to VP8 while copying the first Vorbis audio stream losslessly into WebM.
It preserves compatible audio language and general metadata, scales video wider
than 640 pixels, and explicitly excludes unsupported additional streams and
chapters. The OGV-to-WAV route decodes the first Vorbis stream to PCM s16le and
discloses the excluded video stream.

Raw MPEG-2 elementary streams are inspected with FFmpeg's bounded stream-info
probe so sequence-header dimensions and frame rate are used instead of the raw
demuxer's generic defaults. The site converts their decoded YUV 4:2:0 frames to
either 2 Mbit/s MPEG-4 Part 2 MP4 or realtime 600 kbit/s VP8 WebM. Elementary
streams have no audio, chapters, attachments, or container metadata to carry.

Raw AAC/ADTS input uses FFmpeg's bounded AAC demuxer. The M4A route copies AAC
frames without re-encoding, removes the ADTS transport headers with
`aac_adtstoasc`, and writes equivalent elementary payload into fragmented M4A.
The WAV and FLAC routes genuinely decode AAC, resample to stereo PCM s16le, and
write bounded PCM or losslessly compressed decoded audio. Raw ADTS has no
container artwork, chapters, language tag, or general metadata to preserve.

Raw AMR input is limited to certified 8 kHz mono AMR-NB. The pinned FFmpeg
source build applies the audited `amr-bounded-packets.patch`, which replaces
partial raw packet reads with complete-frame batches capped at 32 KiB. This
prevents a frame from being split at a 256 KiB AVIO refill boundary and avoids
millions of tiny demux packets. PCM output is accumulated in fixed
8,192-sample FIFO batches; FLAC uses its codec frame size. Both outputs decode
to the same exact PCM SHA-256 as native FFmpeg. AMR-WB and AMR carried inside
3GP remain outside these two raw-AMR profiles.

AIFF PCM, Ogg Vorbis, and Ogg Opus can also be written as FLAC through the
same bounded decoder, resampler, FIFO, and direct-output callbacks. Signed
16-bit AIFF remains sample-exact. Vorbis and Opus cannot regain information
discarded by their source codecs, so their FLAC results are independently
checked against the decoded source with APSNR rather than byte-comparing the
compressed streams. Compatible text comments are copied; container-only chunks
and embedded artwork are explicitly outside these audio-only profiles.

## Non-media engines and limitations

Archive conversion never extracts an archive tree to memory or disk. TAR.GZ,
TAR.BZ2, and TAR.XZ routes validate each USTAR header while passing TAR bytes
through browser compression streams or fixed-memory codec modules. Raw BZIP2
and XZ decompression reject corrupt, truncated, concatenated, and trailing
streams; decompression routes enforce the 64 GiB and 100:1 expansion limits.
XZ streams requesting more than 32 MiB of decoder memory are rejected.
ZIP-to-TAR and ZIP-to-TAR.GZ read the bounded ZIP32
central directory, validate every local header, path, size, method, CRC-32, and
expansion limit, and inflate one entry at a time. The TAR.GZ destination feeds
those same validated USTAR chunks directly into an awaited GZIP stream.
TAR-to-ZIP reads one USTAR entry at a time. TAR.GZ-to-ZIP performs the same
parse directly over an incrementally decompressed source; neither route creates
an intermediate TAR. Both write DEFLATE data descriptors plus a bounded central
directory. All directions reject traversal, absolute and drive-letter paths,
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

ICO output uses those same bounded decoders, scales proportionally only when an
edge exceeds 256 pixels, and writes a standards-compliant one-entry icon header
followed by an incrementally copied PNG payload. It preserves alpha but does not
claim alternate icon sizes, animation, or metadata that the source cannot carry
through this bounded profile. Stable Chrome does not expose TIFF, ICO, SVG,
HEIC/HEIF, or JPEG XL through worker `ImageDecoder`, so those formats are not
advertised as inputs.

Subtitle and structured-data engines are incremental UTF-8 parsers with a
1 MiB cue/record/line ceiling. SRT, WebVTT, ASS, and TTML routes validate timing
and emit real destination syntax. TTML rejects DTDs and custom entities, accepts
clock/second/millisecond time expressions, and maps only basic italic, bold,
underline, and line-break styling. CSV/TSV quoting is parsed across chunk
boundaries; NDJSON and JSON-array routes preserve nested values but normalize
equivalent JSON whitespace and lexical forms. Direct CSV/TSV-to-JSON writes one
valid top-level array while retaining delimited values as strings. Direct
JSON-to-CSV/TSV requires object elements, fixes columns from the first object,
serializes nested values as JSON text inside one field, reports and ignores
later extra keys, and rejects scalar arrays. XML-to-NDJSON uses a strict
incremental XML 1.0 tokenizer and emits ordered document, declaration, element,
text, CDATA, comment, and processing-instruction events. It preserves qualified
names and namespace declarations lexically, rejects DTDs and custom/external
entities, and never creates a DOM. Column-shape and XML normalization limits are
disclosed.

Document routes are deliberately semantic rather than extension renames. TXT
is escaped into a complete preformatted HTML document. Markdown renders a
bounded documented subset and escapes raw HTML. HTML-to-TXT tokenizes the input,
decodes the supported entities, retains visible block/list/table text, and
removes scripts, styles, templates, metadata, layout, images, SVG/canvas, and
form controls. DOCX-to-TXT validates the complete ZIP package, content-type and
root-relationship metadata, then incrementally parses only the main
WordprocessingML document. It preserves paragraph order, tabs, breaks, Unicode,
and accepted tracked insertions while excluding tracked deletions. Formatting,
images, drawings, fields, comments, headers, footers, notes, hyperlinks, styles,
page layout, and table structure are explicitly disclosed as not representable
in plain text. Macro packages, unsafe paths, encryption, ZIP64, archive bombs,
DTDs, custom/external entities, oversized metadata, and malformed XML are
rejected. Unsupported Markdown extensions and HTML named entities produce clear
limitations or errors rather than silently invoking a server converter.

EPUB-to-TXT validates the required uncompressed first `mimetype` entry,
`META-INF/container.xml`, the OPF package manifest and linear spine, then
streams one XHTML reading-order resource at a time. Its strict incremental XML
tokenizer uses a compacted 256 KiB window rather than retaining a new remainder
string after every tag. Visible headings, paragraphs, lists, table cells, and
Unicode text are retained. Encrypted/obfuscated resources, unsafe references,
malformed XML, DTDs, external entities, and unsupported spine media types are
rejected; non-linear content and non-text presentation are explicitly omitted.

XLSX-to-CSV validates the OOXML content types, root relationship, workbook,
workbook relationships, and selected worksheet before emitting CSV. It parses
only the first visible worksheet and streams coordinate-aware rows directly to
one reusable 256 KiB output buffer; it never materializes the workbook or CSV
as a whole. Empty row/column gaps, numbers, Booleans, errors, inline strings,
Unicode, and bounded rich shared strings are retained. Stored formula results
are used without recalculation. Other sheets, styles, number-format rendering,
drawings, comments, hyperlinks, images, and print layout are disclosed as
omitted. Macro packages, unsafe references, encryption, ZIP64, archive bombs,
DTDs, custom entities, non-UTF-8 XML, and malformed package structures are
rejected.

PPTX-to-TXT validates the OOXML content types, root relationship, presentation,
presentation relationships, and every declared slide before extracting text.
It follows declared slide order, opens only one slide stream at a time, and
writes DrawingML runs through one reusable 256 KiB buffer. Paragraphs, tabs,
line breaks, Unicode, table-cell text, and hidden-slide text are retained;
hidden slides are disclosed. Themes, fonts, styling, positions, layouts,
transitions, animations, charts, diagrams, equations, images, media,
hyperlinks, comments, speaker notes, masters, and embedded objects are omitted.
Macro packages, unsafe references, encryption, ZIP64, archive bombs, DTDs,
custom entities, non-UTF-8 XML, and malformed package structures are rejected.

The OpenDocument routes require the exact uncompressed first `mimetype` entry,
validate the package manifest and root media type, and stream `content.xml`
through the same strict bounded XML tokenizer. ODT-to-TXT retains body paragraph,
heading, explicit-space, tab, line-break, Unicode, and table-cell text while
excluding annotations and tracked-change definitions. ODS-to-CSV emits only the
first visible sheet, expands bounded repeated rows and cells, and preserves
strings, numbers, Booleans, dates, times, and cached formula values without
recalculating formulas or rendering styles. ODP-to-TXT follows declared page
order, includes disclosed hidden-page text, and excludes notes and annotations.
All three reject encryption, macros/scripts, unsafe paths, ZIP64, archive bombs,
DTDs, custom entities, non-UTF-8 XML, and malformed package structures.

## Deliberately unsupported routes

Absence from the registry means unsupported; the app does not guess a route.
PDF is excluded by product scope. HEIC/HEIF, TIFF, ICO, JPEG XL, SVG, camera raw,
animated-image output, 7Z, and
additional legacy/proprietary media codecs are not published because this build
does not yet contain a bounded, auditable browser engine and independent
large-fixture evidence for them. Unsupported office and ebook files are not
flattened to plain text and called converted. ZIP64 and files requiring an
individual ZIP entry or completed ZIP above 4 GiB are rejected instead of
silently wrapping or truncating sizes.

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

## Reproducible Wasm builds

Pinned inputs:

- FFmpeg 8.1.2 official source archive, SHA-256
  `464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c`
- libvpx 1.16.0 official source archive, SHA-256
  `7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c`
- bzip2 1.0.8 official source archive, SHA-256
  `ab5a03176ee106d3f0fa90e381da478ddae405918153cca248e682cd0c4a2269`
- XZ Utils 5.8.3 official source archive, SHA-256
  `fff1ffcf2b0da84d308a14de513a1aa23d4e9aa3464d17e64b9714bfdd0bbfb6`
- `emscripten/emsdk:6.0.4-x64` image digest
  `sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b`

Build the auditable artifacts:

```powershell
npm ci
npm run build:ffmpeg-remux
npm run build:bzip2
npm run build:xz
npm run build
```

The Docker builds verify each source archive before compilation. Exact
configure switches and Emscripten flags are in `media/ffmpeg/` and
`compression/bzip2/` and `compression/xz/`. Generated settings are recorded in the corresponding
machine-readable manifests under `public/engines/`.

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
| MKV to WAV, 256 KiB direct coalescer | 1 | 2,958,573,265 B | 7,107,834,734 B | 186.7 MiB | 32 MiB | 9.0 MiB |
| MP3 to WAV, 256 KiB direct coalescer | 3 | 50,401,224 B | 201,600,128 B | 191.9 MiB | 32 MiB | 8.5-32.0 MiB |
| MKV → MP4 | 3 | 2,958,573,265 B | 2,962,151,522 B | 173.8 MiB | 52.6 MiB | −16.8–31.9 MiB |
| MKV → MP4, 1 MiB shared direct writer | 3 | 2,958,573,265 B | 2,962,151,522 B | 247.5 MiB | 53.6 MiB | 13.8–17.0 MiB |
| MKV → M4A | 3 | 2,958,573,265 B | 249,427,974 B | 164.7 MiB | 32 MiB | −1.1–0.9 MiB |
| MP4 → M4A | 3 | 2,964,855,971 B | 249,427,976 B | 203.3 MiB | 73.8 MiB | −4.0–−0.6 MiB |
| MKV → WAV | 3 | 2,958,573,265 B | 7,107,834,734 B | 178.0 MiB | 32 MiB | −7.2–−4.3 MiB |
| MP4 → WAV | 3 | 2,964,855,971 B | 7,107,834,950 B | 224.1 MiB | 73.8 MiB | −8.1–−4.8 MiB |
| MKV → MPEG-4 MP4 | 3 | 2,958,573,265 B | 3,086,358,463 B | 211.3 MiB | 89.6 MiB | −1.0–7.1 MiB |
| MKV → WebM | 3 | 2,958,573,265 B | 921,524,214 B | 208.8 MiB | 80 MiB | 0.7–6.0 MiB |
| MKV → MP4 scale | 1 clean session | 10,737,988,703 B | 10,746,764,426 B | 182.4 MiB | 49.4 MiB | −11.1 MiB |
| MOV → MP4 | 3 | 149,251,969 B | 149,087,892 B | 168.2 MiB | 40 MiB | 13.1–17.4 MiB |
| MOV → M4A | 3 | 149,251,969 B | 14,557,639 B | 164.5 MiB | 32 MiB | 7.2–15.3 MiB |
| MOV → WAV | 3 | 149,251,969 B | 414,733,404 B | 195.3 MiB | 32 MiB | 2.8–36.0 MiB |
| 3GP → MP4 | 3 | 167,130,850 B | 167,156,758 B | 209.6 MiB | 32 MiB | 9.4–28.4 MiB |
| 3GP → M4A | 3 | 167,130,850 B | 11,539,835 B | 204.8 MiB | 32 MiB | 26.0–27.1 MiB |
| 3GP → WAV | 3 | 167,130,850 B | 69,130,350 B | 193.7 MiB | 32 MiB | 11.6–34.6 MiB |
| MPEG-TS → MP4 | 3 | 175,444,796 B | 167,139,361 B | 215.6 MiB | 56 MiB | 11.5–26.0 MiB |
| MPEG-TS → M4A | 3 | 175,444,796 B | 11,455,964 B | 220.2 MiB | 56 MiB | 32.9–42.4 MiB |
| MPEG-TS → WAV | 3 | 175,444,796 B | 68,776,014 B | 243.7 MiB | 56 MiB | 8.9–37.5 MiB |
| FLV → MP4 | 3 | 167,517,193 B | 167,091,007 B | 193.1 MiB | 32 MiB | 17.2–29.8 MiB |
| FLV → M4A | 3 | 167,517,193 B | 11,456,012 B | 213.2 MiB | 32 MiB | 20.3–27.2 MiB |
| FLV → WAV | 3 | 167,517,193 B | 68,776,058 B | 192.4 MiB | 32 MiB | 13.0–29.0 MiB |
| AVI → MP4 | 3 | 230,929,466 B | 229,960,974 B | 199.4 MiB | 32 MiB | 13.3–29.1 MiB |
| AVI → WAV | 3 | 230,929,466 B | 68,954,218 B | 225.1 MiB | 32 MiB | 15.1–40.0 MiB |
| OGV → WebM | 3 | 137,778,644 B | 61,043,196 B | 199.4 MiB | 32 MiB | 1.2–6.8 MiB |
| OGV → WAV | 3 | 137,635,308 B | 74,880,078 B | 204.9 MiB | 32 MiB | 12.4–31.6 MiB |
| M2V → MPEG-4 MP4 | 3 | 136,166,136 B | 124,300,753 B | 177.1 MiB | 32 MiB | 1.1–8.3 MiB |
| M2V → VP8 WebM | 3 | 136,166,136 B | 37,835,173 B | 163.9 MiB | 32 MiB | 2.6–6.8 MiB |
| AAC → M4A | 3 | 134,367,785 B | 133,906,114 B | 179.8 MiB | 32 MiB | 0.2–16.3 MiB |
| AAC → WAV | 3 | 134,367,785 B | 770,273,358 B | 186.5 MiB | 32 MiB | −3.1–−0.7 MiB |
| AAC → FLAC | 3 | 134,367,785 B | 114,800,971 B | 167.1 MiB | 32 MiB | −6.7–−0.8 MiB |
| ALAC M4A → WAV | 3 | 140,941,469 B | 153,600,128 B | 227.1 MiB | 32 MiB | 12.0–28.9 MiB |
| ALAC M4A → FLAC, fresh-session repeat | 3 | 140,941,469 B | 138,185,793 B | 230.4 MiB | 32 MiB | 9.5–38.7 MiB |
| WAV → ALAC M4A | 3 | 153,600,106 B | 140,941,506 B | 200.2 MiB | 32 MiB | 13.5–40.0 MiB |
| FLAC → ALAC M4A | 3 | 138,185,686 B | 140,941,506 B | 199.1 MiB | 32 MiB | 11.8–43.8 MiB |
| WMA2 → WAV | 3 | 142,503,082 B | 364,798,078 B | 190.7 MiB | 32 MiB | 4.5–34.3 MiB |
| WMA2 → FLAC | 3 | 142,503,082 B | 326,238,814 B | 191.2 MiB | 32 MiB | −0.6–4.7 MiB |
| WAV → WMA2 | 3 | 153,600,104 B | 60,000,756 B | 150.2 MiB | 32 MiB | 5.8–41.4 MiB |
| FLAC → WMA2 | 3 | 138,186,536 B | 60,000,756 B | 159.9 MiB | 32 MiB | 0.8–5.1 MiB |
| AMR-NB to WAV | 3 | 134,229,414 B | 1,342,294,158 B | 209.7 MiB | 32 MiB | cleanup passed |
| AMR-NB to FLAC | 3 | 134,229,414 B | 760,765,211 B | 166.0 MiB | 32 MiB | cleanup passed |
| AIFF PCM to FLAC | 3 | 220,800,108 B | 32,365,732 B | 207.2 MiB | 32 MiB | read 262,144 B / write 8,344 B |
| Ogg Vorbis to FLAC | 3 | 144,431,506 B | 397,265,921 B | 198.4 MiB | 32 MiB | read 262,144 B / write 16,617 B |
| Ogg Opus to FLAC | 3 | 147,964,541 B | 386,531,887 B | 194.4 MiB | 32 MiB | read 262,144 B / write 16,213 B |
| GZIP compress | 1 | 256 MiB | streamed | 172.4 MiB | 0 | <= 53.6 MiB |
| GZIP decompress | 1 | 256.1 MiB | streamed | 145.0 MiB | 0 | <= 33.2 MiB |
| BZIP2 compress | 3 | 268,435,456 B | 270,593,081 B | 139.2 MiB | 8 MiB | cleanup passed |
| BZIP2 decompress | 3 | 270,593,081 B | 268,435,456 B | 140.4 MiB | 8 MiB | cleanup passed |
| TAR -> TAR.BZ2 | 3 | 268,436,992 B | 270,592,763 B | 136.6 MiB | 8 MiB | cleanup passed |
| TAR.BZ2 -> TAR | 3 | 270,592,763 B | 268,436,992 B | 137.0 MiB | 8 MiB | cleanup passed |
| XZ compress | 3 | 268,435,456 B | 268,448,840 B | 172.7 MiB | 48 MiB | cleanup passed |
| XZ decompress | 3 | 268,448,840 B | 268,435,456 B | 203.0 MiB | 48 MiB | cleanup passed |
| TAR -> TAR.XZ | 3 | 268,436,992 B | 268,449,796 B | 175.0 MiB | 48 MiB | cleanup passed |
| TAR.XZ -> TAR | 3 | 268,449,796 B | 268,436,992 B | 173.7 MiB | 48 MiB | cleanup passed |

The optimized level-1 BZIP2 encoder completed its 256 MiB-class runs in
38.94-39.85 seconds; decompression completed in 23.50-23.94 seconds. All four
profiles held reads to 262,144 bytes, writes and queued bytes to 65,536, one
pending operation, one conversion worker, and 8 MiB of Wasm memory. Python's
independent standard-library decoder verified compressed output bytes and
SHA-256; raw/TAR outputs were streamed to exact SHA-256 checks. The category
runner then removed every large source, browser output, and Chrome profile.

The preset-0 XZ encoder completed its 256 MiB-class runs in 51.51-56.84
seconds; XZ decompression completed in 6.21-6.98 seconds. Every run held reads
to 262,144 bytes, writes and queued bytes to 65,536, one pending operation, one
conversion worker, and 48 MiB of Wasm memory. Python's independent standard
library decoded compressed results and checked exact bytes and SHA-256. Stress
fixture preparation compresses the independent raw and TAR references in
parallel; the production conversion itself remains one bounded job.

Representative three-run category peaks from the same full-process-tree
profiler:

| Category/profile | Source | Worst incremental private memory | Output validation |
| --- | ---: | ---: | --- |
| Images, BMP -> WebP | 24,883,254 B | 239.6 MiB | native decode, dimensions, alpha/fidelity |
| Images, BMP -> ICO | 24,883,254 B | 86.3 MiB | native ICO/PNG decode, dimensions, SSIM |
| Audio, MP3 -> WAV | 50,401,224 B | 247.6 MiB | full decode and APSNR |
| Records, JSON -> NDJSON | 293,633,883 B | 229.3 MiB | independent streamed hash/parse |
| Records, CSV -> JSON | 134,423,894 B | 204.5 MiB | exact streamed output hash/parse |
| Records, TSV -> JSON | 134,423,894 B | 194.1 MiB | exact streamed output hash/parse |
| Records, JSON -> CSV | 293,633,883 B | 185.8 MiB | exact streamed output hash/parse |
| Records, JSON -> TSV | 293,633,883 B | 212.1 MiB | exact streamed output hash/parse |
| Records, XML -> NDJSON events | 134,218,700 B | 165.1 MiB | independent streamed hash/parse |
| Archives, TAR -> TAR.GZ | 268,436,992 B | 219.3 MiB | full TAR validation |
| Compression, bytes -> BZIP2 | 268,435,456 B | 139.2 MiB | independent Python BZIP2 decode and SHA-256 |
| Compression, BZIP2 -> bytes | 270,593,081 B | 140.4 MiB | exact streamed output SHA-256 |
| Archives, TAR -> TAR.BZ2 | 268,436,992 B | 136.6 MiB | streamed USTAR validation plus independent BZIP2 decode/SHA-256 |
| Archives, TAR.BZ2 -> TAR | 270,592,763 B | 137.0 MiB | streamed USTAR validation and exact SHA-256 |
| Compression, bytes -> XZ | 268,435,456 B | 172.7 MiB | independent Python LZMA decode and SHA-256 |
| Compression, XZ -> bytes | 268,448,840 B | 203.0 MiB | exact streamed output SHA-256 |
| Archives, TAR -> TAR.XZ | 268,436,992 B | 175.0 MiB | streamed USTAR validation plus independent Python LZMA decode/SHA-256 |
| Archives, TAR.XZ -> TAR | 268,449,796 B | 173.7 MiB | streamed USTAR validation and exact SHA-256 |
| Archives, ZIP -> TAR | 268,517,517 B | 194.4 MiB | libarchive entry size/SHA-256 |
| Archives, ZIP -> TAR.GZ | 268,517,517 B | 194.5 MiB | libarchive entry size/SHA-256 |
| Archives, TAR.GZ -> ZIP | 268,517,551 B | 201.1 MiB | libarchive entry size/SHA-256 |
| Subtitles, WebVTT -> TTML | 73,788,904 B | 204.5 MiB | exact streamed output hash |
| Documents, HTML -> TXT | 143,850,123 B | 231.6 MiB | exact streamed output hash |
| Documents, DOCX -> TXT | 134,218,659 B | 217.9 MiB | exact streamed output hash |
| Ebooks, EPUB -> TXT | 134,219,595 B | 205.5 MiB | exact streamed output hash |
| Spreadsheets, XLSX -> CSV | 135,267,834 B | 218.4 MiB | exact streamed output hash |
| Presentations, PPTX -> TXT | 135,296,355 B | 217.4 MiB | exact streamed output hash |
| Documents, ODT -> TXT | 135,267,233 B | 191.1 MiB | exact streamed output hash |
| Spreadsheets, ODS -> CSV | 135,267,401 B | 196.2 MiB | exact streamed output hash |
| Presentations, ODP -> TXT | 135,272,481 B | 199.1 MiB | exact streamed output hash |
| Video, MOV -> MP4 | 149,251,969 B | 168.2 MiB | native packet traversal and HEVC/AAC probe |
| Audio, MOV -> M4A | 149,251,969 B | 164.5 MiB | full AAC decode and metadata probe |
| Audio, MOV -> WAV | 149,251,969 B | 195.3 MiB | full PCM decode and APSNR |
| Video, 3GP -> MP4 | 167,130,850 B | 209.6 MiB | native packet traversal and H.264/AAC probe |
| Audio, 3GP -> M4A | 167,130,850 B | 204.8 MiB | full AAC decode and metadata probe |
| Audio, 3GP -> WAV | 167,130,850 B | 193.7 MiB | full PCM decode and APSNR |
| Video, MPEG-TS -> MP4 | 175,444,796 B | 215.6 MiB | native packet traversal and H.264/AAC probe |
| Audio, MPEG-TS -> M4A | 175,444,796 B | 220.2 MiB | full AAC decode and metadata probe |
| Audio, MPEG-TS -> WAV | 175,444,796 B | 243.7 MiB | full PCM decode and APSNR |
| Video, FLV -> MP4 | 167,517,193 B | 193.1 MiB | native packet traversal and H.264/AAC probe |
| Audio, FLV -> M4A | 167,517,193 B | 213.2 MiB | full AAC decode and metadata probe |
| Audio, FLV -> WAV | 167,517,193 B | 192.4 MiB | full PCM decode and APSNR |
| Video, AVI -> MP4 | 230,929,466 B | 199.4 MiB | native packet traversal and MPEG-4 Part 2/MP3 probe |
| Audio, AVI -> WAV | 230,929,466 B | 225.1 MiB | full PCM decode and APSNR |

The MPEG-TS stress source is a genuine 175,444,796-byte H.264/AAC transport
stream. With the synchronous bounded worker reader, MP4 stream copy completed in
2.14-2.42 seconds, M4A extraction in 1.51-1.69 seconds, and full AAC-to-PCM WAV
conversion in 4.21-4.81 seconds. Every read remained at or below 262,144 bytes;
the complete input and output were never mirrored into JavaScript or MEMFS.

The 3GP stress source is a genuine 167,130,850-byte H.264/AAC 3GPP file.
3GP-to-MP4 completed in 1.66-1.93 seconds, 3GP-to-M4A in 1.12-1.50 seconds,
and 3GP-to-WAV in 3.66-3.91 seconds. All nine runs produced byte-identical
outputs per route, stayed inside the 262,144-byte I/O bound, passed native
packet traversal or full audio validation, and deleted the large generated 3GP
and converted copies after measurement.

The FLV stress source is a genuine 167,517,193-byte H.264/AAC Flash Video file.
FLV-to-MP4 completed in 1.64-1.85 seconds, FLV-to-M4A in 1.16-1.42 seconds,
and FLV-to-WAV in 3.44-3.93 seconds. All nine runs retained the 262,144-byte
read/write bound, passed native packet or decode validation, and deleted the
generated source and outputs after measurement.

The AVI stress source is a genuine 230,929,466-byte MPEG-4 Part 2/MP3 file.
AVI-to-MP4 completed in 2.11-2.44 seconds by copying packets without re-encoding;
AVI-to-WAV completed in 3.97-4.30 seconds. All six runs stayed within the
262,144-byte I/O bound, produced byte-identical outputs per route, passed native
packet traversal or full decoded-audio APSNR validation, and deleted the large
generated AVI and converted copies after measurement.

The raw AAC stress source is a genuine 134,367,785-byte, 4,011.84-second AAC-LC
ADTS stream. AAC-to-M4A completed in 1.81-2.23 seconds with an exact elementary
packet SHA-256 match after removing ADTS framing. AAC-to-WAV completed in
19.20-19.62 seconds and AAC-to-FLAC in 22.02-22.50 seconds; both decoded-audio
comparisons measured 154.165 dB APSNR per channel. Every run kept reads at or
below 262,144 bytes, held at most one queued write, and the category cleanup
deleted the generated stress source and every converted copy.

The ALAC gate used one shared, deterministic 800-second stereo PCM reference.
Its ALAC M4A, FLAC, and WAV sources were respectively 140,941,469 bytes,
138,185,686 bytes, and 153,600,106 bytes. ALAC-to-WAV completed in 5.11-5.39
seconds, ALAC-to-FLAC in 7.43-7.84 seconds, WAV-to-ALAC in 6.14-6.58 seconds,
and FLAC-to-ALAC in 7.52-7.73 seconds. Every result decoded to the same exact
PCM SHA-256, `0a7c4781b220b2d06fc42201618bdce6ea12ccce9fd6ed570de999baafe4e7ff`.
The ALAC encoder fixes prediction order at four to reduce compute while
remaining lossless, fragments M4A for bounded incremental writing, and keeps a
single write of at most 262,144 bytes queued. The near-limit ALAC-to-FLAC route
also passed three additional runs in a fresh Chrome process tree at 230.4 MiB.
Cleanup deleted all three large sources and every converted copy.

The WMA gate used a genuine 142,503,082-byte, 1,900-second WMA2 source plus
153,600,104-byte WAV and 138,186,536-byte FLAC sources. WMA-to-WAV completed
in 7.95-8.20 seconds and WMA-to-FLAC in 12.91-13.56 seconds. WAV-to-WMA2
completed in 11.72-11.98 seconds and FLAC-to-WMA2 in 13.07-13.37 seconds,
using a fixed 320 kbit/s, 48 kHz encoder configuration that preserves mono or
stereo and downmixes larger layouts to stereo. Independent full-decode APSNR
validation passed for every result. All reads stayed at or below 262,144 bytes;
WMA output writes were at most 3,200 bytes, and one write was pending at a
time. Cleanup deleted the three large sources and every converted copy.

The AMR gate used a genuine 134,229,414-byte raw AMR-NB source containing
4,194,669 frames (83,893.38 seconds of decoded audio). AMR-to-WAV completed in
61.54-62.01 seconds and produced 1,342,294,158 bytes; AMR-to-FLAC completed in
124.23-126.93 seconds and produced 760,765,211 bytes. Worst complete-Chrome
incremental private memory was 209.7 MiB for WAV and 166.0 MiB for FLAC. Every
run matched the manifest's exact decoded-PCM SHA-256, kept reads at or below
262,144 bytes, held at most one write, and passed cleanup recovery.

The expanded FLAC-input gate used genuine 2,300-second sources: a
220,800,108-byte PCM AIFF, a 144,431,506-byte Ogg Vorbis stream, and a
147,964,541-byte Ogg Opus stream. AIFF-to-FLAC completed in 6.06-7.02 seconds,
Ogg-to-FLAC in 15.35-15.46 seconds, and Opus-to-FLAC in 25.55-26.09 seconds.
Worst complete-Chrome incremental private memory was respectively 207.2,
198.4, and 194.4 MiB. AIFF matched the exact decoded-PCM SHA-256; both lossy
inputs passed full decoded-audio APSNR validation. Every run kept Wasm at
32 MiB, bounded reads to 262,144 bytes, held one write at a time, produced a
repeatable output hash, and returned near the loaded idle baseline after
cleanup. The category runner then deleted all three sources and outputs.

The direct delimited/JSON profiles processed 5,490,000 records with one
262,144-byte write in flight. CSV-to-JSON took 18.76-19.14 seconds and
TSV-to-JSON took 18.32-19.93 seconds; both produced the same 299,123,885-byte
JSON array with SHA-256
`d199fc95a7b8093b519d7accc3ff48c4a0b6c59f787f4d46f720d7d15eea33d8`.
JSON-to-CSV took 24.37-25.13 seconds and produced a 139,913,895-byte output
with SHA-256
`6cd8761b2f7c747f19ee5d731a557b7287248524c21fddb73654e54b3b0e67a4`.
JSON-to-TSV took 24.43-24.94 seconds at the same output size with SHA-256
`8a168a9ae550b3e41046d2711be04fa108613d39766879c58ce47927e9d44f96`.
Each three-run category generated only its required source inside this
repository and removed that source, every converted output, and its browser
profile after validation.

The QuickTime category used one genuine 149,251,969-byte `qt  ` MOV source for
all nine runs. MOV-to-MP4 completed in 0.87-1.13 seconds, MOV-to-M4A in
0.42-0.69 seconds, and MOV-to-WAV in 9.31-9.77 seconds. Each route produced a
byte-identical SHA-256 across its three runs, kept one write pending with no
more than 262,144 bytes queued, and passed native probing plus full packet or
decode validation. The runner then removed the MOV source, converted outputs,
and browser profiles while retaining only compact reports and the source
manifest.

The DOCX profile produced the same 90,834,111-byte SHA-256
`876c08b205daafe39dd7681d819a69d177262377b345e9144bb82df09025333e`
in all three runs. Conversion took 6.07-6.20 seconds with one 262,144-byte
write in flight; each generated source, converted output, and browser profile
was removed by the category runner after validation.

The optimized EPUB tokenizer produced the same 123,185,664-byte SHA-256
`b9af589a4c25e80cf5139151f9650284e3977968107087b838686ca887d8ca3e`
in all three runs. Conversion took 6.89-6.94 seconds with one 262,144-byte
write in flight. The final worst result was 205.5 MiB after a pre-optimization
run exposed and rejected a 254.3 MiB peak; all generated EPUBs, outputs, and
browser profiles were removed after each profiling session.

The XLSX profile streamed an 812,639-row, 135,267,834-byte workbook to the same
55,148,347-byte SHA-256
`36ec9079f8e98eaf6a64907b2e90c092b465332c8fd0670c0666e08878dfa8f9`
in all three runs. Conversion took 14.67-15.26 seconds with one 262,144-byte
write in flight. The generator emits the large worksheet directly into its ZIP,
the worker emits CSV directly to the destination, and the category runner
removed the generated workbook, converted outputs, and browser profile after
validation.

The PPTX profile streamed 128 slide parts containing 1,339,008 paragraphs from
a 135,296,355-byte presentation to the same 92,391,679-byte SHA-256
`2c32bb680e8ce5d7917ba180829a39b8b9431fc0b460ad5e62776db4bb51bff5`
in all three runs. Conversion took 10.50-10.93 seconds with one 262,144-byte
write in flight and a 217.4 MiB worst process-tree result. The runner removed
the generated presentation, converted outputs, and browser profile after
validation.

The OpenDocument profiles kept one 262,144-byte write in flight and produced
byte-identical results in every run. ODT converted to a 108,212,672-byte TXT
with SHA-256
`143b28eff766ba5468a54a7695eaece6ee13565f25c41d33b99052f8111b487d`
in 10.38-10.90 seconds. ODS converted to a 37,117,581-byte CSV with SHA-256
`9efff69354574231912bd1218ebc414d694fc4075fcb617faa970d830ddd55ea`
in 8.61-8.67 seconds. ODP converted to a 109,181,183-byte TXT with SHA-256
`4356ce436790659471e1a0a2624affaba48afe003bb38b0b5b8c0359bf797c03`
in 10.34-10.56 seconds. The category runner generated only one large package at
a time inside this repository and removed every generated source, converted
output, and browser profile after validation.

The three MP4 outputs shared SHA-256
`aff831693c020c02a0163e25d0f08a7529d0fb0e4022f0cb984c60d90348334a`
and completed in 9.3–16.2 seconds with the compatibility-gated Wasm build.
The 1 MiB shared direct-writer runs produced the same byte-identical hash in
17.42, 22.26, and 23.30 seconds, compared with the prior 256 KiB direct-write
baseline of 33.00 seconds. The slowest optimized run is 29.4% faster and the
mean is 36.4% faster. The bounded path uses one fixed shared payload, one private
writer copy, one write in flight, a persistent stream writer, and a second
worker. Each project-local validation output was deleted after native probing;
the report records `destinationMode: "direct-handle"` separately from
synchronous OPFS evidence.
The three M4A outputs shared SHA-256
`334d44f28c7eefc4c2393b32db991c886c32444254868b1e4c602252f40f8a38`.
The three MP4-to-M4A outputs shared SHA-256
`1efb42d762b766f67f70471a6e2b628aedf8a0e183293aff824226ae83c669a1`,
completed in 2.58–2.89 seconds, retained Hindi 5.1 AAC, and passed full native
decode.
The three WAV outputs shared SHA-256
`659d36eac2310b7d20d8c694a8eafb11760061def608a9241a64913fc003e1eb`.
The 256 KiB direct coalescer produced that same 7,107,834,734-byte WAV from
`test.mkv` in 126.14 seconds, 19.5% faster than the prior fastest 156.72-second
bounded run, while peaking at 186.7 MiB incremental private memory. On the
50,401,224-byte MP3 stress source, the uncoalesced direct baseline took 65.22
seconds. Three optimized runs took 3.36-3.60 seconds (18.1-19.4x faster),
produced the same 201,600,128-byte output and SHA-256
`b32ef83ee6cf931c48f0430696a39ebab4b96eb950262c593ec0ad959e4288b3`,
kept one pending write and at most 260,574 queued bytes, and peaked at 191.9
MiB. Independent probes and full native decodes passed for the WAV, M4A, and
FLAC direct-save paths; injected write failure discarded the partial WAV.
The three MP4-to-WAV outputs shared SHA-256
`d489b3567851a1f2bace1a8a9915bd52f6d819daa7c1ec8674af951e1330887a`,
completed in 93.11–93.94 seconds, retained 48 kHz 5.1 audio as PCM s16le,
and passed full decoded-audio APSNR at 153.7 dB or better on every channel.
The three MPEG-4 Part 2 outputs shared SHA-256
`457f9da69f4234f2ee39c6103ef597b4b735ba90de34d4d124f1d1fe55326e42`,
completed in 3,091.2–3,096.1 seconds, passed full native decode at 1920×804,
and produced midpoint SSIM 0.991884. On the fixed 120-second fixture, the final
two-thread/four-worker specialist core completed in 27.20 seconds versus 59.59
seconds for the prior single-thread core, a 2.19× speedup without changing the
2 Mbit/s encode or dimensions. Four codec threads reached 16.64 seconds but
failed at 266.4 MiB; three reached 19.39 seconds but failed at 254.2 MiB. The
published topology therefore preserves most of the throughput gain with a
measured 204.5–206.9 MiB benchmark range and 211.3 MiB full-file peak.
The three WebM outputs shared SHA-256
`b192fb8b0cb3e4356b54ed242d0de5fbeb6a56f421381c426ca19321e0807e1f`;
they completed in 2,682.0–2,687.1 seconds, passed full native decode as VP8,
and produced a midpoint SSIM of 0.967634. A fixed 120-second benchmark improved
from 122.48 seconds on the old single-thread artifact to 26.29–27.44 seconds on
the final four-thread artifact while remaining below the same memory ceiling.
On the same controlled fixture, five codec threads took 26.608 seconds versus
26.820 seconds for four (a noise-level 0.8% change), while six took 26.769
seconds and produced a 267.3 MiB process-tree sample. Higher realtime
`cpu-used` values and fast-bilinear scaling produced byte-identical output with
no meaningful gain. The production core therefore keeps the faster proven
four-thread topology instead of adding workers or weakening quality for a
placebo improvement.
`npm run clean:benchmark-artifacts` removes that fixed project-local 120-second
fixture and its Chrome profile without deleting the compact measurements.
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
npm run profile:bzip2
npm run profile:xz
npm run profile:documents
npm run profile:ebooks
npm run profile:mov
npm run profile:mpeg-ts
npm run profile:flv
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
- `workers/` — bounded media, compression, archive, subtitle, image, record, XML, ebook, and document
  transforms; FFmpeg bridge, destinations, and lifecycle
- `media/ffmpeg/`, `compression/bzip2/`, and `compression/xz/` — reproducible native Wasm builds
- `public/engines/` — auditable generated engine artifacts
- `scripts/` — fixtures, validators, cleanup, process-tree memory reports
- `tests/browser/` — correctness, privacy, offline, and bounded-I/O tests
- `worker/` — production security headers and static application handler

## Licensing

Application code is project-owned. FFmpeg licensing depends on the exact
configured components; this build excludes GPL/nonfree switches. libvpx is
BSD-3-Clause licensed, bzip2 carries its permissive upstream license, and the
linked liblzma core is 0BSD.
Deployers must still review FFmpeg's LGPL terms, the
bundled third-party notices, and any codec patent obligations applicable to
their jurisdiction and distribution model.

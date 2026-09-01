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
complete-Chromium memory profile have passed. The current registry publishes 388
routes:

| Category | Verified routes | Largest tested source |
| --- | --- | ---: |
| Compression | bytes -> GZIP/BZIP2/XZ; GZIP/BZIP2/XZ -> bytes | 270,593,081 B |
| Archives | TAR -> TAR.GZ/TAR.BZ2/TAR.XZ; TAR.GZ/TAR.BZ2/TAR.XZ -> TAR; ZIP -> TAR/TAR.GZ; TAR/TAR.GZ -> ZIP | 270,592,763 B |
| Subtitles | SRT <-> WebVTT; SRT/WebVTT -> ASS/TTML; ASS/TTML -> SRT/WebVTT | 101,393,068 B |
| Documents | TXT -> DOCX, ODT, or safe preformatted HTML; DOCX/ODT -> visible TXT; Markdown -> HTML; HTML -> visible TXT | 143,850,123 B |
| Ebooks | TXT/Markdown -> valid reflowable EPUB; EPUB -> spine-ordered visible TXT | 141,110,000 B |
| Spreadsheets | XLSX/ODS -> first-visible-sheet CSV | 135,267,834 B |
| Presentations | PPTX/ODP -> slide/page-ordered TXT | 135,296,355 B |
| Structured data | CSV <-> TSV; CSV/TSV <-> JSON/NDJSON; NDJSON <-> JSON; XML -> NDJSON | 293,633,883 B |
| Images | PNG/APNG/JPEG/WebP/GIF/AVIF/BMP to implemented PNG/JPEG/WebP/BMP/ICO/JPEG XL destinations; PNG/APNG/JPEG/WebP/GIF/BMP to AVIF; animated GIF or WebP to APNG; animated PNG/APNG or WebP to GIF; animated PNG/APNG or GIF to WebP; animated PNG/APNG, GIF, WebP, AVIF, or JPEG XL to all-frame PNG ZIP; JPEG XL to PNG; TIFF to PNG or multipage PNG ZIP | 50,374,456 B |
| Video/container | MP4/MOV/3GP/MPEG-TS/FLV/AVI/WebM/OGV -> lossless-copy MKV for certified codec sets; MKV/MP4/MOV/MPEG-TS -> raw HEVC for certified HEVC video; MKV/MP4/MOV/AVI/MPEG-TS -> raw MPEG-2 M2V for certified MPEG-2 video; raw M2V -> MPEG-TS; MKV/MP4/MOV/AVI -> raw MPEG-4 Part 2 M4V; raw M4V -> MP4; AV1/Opus MKV -> lossless-copy WebM; MKV/MP4/MOV/AVI/MPEG-TS/FLV -> lossless-copy MP3 when the source contains MP3 audio; MKV/MP4/MOV/3GP/MPEG-TS/FLV -> raw AAC when the source contains AAC audio; MKV/WebM/OGV -> Ogg Vorbis when the source contains Vorbis audio; MKV/WebM -> Ogg Opus when the source contains Opus audio; 3GP/AMR-NB -> lossless-copy raw AMR-NB; MKV/MP4/MOV/3GP/MPEG-TS/FLV with AAC, AVI with MP3, OGV with Vorbis, and WebM with Opus -> WMA2 or signed 16-bit AIFF; certified MKV/MP4/MOV/MPEG-TS/FLV with AAC and AVI with MP3 -> AMR-NB; certified AVI/MP3, OGV/Vorbis, and WebM/Opus -> fragmented AAC-LC M4A; certified WebM/Opus also -> signed 16-bit WAV, FLAC, AMR-NB, MP3, or raw AAC-LC; MKV -> MP4/MPEG-4 MP4/M4A/WAV/FLAC/H.264/VP8 or VP9 WebM; MP4/MOV -> M4A/WAV/FLAC/H.264/VP8 or VP9 WebM (MOV also to MP4); 3GP/MPEG-TS/FLV -> MP4/M4A/WAV/FLAC/H.264; AVI -> MP4/WAV/FLAC; OGV -> VP8 or VP9 WebM/WAV/FLAC; raw H.264 -> MP4/VP8 or VP9 WebM; MPEG-2 M2V -> MPEG-4 MP4/VP8 or VP9 WebM | 10,737,988,703 B |
| Standalone audio | AAC -> M4A/WAV/FLAC/AIFF/AMR-NB/MP3/Opus/Ogg Vorbis/WMA2; raw AMR-NB -> WAV/FLAC/AIFF/MP3/AAC/Opus/Ogg Vorbis; AMR-WB in `.awb` -> WAV/FLAC/AIFF/MP3/AAC/Opus/Ogg Vorbis/WMA2; 3GP with AMR-NB -> WAV/FLAC/AIFF/MP3/Opus/Ogg Vorbis; M4A (AAC/ALAC), MP3, FLAC, WMA, OGG, or Opus -> WAV/FLAC/AIFF/AMR-NB/MP3/AAC where applicable; M4A (AAC/ALAC), AAC, AMR-WB, MP3, AIFF, Ogg Vorbis, or Ogg Opus -> WMA2; M4A (AAC/ALAC), AAC, AMR-NB, MP3, FLAC, WAV, WMA, AIFF, or Ogg Opus -> Ogg Vorbis; M4A (AAC/ALAC), MP3, FLAC, WMA, OGG Vorbis -> Opus; WAV -> FLAC/AIFF/AMR-NB/MP3/AAC/Opus/ALAC M4A/WMA2; FLAC -> WAV/AIFF/AMR-NB/MP3/AAC/Opus/ALAC M4A/WMA2; AIFF -> WAV/FLAC/AMR-NB/MP3/AAC/Opus/WMA2 | 220,800,108 B |

The video matrix also includes measured H.264/AAC packet-copy routes among the
published MKV, MP4, MOV, 3GP, MPEG-TS, and FLV pairs. These routes avoid
decode/re-encode work, use bounded direct destination writes, and explicitly
disclose container-specific metadata or stream exclusions.

Measured audio extraction also converts AAC in MP4, MOV, MPEG-TS, or FLV and
MP3 in AVI to Opus or Ogg Vorbis. Vorbis in OGV converts to Opus or MP3. These
lossy routes use the same fastest quality-certified encoders as standalone
audio, exclude video and unsupported container metadata explicitly, and remain
bounded by one direct destination operation.

OGV/Vorbis to AMR-NB is explicitly unsupported and absent from the selector:
its retained 137,218,662-byte quality run measured -3.58873 dB ASDR against the
unchanged -3 dB floor. The floor was not weakened to advertise the route.

The registry records the exact tested size and limitations for every individual
route; the UI exposes that same evidence. VP8 WebM and MPEG-4 Part 2 MP4 are
public after passing their three-run gates on the untouched
2,958,573,265-byte fixture. The app never substitutes an extension rename or a
server conversion. Separate VP9 WebM routes passed three-run gates on genuine
181,825,549-byte MKV, 147,136,625-byte MP4, 147,136,647-byte MOV,
137,635,308-byte OGV, and 136,166,136-byte M2V sources.

The living [tested conversion ledger](TESTED.md) lists every public passed
profile, retained Chrome stress evidence, exact I/O bounds, cleanup status, and
explicit remaining gaps. Regenerate it after profiling with
`npm run tested:ledger`.

## Bounded-memory architecture

```text
Browser File
  -> bounded worker slice/BYOB reader (<= 256 KiB)
  -> dedicated conversion worker
  -> custom FFmpeg AVIOContext / streaming transform
  -> one positional write in flight (normally <= 256 KiB;
     direct MKV-to-MP4 specialist <= 1 MiB)
  -> user-selected destination
```

Media conversion uses FFmpeg libraries directly through
`media/ffmpeg/within_remux.c`; it does not run the FFmpeg CLI and does not use
MEMFS for large input or output.

For sequential reads, a persistent BYOB byte-stream buffer is reused. Direct
AAC, Ogg Vorbis, and Ogg Opus extraction always uses this reusable path so a
large source never creates a second source-sized synchronous Blob allocation. A genuine
FFmpeg seek cancels that reader and opens a new bounded stream at the requested
offset. Bytes are copied once from the browser-owned BYOB view into FFmpeg's
256 KiB AVIO input buffer. FFmpeg's ordinary output callbacks expose at most
256 KiB. The direct MKV-to-MP4 route uses a separately bounded 1 MiB specialist
to reduce browser/Wasm crossings while retaining one-write backpressure. A
dedicated destination worker owns the user-selected
`FileSystemWritableFileStream` and its writer for the full job. The conversion
worker copies one chunk into a profile-bounded `SharedArrayBuffer`, waits with Atomics,
and cannot queue another operation until the destination worker acknowledges
the write. Random offsets, truncate, close, abort, and a bounded 4 KiB error
message use the same one-command bridge. Browsers without that isolated-worker
capability retain the awaited asynchronous stream fallback.

Audio muxers often expose only 2-24 KiB at a time even though the destination
accepts a larger bounded write. The direct-save media bridge therefore copies
adjacent M4A, WAV, FLAC, AIFF, and AMR packets into one reusable 256 KiB coalescing buffer.
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
  routes including AV1 WebM copy, 80 MiB for VP8 WebM, and 88 MiB for VP9 WebM
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
- JPEG XL input: fixed 112 MiB Wasm heap; 102 MiB tracked decoder allocation;
  1 MiB retained input window; 16 MiB maximum output stripe or animation-frame
  surface; 1,000 animation frames; 64 GiB and 1,000:1 aggregate decoded limits
- JPEG XL output: fixed 56 MiB Wasm heap; 44 MiB tracked encoder allocation;
  16 MiB pixel-callback ceiling; 64 KiB output writes; one pending write; one
  reusable decoded animation-frame buffer; 1,000 frames, 128 MiB output, and the
  same 8,388,608-pixel, 64 GiB, and 1,000:1 aggregate limits
- AVIF output: fixed 80 MiB static or separately lazy-loaded 88 MiB animated
  Wasm heap; 256 KiB pixel strips; 64 KiB maximum output writes; one pending
  write; 786,432 pixels per frame; 1,000 frames; 128 MiB output; 64 GiB and
  1,000:1 aggregate decoded limits
- animated AVIF: fixed 40 MiB Wasm heap; 256 KiB reads; 64 KiB maximum
  engine write; 16 MiB maximum frame surface; 1,000 animation frames; 64 GiB
  and 1,000:1 aggregate decoded limits
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

The source-inspection panel reports the locally detected format and category,
browser-provided MIME type, exact byte count, batch count, and modification time.
Bounded parsers present available container, codec, duration, bitrate, audio,
video, subtitle, and metadata signals for the supported media families before a
conversion starts. Selecting a media destination produces a source-aware plan
for every inspected stream: copy, re-encode, exclude, or reject. The plan uses
the fixed certified FFmpeg profile policy, and incompatible stream-copy inputs
are labeled as rejections rather than silently renamed or transcoded. The
Start action is disabled when the bounded scan proves a required stream or
codec is absent or incompatible, avoiding a guaranteed-to-fail engine run. The
engine still validates the complete container during conversion and emits
runtime warnings for elements outside the bounded preflight scan.

Initial route selection prefers an exact format-specific conversion and, for
video, a certified same-category container stream copy before any elementary
extraction or re-encode. Generic GZIP/BZIP2/XZ remain available in the selector
but are the default only when no format-specific profile exists.

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
AIFF, AMR, AVI, FLAC, FLV, raw H.264, raw MPEG-2 video, raw MPEG-4 Part 2 M4V,
Matroska, MOV/MP4/3GP, MPEG-TS, MP3, Ogg, and WAV demuxers; raw H.264, raw
HEVC, raw MPEG-2 video, raw MPEG-4 Part 2 M4V, MP3, MPEG-TS,
fragmented MP4/M4A, WAV, AIFF, AMR, FLAC, and WebM muxers; the required audio and
H.264/HEVC/MPEG-2 decoders; PCM,
including signed 16-bit big- and little-endian PCM, FLAC, LAME MP3, OpenCORE AMR-NB, libopus, reference libvorbis, MPEG-4 Part 2, and
libvpx VP8/VP9 encoders; libswresample; libswscale; and the
necessary parsers and bitstream filters. It stream-copies compatible HEVC and
AAC packets plus certified AV1/Opus or AV1/Vorbis Matroska streams, performs real bounded audio decode/resample/encode pipelines, or
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

MKV, MP4, MOV, 3GP, MPEG-TS, and FLV can also extract the first certified AAC
stream to FLAC. These routes use the same custom AVIO callbacks and bounded
8,192-sample FIFO as standalone AAC-to-FLAC, copy compatible text and language
metadata, and explicitly warn about excluded video, additional streams,
non-artwork attachments, chapters, and container-only fields. The first bounded
JPEG/PNG cover is preserved under the common MP3/FLAC artwork policy below. FLAC losslessly
preserves the decoded signed 16-bit representation; it cannot restore data
already lost by AAC compression.

AVI-to-FLAC and OGV-to-FLAC extend the same bounded path to the verified MP3
and Vorbis combinations. They preserve the decoded signed 16-bit
representation losslessly while disclosing that FLAC cannot restore
information discarded by the source codec. Video and unrepresentable
container-only metadata are explicitly excluded rather than silently copied.

AVI-to-WAV converts the first MP3 stream through the same bounded decode,
resample, and PCM s16le pipeline while explicitly excluding video and auxiliary
streams.

An executable registry audit requires every one of the 259 public FFmpeg
profiles to disclose its route semantics and its metadata/container behavior.
Stream-copy routes must identify copying or remuxing; re-encode routes must
identify decoding/encoding or an equivalent lossless/lossy conversion; audio
extraction and container video re-encode routes must state their first/additional
stream and video-exclusion policies. This disclosure gate prevents silent or
ambiguous claims, but it does not replace independent field-retention tests.
The focused audio field-retention gate now covers one representative route for
each tag-capable destination family: WAV, FLAC, AIFF, ALAC/M4A, WMA/ASF,
MP3/ID3, Opus/Ogg, and Vorbis/Ogg. Native FFprobe must parse the genuine
destination codec and find the exact source `title` at format or stream scope;
the lossless routes also require complete decoded signed-16-bit PCM equality,
while lossy routes retain their codec/rate/quality gates. The eight-route matrix
passed in 17.5 seconds; its converted copies and Playwright state were then
removed. Raw AAC/ADTS and AMR are excluded because they cannot represent these
tags. See
`evidence/audio-metadata-retention-browser-2026-08-28.json`.

For the supplied `test.mkv`, the MP4 route preserves the main HEVC video, AAC
5.1 audio, language, color/aspect information, dispositions, timestamps, and
compatible general metadata. The SRT stream and attached PNG cannot be
stream-copied into this MP4 profile; the worker emits explicit warnings before
excluding them. M4A intentionally excludes video, subtitle, and attachment
streams and reports each limitation. It uses a fixed five-second fragment
duration so audio-only sample tables cannot grow with total duration. The WAV
profile converts only the first audio stream, preserves its channel count and
sample rate, and discloses the container metadata it cannot represent.

The reproducible `complex-remux-source.mkv` fixture adds VFR H.264 with a 90°
display matrix and explicit limited-range BT.709 primaries, transfer, and
matrix fields; two AAC tracks with English and Spanish language tags and
distinct dispositions; French SRT; two named chapters; a text attachment; and
container metadata. A real
browser MKV-to-MP4 test preserves both audio tracks, VFR packet timing,
dispositions, languages, display rotation, every explicit BT.709 field, and
compatible metadata; verifies explicit warnings for the three unrepresentable
source elements; and fully decodes the output with native FFmpeg. Rebuilding
the fixture produces the same SHA-256. A separate
corrupt-MKV browser case proves FFmpeg errors reach the interface, its partial
OPFS output is removed, and a replacement worker becomes ready.
The focused Matroska field-retention gate also asserts 640×360 geometry, 1:1
sample aspect, 16:9 display aspect, TV color range, BT.709 color space,
transfer, and primaries, the exact 90° display matrix, left chroma location,
progressive field order, stream titles/languages/default disposition,
attachment filename/MIME type, chapter titles, and container title/comment.
The combined MP4 and Matroska production-browser checks passed 2/2 in 14.7
seconds, independently probed and fully decoded both outputs, matched every VFR
video frame and both AAC access-unit streams to the source, and removed both
converted copies afterward; see
`evidence/complex-matroska-field-retention-browser-2026-09-01.json`.

The MPEG-4 video profile is intentionally narrow: it accepts YUV420P H.264 or
HEVC and converts only the first non-attached video stream. Automatic mode uses
the certified 2 Mbit/s policy; the conversion controls can instead select a
bounded bitrate, proportional no-upscale width cap, no-upconvert frame-rate cap,
and smaller/balanced/higher quality policy. It
explicitly excludes audio, subtitles, attachments, and chapters. Its current
evidence includes the protected 2,958,573,265-byte fixture, so the normal selector exposes it.
The VP8 profile similarly converts the first video stream to a video-only WebM,
bounds automatic output to 640 pixels wide, uses four decoder threads, four encoder
threads, four token partitions, realtime deadline, `cpu-used=8`, and zero
lookahead, and reports excluded audio, subtitles, attachments, and chapters.
It is loaded from a dedicated eight-worker pthread module so audio and remux
routes do not pay that pool's memory cost.

Every public video re-encode route exposes the same validated controls: automatic
or VP8/VP9/MPEG-4 where its destination container permits it, automatic or
320/480/640-pixel proportional no-upscale width, automatic or 300/600/1,000/
2,000/4,000 kbit/s, automatic or 15/24/25/30 fps without frame duplication, and
automatic/smaller/balanced/higher quality. Unsupported combinations and values
are rejected independently by the browser, worker, and native Wasm wrapper.
Automatic retains the previously certified fastest profile unchanged.

MP4 and QuickTime MOV use those same optimized VP8 and VP9 cores. Their first
non-attached H.264 or HEVC video stream is genuinely decoded, proportionally
downscaled when wider than 640 pixels, and re-encoded to video-only WebM; AAC or
other audio, extra video, subtitles, attachments, and chapters are explicitly
excluded with warnings. Small H.264/AAC browser fixtures prove both container
paths, while 147 MiB high-bitrate H.264/AAC sources exercise bounded streaming,
downscaling, complete decode, repeatability, and cleanup in three-run Chrome
profiles.

The automatic, smaller, and balanced VP9 profiles use a separate lazy-loaded
eight-worker module, so selecting VP8, audio, or stream-copy never downloads or
starts the VP9 specialist. Explicit higher-quality VP8/VP9 uses a separate
four-worker/two-codec-thread module. On the 181,825,549-byte maximum-settings
VP9 stress source, that topology completed three repeatable runs in 397.7–399.7
seconds at 232.9 MiB peak incremental process-tree private memory; the rejected
eight-worker higher-quality topology was faster at 348.6–351.9 seconds but
exceeded the unchanged 250 MiB limit at 264.1 MiB.
Automatic VP9 retains the same 640-pixel width, 600 kbit/s, realtime,
`cpu-used=8`, and zero-lookahead bounds while enabling row multithreading and
two tile columns.
The VP9 encoder uses four threads. Inputs wider than 1,280 pixels limit only the
memory-heavy decoder to two threads; the downscaled encoder stays four-threaded.
This topology improved the 136 MiB M2V benchmark from 85.49 to 69.06 seconds
and the 181.8 MB high-resolution MKV benchmark from 355.59 to 330.23 seconds
without increasing the 96 MiB Wasm ceiling.

The OGV profiles use the matching bounded VP8 or VP9 module to decode the first
Theora video stream while copying the first Vorbis audio stream losslessly into WebM.
They preserve compatible audio language and general metadata, scale video wider
than 640 pixels, and explicitly excludes unsupported additional streams and
chapters. The OGV-to-WAV route decodes the first Vorbis stream to PCM s16le and
discloses the excluded video stream.

Raw MPEG-2 elementary streams are inspected with FFmpeg's bounded stream-info
probe so sequence-header dimensions and frame rate are used instead of the raw
demuxer's generic defaults. The site converts their decoded YUV 4:2:0 frames to
either 2 Mbit/s MPEG-4 Part 2 MP4 or realtime 600 kbit/s VP8/VP9 WebM. Elementary
streams have no audio, chapters, attachments, or container metadata to carry.
They can also be wrapped directly in video-only MPEG-TS without decoding. The
wrapper synthesizes presentation timestamps from MPEG-2 picture temporal
references, including B-frame display order. Conversely, MKV, MP4, MOV, AVI,
and MPEG-TS can extract their first certified MPEG-2 video stream without
re-encoding. Extraction excludes every other stream and container-only field;
independent tests compare every decoded frame because raw M2V cannot preserve
container timestamps or metadata.

Raw MPEG-4 Part 2 M4V uses the same bounded AVIO path and the native FFmpeg
parser's B-frame-aware timestamp reconstruction. It is packet-copied directly
into fragmented, video-only MP4 without decoding or re-encoding. Conversely,
MKV, MP4, MOV, and AVI can extract their first certified MPEG-4 Part 2 video
stream directly to M4V. Audio and all container-only fields are explicitly
excluded. Browser tests compare every decoded frame, and the large-file gate
fully decoded all 1,440 frames in every output.

Certified AV1 Matroska input takes the fastest lossless route: it skips the
decoder-oriented stream-analysis pass and packet-copies every AV1 video stream
plus compatible Opus or Vorbis audio directly into WebM. The live WebM layout
uses five-second or 5 MiB clusters and omits duration/cue indexes so muxer memory
cannot grow with duration; sequential playback remains valid, while accurate
seeking may require a player scan. In three Chrome runs, a 222,942,211-byte
1,920×1,080 AV1/Opus source completed in 1.98–2.40 seconds with 32 MiB Wasm and
213.7 MiB worst incremental process-tree private memory. All 1,440 decoded video
frames and decoded Opus samples matched the source SHA-256 exactly, and cleanup
deleted the source and all three outputs.

Certified MP4, MOV, 3GP, MPEG-TS, FLV, AVI, WebM, and OGV inputs can also use
the fastest lossless route into Matroska: compatible video, audio, subtitle,
attachment, chapter, stream, and general metadata are packet-copied without a
decode/re-encode pass. The asynchronous 256 KiB BYOB reader avoids retaining a
second source-sized Blob. Across 24 Chrome stress runs on 137,218,662- to
222,941,314-byte inputs, conversion completed in 0.87-1.67 seconds at
166.2-183.7 MiB worst incremental private memory with 32 MiB Wasm and one
pending write. Seven routes use bounded live Matroska; AVI uses five-second/5
MiB clusters with a compact cue index because FFmpeg live mode writes invalid
VFW duration metadata. Full native decoded-stream or compressed-packet hashes
matched every source, outputs were repeatable, and category cleanup deleted all
generated media and converted copies.

Certified MP3 audio in MKV, MP4, MOV, AVI, MPEG-TS, or FLV also takes a direct
packet-copy path: only the first compatible MP3 stream is read, while video,
additional audio, subtitles, attachments, data, and chapters are explicitly
excluded. Header-complete MKV, MP4, MOV, and AVI inputs skip decoder-oriented
stream analysis; MPEG-TS and FLV use a bounded 2 MiB probe because those
containers do not fully declare the audio stream in their headers. Three Chrome
runs per route on 181,340,062–185,645,300-byte sources completed in 1.20–2.14
seconds with 32 MiB Wasm and 214.9–243.9 MiB worst incremental process-tree
private memory. All eighteen outputs retained the same exact MP3 packet SHA-256,
fully decoded with native FFmpeg, and were deleted with the six large sources.
Standalone MP3 cannot represent container timing/trim, language, or every
container-only field; compatible text fields are mapped to ID3 where possible,
and the first bounded JPEG/PNG cover is retained under the policy below.

Certified AAC audio in MKV, MP4, MOV, 3GP, MPEG-TS, or FLV takes the same
lossless packet-copy route into raw ADTS AAC. Only the first compatible AAC
stream is retained; video, other audio, subtitles, attachments, data, and
chapters are explicitly excluded. The AAC worker uses a reusable 256 KiB BYOB
input buffer because synchronous Blob reads retained transient per-read buffers
and pushed FLV to 291.4 MiB. The bounded reader reduced the final six-route
range to 175.7–211.3 MiB while completing 140–143 MiB-class inputs in
0.35–1.08 seconds with 32 MiB Wasm. All eighteen outputs contained the same
3,049 access units and exact normalized payload SHA-256. Raw ADTS cannot retain
container timing, language, artwork, dispositions, or container-only metadata;
compatible general text fields are written as ID3v2 where representable.

Raw Annex B H.264 input uses the same 262,144-byte bounded AVIO reader. It can
be stream-copied into fragmented MP4 or genuinely decoded and encoded as
600 kbit/s VP8/VP9 WebM with the same 640-pixel width and zero-lookahead limits.
Conversely, MKV, MP4, MOV, 3GP, MPEG-TS, and FLV can extract their first
certified H.264 video stream without re-encoding. Audio, subtitles,
attachments, chapters, extra video, and data streams are explicitly excluded.
Elementary H.264 cannot carry container timestamps or metadata, so all encoded
frames are preserved exactly while playback timing is reconstructed from the
detected raw frame rate; tests compare decoded-frame SHA-256 rather than
claiming that container timing survives extraction.

Certified HEVC video in MKV, MP4, MOV, or MPEG-TS takes the fastest lossless
route: the first non-attached HEVC stream is packet-copied directly to Annex B
elementary output while audio, subtitles, attachments, data, additional video,
chapters, and container-only metadata are explicitly excluded. Three Chrome
runs per route on 148,952,609–157,710,004-byte sources completed in 2.06–3.78
seconds with 32 MiB Wasm and 195.3–212.2 MiB worst incremental process-tree
private memory. Every output retained 17,282 decoded frames, had a repeatable
hash, fully decoded natively, and was deleted after validation. Raw HEVC input
to MP4 is intentionally not advertised: native and browser experiments retained
all packets but could not reconstruct lossless B-frame presentation order from
an elementary stream without container timestamps.

Raw AAC/ADTS input uses FFmpeg's bounded AAC demuxer. The M4A route copies AAC
frames without re-encoding, removes the ADTS transport headers with
`aac_adtstoasc`, and writes equivalent elementary payload into fragmented M4A.
The WAV and FLAC routes genuinely decode AAC, resample to stereo PCM s16le, and
write bounded PCM or losslessly compressed decoded audio. Raw ADTS has no
container artwork, chapters, language tag, or general metadata to preserve.

Raw `.amr` input is limited to certified 8 kHz mono AMR-NB. The pinned FFmpeg
source build applies the audited `amr-bounded-packets.patch`, which replaces
partial raw packet reads with complete-frame batches capped at 32 KiB. This
prevents a frame from being split at a 256 KiB AVIO refill boundary and avoids
millions of tiny demux packets. PCM output is accumulated in fixed
8,192-sample FIFO batches; FLAC uses its codec frame size. Both outputs decode
to the same exact PCM SHA-256 as native FFmpeg. Separately, pinned `.awb`
input accepts certified mono 16 kHz AMR-WB in 3GP/ISOBMFF and converts it to
WAV, FLAC, AIFF, MP3, AAC, Opus, Ogg Vorbis, or WMA2 through the same bounded pipeline. Native and Wasm floating-point
AMR-WB decode differ only by rounding and passed full-timeline 154.179 dB
APSNR; arbitrary AMR-WB container variants remain outside these two profiles.
A second pinned Docker export matched all 17 published FFmpeg engine files
byte-for-byte. The AMR-WB-capable core SHA-256 is
`9CC4841CA32E8CC592633070760395E7DE6CCA4F974EEECDDCA004ACBD32FEE9`;
the profile synchronizer has a read-only `--check` mode so verification cannot
silently rewrite the published manifest.

AIFF PCM, Ogg Vorbis, and Ogg Opus can also be written as FLAC through the
same bounded decoder, resampler, FIFO, and direct-output callbacks. Signed
16-bit AIFF remains sample-exact. Vorbis and Opus cannot regain information
discarded by their source codecs, so their FLAC results are independently
checked against the decoded source with APSNR rather than byte-comparing the
compressed streams. Compatible text comments are copied; container-only chunks
are explicitly outside these audio-only profiles, while the first bounded
JPEG/PNG cover is retained in FLAC under the common artwork policy below.

M4A (AAC or 16-bit ALAC), raw AAC, raw AMR-NB, MP3, FLAC, WAV, WMA2, Ogg
Vorbis, and Ogg Opus can be written as genuine AIFF containing signed 16-bit
big-endian PCM. These routes reuse the bounded decoder/resampler/FIFO pipeline,
write directly to the destination through coalesced callbacks, and never retain
a complete input or output in memory. Lossless 16-bit inputs remain sample-exact;
lossy sources are independently compared against their decoded source with a
60 dB minimum APSNR gate. AIFF cannot preserve every container tag, artwork,
chapter, language, or additional-stream field, so those exclusions are explicit.

M4A (AAC or 16-bit ALAC), raw AAC, MP3, FLAC, WAV, WMA2, AIFF, Ogg Vorbis,
and Ogg Opus can be encoded as raw AMR-NB using the pinned OpenCORE AMR encoder.
The fixed profile is the interoperable MR122 mode: 12.2 kb/s payload, 8 kHz,
mono, with one 20 ms speech frame per packet. Resampling, downmixing, encoding,
and direct destination writes stay inside the same bounded audio pipeline; the
16,384-sample FIFO is preallocated and grows only if its existing free space is
insufficient. AMR is a narrowband speech format, so stereo, high frequencies,
lossless identity, container metadata, artwork, chapters, and extra streams
cannot be preserved. AMR-WB encoding is intentionally not shipped: FFmpeg can
connect to the Apache-licensed VisualOn `vo-amrwbenc` implementation, but
VoiceAge currently identifies AMR-WB as an actively licensed patent portfolio.
The project will not publish an AMR-WB destination without explicit patent
clearance. This is a conservative distribution decision, not legal advice; the
separately certified `.awb` decoder routes do not claim an AMR-WB destination.
See the [FFmpeg encoder integration](https://ffmpeg.org/doxygen/8.0/libvo-amrwbenc_8c_source.html),
[official VisualOn project](https://sourceforge.net/projects/opencore-amr/), and
[VoiceAge portfolio notice](https://voiceage.com/Patent-Portfolio-Essential.html).

M4A (AAC or 16-bit ALAC), raw AAC, raw AMR-NB, certified AMR-WB `.awb`, FLAC, WAV, WMA2, AIFF, Ogg
Vorbis, and Ogg Opus can be encoded as genuine MP3 using pinned LAME 4.0. The
fastest certified LAME algorithm setting (`compression_level=9`) was selected
after native timing and decoded-quality comparisons. Speech at 8 or 16 kHz
keeps its source rate and uses 32 or 64 kb/s mono respectively; other mono
output uses 128 kb/s, stereo uses 192 kb/s, and other rates normalize to 32,
44.1, or 48 kHz.
Every MP3-output route also exposes a bounded advanced panel: automatic or
64/96/128/192/256/320 kb/s, automatic or 32/44.1/48 kHz, and automatic/mono/
stereo. `Automatic` preserves the source-aware policy above. The browser
contract, conversion worker, and native Wasm wrapper each enforce the same
allowlist; these controls do not expand the worker count, queue, or 32 MiB Wasm
heap. A maximum-setting 320 kb/s, 48 kHz stereo run converted the genuine
153,600,106-byte, 800-second WAV three times in 9.61-12.73 seconds at 191.7 MiB
worst complete-Chrome incremental private memory. All outputs were the same
genuine 32,002,657-byte MP3, fully decoded and quality-checked independently.
The exact focused, stress, cleanup, and no-Docker reproduction record is kept in
[`evidence/mp3-output-controls-2026-08-30.json`](evidence/mp3-output-controls-2026-08-30.json).
The browser path retains one worker, 32 MiB Wasm, 256 KiB reads, packet-sized
direct writes (1,057 bytes at the measured maximum setting), and one destination
operation in flight. The optimized
23.3-hour AMR-NB source passed 3/3 in 171.14-179.38 seconds at 168.7 MiB,
down from 417.56-428.36 seconds, while output fell from 1,342,295,469 to
335,574,477 bytes and ASDR remained 26.0269 dB. The 12.516-hour AMR-WB source
passed 3/3 in 196.35-200.97 seconds at 172.9 MiB with 25.8266 dB ASDR.
Every output was fully decoded and compared
against the decoded source with ASDR; MP3 cannot preserve lossless identity or
all container metadata, chapters, and extra streams. Compatible common text tags
and the first bounded JPEG/PNG cover are preserved where present.

MP3 and FLAC destinations share one bounded artwork path. The first attached
JPEG or PNG cover is packet-copied without decoding only when the packet is at
most 4 MiB, each side is at most 4,096 pixels, and the image is at most
16 megapixels. Additional pictures, other codecs, oversized or malformed images,
and artwork a destination cannot represent are excluded with an explicit warning.
Seven common tags (`title`, `artist`, `album`, `genre`, `date`, `track`, and
`comment`) are copied where the destination can represent them. Production
Chrome preserved the exact picture bytes and all seven tags for genuine
M4A-to-MP3, M4A-to-FLAC, and MP4-MP3 stream-copy cases; raw AAC independently
proved explicit exclusion. Chaining those genuine browser outputs back through
standalone MP3-to-FLAC and FLAC-to-MP3 also preserved the exact tags and cover
while passing full native audio decode. Deterministic Ogg Vorbis and Ogg Opus
fixtures use the standard `METADATA_BLOCK_PICTURE` representation; the demuxer
exposes that picture as the same bounded attached-picture stream. Production
Chrome also preserved its exact bytes and all seven stream-scoped Ogg comments
through Vorbis-to-MP3, Vorbis-to-FLAC, Opus-to-MP3, and Opus-to-FLAC. Only the
seven allowlisted comments are promoted to destination scope, so the base64
picture comment is not duplicated into output metadata. A 134,402,091-byte
random-access stress source passed three MP4-to-FLAC runs in 0.376-0.733 seconds
at 95.9 MiB worst incremental private memory and three MP4-to-MP3 runs in
0.234-0.551 seconds at 88.4 MiB.
Reads stayed at 256 KiB, Wasm at 32 MiB, and only one destination operation was
pending. Exact hashes, rejected higher-memory fixtures, cleanup, and the
no-Docker build record are in
[`evidence/audio-artwork-retention-2026-09-01.json`](evidence/audio-artwork-retention-2026-09-01.json).

M4A (AAC or 16-bit ALAC), raw AMR-NB, certified AMR-WB `.awb`, MP3, FLAC, WAV, WMA2, AIFF, Ogg
Vorbis, and Ogg Opus can also be encoded as genuine raw AAC-LC. The fastest
certified native AAC search coder disables TNS, PNS, intensity stereo, and M/S
stereo after comparative ASDR testing. Standard input rates from 8 through
48 kHz are preserved; other rates are rounded upward or capped at 48 kHz.
Thirty-three isolated Chrome runs passed across eleven source cases in 12.20-583.09
seconds at 209.8 MiB worst complete-Chrome incremental private memory. The
8 kHz AMR policy was 22.38x faster than unnecessary 32 kHz upsampling in the
one-hour native benchmark and improved ASDR. Every browser result was
repeatable, fully decoded and ASDR-validated, used 32 MiB Wasm, 262,144-byte
maximum reads, at most 780-byte writes, and one destination operation in flight.
The 12.516-hour AMR-WB source passed 3/3 in 459.75-583.09 seconds with
repeatable 380,256,896-byte output and -2.70408 dB ASDR while preserving 16 kHz.
AAC is lossy and raw ADTS cannot preserve container metadata, artwork, chapters,
or extra streams.

M4A (AAC or 16-bit ALAC), raw AAC, raw AMR-NB, certified AMR-WB `.awb`, MP3, FLAC, WAV, WMA2, AIFF,
and Ogg Vorbis can be encoded as genuine Opus in Ogg with pinned libopus 1.6.1.
The measured fastest complexity setting is 0; on the protected five-minute
reference it was 55.8% faster than complexity 5 and 122.9% faster than
complexity 10 while retaining slightly higher channel ASDR. Packed float was
also 2.7% faster and materially more faithful than the rejected signed-16-bit
path. Supported 8, 12, 16, 24, and 48 kHz source rates are preserved internally,
avoiding unnecessary resampling; Ogg signals Opus at its standard 48 kHz clock.
All 33 isolated Chrome runs passed on 36,929,878-201,600,102-byte inputs in
6.08-197.74 seconds at 225.6 MiB worst complete-Chrome incremental private
memory. Outputs were repeatable, fully decoded and ASDR-validated, with 32 MiB
Wasm, 262,144-byte reads, at most 18,067-byte writes/queueing, one worker, and
one destination operation in flight. Category cleanup deleted all stress inputs,
converted copies, and the Chrome profile after retaining compact reports.

M4A (AAC or 16-bit ALAC), raw AAC, raw AMR-NB, MP3, FLAC, WAV, WMA2, AIFF,
and Ogg Opus can be encoded as genuine Ogg Vorbis with pinned reference
libvorbis 1.3.7 and libogg 1.3.6. The measured quality-4 VBR setting was 27.7%
faster and 41.5% smaller than FFmpeg's rejected experimental native encoder on
the protected five-minute reference, while retaining balanced channel ASDR.
Source sample rates through 48 kHz are preserved; this made the one-hour AMR-NB
benchmark 5.47x faster and 55.4% smaller than unnecessary 48 kHz upsampling.
All 30 isolated Chrome runs passed on 36,929,878-201,600,102-byte inputs in
16.12-243.43 seconds at 201.0 MiB worst complete-Chrome incremental private
memory, leaving 49.0 MiB below the cap. Outputs were repeatable, fully decoded
and ASDR-validated, with 32 MiB Wasm, 262,144-byte reads, at most 16,243-byte
writes/queueing, one worker, and one destination operation in flight. Category
cleanup deleted every generated stress source, converted copy, and Chrome
profile after retaining compact manifests and reports.
The 137,420,809-byte, 12.516-hour AMR-WB source passed 3/3 in 221.03-232.91
seconds at 151.0 MiB with repeatable 182,985,148-byte output and 21.117 dB ASDR.

M4A (AAC or 16-bit ALAC), raw AAC, certified AMR-WB `.awb`, MP3, AIFF, Ogg
Vorbis, and Ogg Opus can be encoded as genuine ASF/WMA2. General audio keeps
the established 48 kHz/320 kbit/s profile; mono input at or below 16 kHz uses
the measured speech profile at 32 kHz/64 kbit/s. Across six three-run one-hour
policies, the selected AMR-WB setting averaged 3.6790 seconds versus 5.2570
seconds for 48 kHz/320 kbit/s (1.43x faster), produced an 88.9% smaller file,
and improved ASDR by about 0.76 dB. The 137,420,809-byte, 12.516-hour source
passed 3/3 Chrome runs in 133.66-225.62 seconds at 157.6 MiB worst incremental
private memory. All 375,469,344-byte outputs were byte-identical, fully decoded
at -2.70643 dB ASDR, and deleted before the next run.

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

TAR.BZ2-to-ZIP and TAR.XZ-to-ZIP connect the fixed-memory BZIP2 or XZ decoder
directly to that same sequential USTAR parser and ZIP writer. The nested bridge
permits one 64 KiB TAR chunk at a time and awaits every final destination write,
so neither route creates an intermediate TAR or lets decompression outrun ZIP
encoding. Compound input suffixes are removed when suggesting the final ZIP
name, including `.tar.bz2`, `.tbz2`, `.tar.xz`, and `.txz`.
ZIP-to-TAR.BZ2 and ZIP-to-TAR.XZ use the same bridge in reverse: validated ZIP
entries become deterministic USTAR chunks that feed the fixed 8 MiB BZIP2 or
48 MiB XZ engine directly. Backpressure spans ZIP inflation, TAR construction,
compression, and the final selected destination with no intermediate archive.

Raw GZIP, BZIP2, and XZ can also transcode directly in all six directions.
The source decoder feeds one 64 KiB bounded bridge into the target encoder, so
the app never writes, rereads, or retains a complete decompressed copy. The
three source codecs share one concurrently generated 256 MiB stress fixture set
instead of regenerating the same bytes for every route. Each route independently
decompresses and hashes the result, rejects corrupt or truncated source streams,
propagates destination failures, works through the direct-save and offline
paths, and deletes partial output. The six three-run Chrome gates used 159.2 to
236.2 MiB worst incremental private memory with exact repeatable output.

All six direct TAR.GZ/TAR.BZ2/TAR.XZ cross-conversions use one shared bounded
pipeline: the source codec emits at most a 64 KiB TAR bridge chunk, the USTAR
validator checks headers, checksums, paths, duplicates, entry count, and payload
limits in flight, and the destination codec cannot consume another chunk until
the selected-file write completes. The inner USTAR bytes remain exact; only the
outer compression stream changes. The BZIP2 and XZ pair uses 56 MiB combined
fixed Wasm, while routes involving GZIP use only the relevant 8 MiB BZIP2 or
48 MiB XZ module. No route creates a complete intermediate TAR or output copy.

TAR, TAR.GZ, TAR.BZ2, TAR.XZ, and ZIP-to-7Z plus 7Z-to-TAR, compressed TAR, and
ZIP use a separately lazy-loaded libarchive 3.8.9 engine with a fixed 56 MiB
Wasm heap, 256 KiB bounded source reads, 64 KiB writes, and exactly one awaited
destination operation. Compressed-TAR and ZIP producers feed validated USTAR
directly into the sequential 7Z writer; 7Z output feeds decoded USTAR directly
through GZIP, BZIP2, XZ, or the sequential ZIP encoder. No direction stores a
complete intermediate TAR. 7Z input accepts regular files and directories using
COPY, LZMA1, LZMA2, or PPMd and rejects unsafe paths, duplicates, encryption,
links, special files, unsupported codecs, more than 10,000 entries, more than
64 GiB of payload, and expansion above 100:1. Output is deterministic USTAR with
sanitized owners and permissions. 7Z creation strictly validates USTAR blocks
and stages libarchive's seekable encoded payload through synchronous bounded
OPFS scratch I/O rather than MEMFS. A 256 KiB sample selects LZMA2 preset 0 for
compressible input and lossless COPY when recompression would waste CPU or grow
the archive. Scratch is truncated and deleted after success, failure, or cancel.

Still-image routes use `ImageDecoder` in the conversion worker, request one
deterministic RGBA frame, enforce compressed-size, dimensions, pixel-count,
decoded-byte, and expansion-ratio limits before allocating the surface, and
write the encoded output in bounded chunks. Animated PNG/APNG, GIF, WebP, and AVIF inputs
intentionally use only the first frame and show a visible omission warning.
EXIF, ICC, text metadata, and animation are not preserved;
JPEG and BMP composite transparency over white, and JPEG/WebP outputs are lossy
at the disclosed quality.

JPEG XL output is the animation-preserving exception. A separate lazy-loaded,
reproducible libjxl 0.12.0 encoder requests bounded pixel rectangles through
`JxlEncoderAddChunkedFrame`, writes through one 64 KiB output-processor buffer,
and uses lossless effort 1, the fastest libjxl lossless setting. Static PNG,
JPEG, WebP, AVIF, and BMP and complete animated PNG/APNG, GIF, WebP, and AVIF
tracks are supported. The worker decodes and closes one frame at a time and
reuses one RGBA allocation for every animation frame; it never retains a frame
set or complete encoded output. Animation uses a 1/1,000,000 timebase and maps
playback repetitions exactly. The independent validator checks every decoded
frame and timestamp with FFmpeg/Pillow and checks timebase and loop metadata
through the separately built bounded libjxl decoder. EXIF, ICC, text metadata,
source compression choices, frame rectangles, blend, and disposal operations
are not copied; Chromium's decoded 8-bit sRGB/sRGBA pixels are encoded exactly.

AVIF output uses a separate reproducible FFmpeg 8.1.2/libaom 3.13.2 engine and
a project-owned streaming AVIF muxer patch. The muxer writes `ftyp`, `free`, and
`mdat` first, streams compressed AV1 packets directly through the seekable
destination bridge, patches only the bounded `mdat` size, and appends `meta`
and, for animation, `moov`. It never mirrors the completed output in Wasm or
JavaScript. Static jobs load a fixed 80 MiB module; animations load a distinct
88 MiB module, so still conversions do not pay the animation heap cost. One
thread, realtime mode, cpu-used 8, zero lookahead, reduced references, YUV 4:2:0
color at CRF 32, and lossless grayscale alpha are the fastest tested policy that
meets the unchanged visual and process-memory gates. Frames use an exact
microsecond timebase and equivalent repetition semantics. EXIF, ICC, text
metadata, source compression choices, frame rectangles, blend, and disposal
operations are not copied.

PNG, JPEG, WebP, and BMP static sources passed their final three-run Chrome
profiles at 192.9, 219.6, 240.7, and 192.0 MiB worst incremental private memory.
Eight-frame APNG, GIF, and WebP passed at 218.0, 237.5, and 220.9 MiB. The three
animation routes produced the same repeatable 183,123-byte AVIF, preserved exact
250 ms frame durations and infinite looping, and were independently decoded.
The focused transparent finite-loop WebP case additionally preserved all three
frames, exact 100/200/300 ms timing, and alpha through both browser and native
validation. Reads and pixel strips stayed at or below 256 KiB, output writes and
queueing at or below 48,550 bytes, and only one operation was pending.

BMP-to-JPEG-XL bypasses Chromium's high-memory BMP decoder. It reads the file
sequentially in at most 256 KiB chunks, reuses one source row no larger than
32 KiB, normalizes bottom-up or top-down uncompressed 24/32-bit BGR rows into a
single capped RGB plane, and feeds that plane to the same chunked encoder. On
the unchanged 24,883,254-byte 3840×2160 fixture, this cut worst incremental
private memory from a rejected 362.8 MiB to 224.0 MiB and improved conversion
from 0.366-0.597 seconds to 0.318-0.500 seconds with the identical output hash.

PNG/APNG, GIF, and WebP frame-archive routes select Chrome's animation track,
decode and release one composited frame at a time, encode that frame as PNG,
and stream it immediately into a stored ZIP entry. Stored entries avoid a
second compression pass over PNG data. `animation.json` records frame order,
dimensions, timestamps, durations, and repetition count. The certified APNG
case passed 3/3 in 0.165-0.243 seconds at 136.6 MiB worst incremental complete-
Chrome private memory with eight exact native-decoder frame matches.

GIF-to-APNG and animated-WebP-to-APNG keep Chrome's bounded native animation
decoder but use a purpose-built deterministic APNG writer. Each complete frame
is copied as RGBA in at most 256 KiB strips, PNG-Sub filtered, compressed through
one browser-native `CompressionStream` zlib stream, and written immediately as
64 KiB-bounded IDAT/fdAT chunks with one destination operation pending. No PNG
Blob or complete frame set is retained. Both eight-frame 1,024×768 fixtures
preserved all decoded RGBA pixels, exact 250 ms timing, and infinite looping.
GIF completed in 0.373-0.462 seconds at 124.5 MiB worst incremental private
memory; WebP completed in 0.405-0.506 seconds at 123.2 MiB. Both produced the
same repeatable 510,774-byte APNG and SHA-256
`7db18b94b2b92448a3a480829c0d9dd702e0d0bf8232a354285388b3127633e8`.
The largest destination write was 16,400 bytes, the largest pixel strip was
258,111 bytes, and the peak explicit JavaScript image working set was 516,159
bytes before returning to zero at completion.

APNG-to-GIF and animated-WebP-to-GIF use the same bounded native decoder with a
purpose-built deterministic GIF89a writer. It copies RGBA in at most 256 KiB
strips, applies a fixed 255-color RGB332 palette plus binary transparency, and
streams LSB-first GIF LZW subblocks through one pending destination write. The
encoder retains only one composited `VideoFrame`, one pixel strip, a fixed 4 MiB
generation-stamped LZW dictionary, and a 128 KiB staging area; its measured peak
explicit JavaScript image working set is 4,587,775 bytes and returns to zero.
Every eight-frame output preserves equivalent loop playback and exact 250 ms timing,
and independently decoded pixels match the documented quantizer exactly.
APNG completed in 0.340-0.472 seconds at 119.1 MiB worst incremental private
memory; WebP completed in 0.367-0.500 seconds at 132.6 MiB. Both produced the
same repeatable 415,740-byte GIF and SHA-256
`391853553fe9660aa671c805a15e9cdb40a735830e6d2b5acea6e82bca493439` with
at most 11,520-byte writes.
Static-track selection is header-driven rather than forced: PNG passed 3/3 in
0.084-0.148 seconds at 102.8 MiB, and lossy WebP passed in 0.085-0.157 seconds
at 86.2 MiB with repeatable output and 0.978313 RGB SSIM against independent
native decoding. A still frame with no source duration becomes a valid zero-delay
GIF frame; animation frames still require explicit nonzero timing.

Animated PNG/APNG-to-WebP and GIF-to-WebP keep one decoded composited frame and
one browser-encoded lossless VP8L frame at a time. The worker extracts only the
bounded per-frame WebP image chunks and writes them immediately into a streamed
RIFF/VP8X/ANIM/ANMF container; the complete animation is never collected in a
Blob or JavaScript buffer. A final 17-byte positioned write patches the RIFF size
and alpha feature flag through the same random-access destination. APNG passed
3/3 in 0.342-0.445 seconds at 148.5 MiB worst incremental private memory, while
GIF passed in 0.323-0.424 seconds at 156.5 MiB. Both produced the same repeatable
226,756-byte output and SHA-256
`688d9ea27bf0b880fe49bb7ca2e469e0e71b375e618f4cef61ab87b884e71127`;
all eight frames and alpha channels matched independent Pillow/libwebp decoding
at SSIM 1.0. Reads stayed at 262,144 bytes, writes at 28,726 bytes, and the peak
explicit JavaScript image working set was 28,726 bytes before returning to zero.
Canvas quality 0.90 and 0.99 were rejected at 0.621542 and 0.654308 SSIM; quality
1 is the fastest tested native setting that meets the unchanged 0.90 threshold.

ICO output uses those same bounded decoders, scales proportionally only when an
edge exceeds 256 pixels, and writes a standards-compliant one-entry icon header
followed by an incrementally copied PNG payload. It preserves alpha but does not
claim alternate icon sizes, animation, or metadata that the source cannot carry
through this bounded profile. Stable Chrome does not expose ICO, SVG, or
HEIC/HEIF through worker `ImageDecoder`; unsupported browser-native inputs are
not advertised.

TIFF-to-PNG uses a separate reproducible libtiff/libpng/zlib/libjpeg-turbo Wasm
engine because Chrome does not decode TIFF in a worker. It reads at most 256 KiB
at a time, decodes strip or tile blocks into one bounded raster stripe, and
writes PNG chunks of at most 64 KiB with one pending destination operation. The
heap is fixed at 40 MiB; decoded blocks and assembled tile stripes are capped at
4 MiB. Contiguous or separated-planar 8- or 16-bit grayscale, RGB, and RGBA are
accepted, as are 8-bit palette images, orientations 1 through 8, and none,
PackBits, LZW, Deflate, or baseline JPEG compression. Separated planes are
interleaved one scanline or bounded tile stripe at a time. Orientations are
applied with bounded stripes. TIFF-to-PNG converts the first page with a
visible omission warning; TIFF-to-ZIP scans at most 1,000 directories once and
streams each decoded page immediately into an ordered PNG archive.

JPEG-XL-to-PNG and JPEG-XL-to-ZIP use a separate reproducible libjxl/libpng Wasm engine because
Chromium does not expose JPEG XL through worker `ImageDecoder`. It retains at
most a 1 MiB compressed-input window, decodes within a fixed 112 MiB heap and
102 MiB tracked allocation ceiling, and writes one bounded PNG/ZIP chunk at a time.
Integer grayscale, grayscale-alpha, RGB, and RGBA through 16 bits are supported;
orientation and target ICC are applied, associated alpha is unpremultiplied,
and the still route converts only the first rendered frame with a visible warning.
The animation route decodes and releases one displayed coalesced frame at a time,
streams it directly into ZIP, and records exact timebase, duration, timecode, and
loop metadata without retaining the complete frame set or completed archive.
Floating-point samples and independent preservation of EXIF, XMP, thumbnails,
preview images, text boxes, and non-alpha extra channels are excluded.

Animated-AVIF-to-ZIP uses a separate reproducible libavif/libaom/FFmpeg/libpng
Wasm engine instead of Chromium `ImageDecoder`, whose certified first-frame RGB
SSIM did not meet the unchanged 0.97 threshold. The fixed 40 MiB engine reads
at most 256 KiB, decodes and releases one capped RGB/RGBA frame at a time,
converts YUV with pinned bicubic libswscale, and writes level-1 PNG chunks of at
most 64 KiB directly into stored ZIP entries with one pending destination
operation. `animation.json` records exact timebase positions, durations,
dimensions, sample depth, channels, decoded sizes, and repetition count. The
profile accepts animation tracks only; still-item-only AVIF and crop, rotation,
or mirror transforms are rejected, while EXIF and XMP are not copied.

Subtitle and structured-data engines are incremental UTF-8 parsers with a
1 MiB cue/record/line ceiling. SRT, WebVTT, ASS, and TTML routes validate timing
and emit real destination syntax. ASS output is written directly with a
deterministic default style, nearest-centisecond timing, preserved multiline
text, voice labels, and basic italic/bold/underline markup; excluded WebVTT
metadata, cue identifiers, positioning, regions, and CSS are disclosed. TTML
rejects DTDs and custom entities, accepts
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
to DOCX converts each source line to one Word paragraph, preserves empty lines,
spaces, Unicode, and tabs, and incrementally writes a valid three-part OOXML
package through browser-native streaming DEFLATE. It retains neither the
completed XML nor ZIP package and explicitly discloses that plain text cannot
provide styles, headings, links, tables, layout, language, media, or document
metadata. TXT-to-ODT follows the ODF 1.3 package rules: the exact mimetype is
the first stored local entry with no extra field, while the manifest and
content XML stream through bounded raw DEFLATE. Explicit OpenDocument space and
tab elements preserve whitespace that an ODF consumer would otherwise
normalize. TXT is also escaped into a complete preformatted HTML document.
TXT-to-EPUB follows EPUB 3.3 OCF packaging rules: the exact
`application/epub+zip` mimetype is the first stored entry with no data
descriptor or extra field. Container metadata, package metadata, one required
navigation document, and one reflowable XHTML spine document then stream
through bounded raw DEFLATE. Text is escaped incrementally into a preformatted
block, with carriage returns represented explicitly so XML parsing preserves
the original line endings. No complete text, XHTML document, or EPUB output is
retained in memory. A 16 MiB bounded Web Crypto hash chain derives a stable UUIDv8
from the complete local source so each publication has a persistent identifier
without a second input pass.
Markdown renders a bounded documented subset and escapes raw HTML. The same
single-pass parser can write safe HTML or one semantic XHTML spine document in
a valid EPUB 3.3 package while preserving headings, paragraphs, lists,
blockquotes, rules, fenced code, safe links, emphasis, strong text, and inline
code. A fixed 256 KiB render batch removes per-token destination transitions;
EPUB compression still permits only one 16 KiB destination operation, and a
bounded same-pass hash derives its content-based UUIDv8. Neither route retains
the completed HTML, XHTML, or EPUB. YAML front matter, tables, footnotes, task
lists, definition lists, raw HTML execution, inferred cover art, and publication
metadata are explicitly unsupported. HTML-to-TXT tokenizes the input,
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
PDF is excluded by product scope. HEIC/HEIF, camera raw,
unsupported 7Z codecs, and
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
- service worker eagerly caches only the lightweight same-origin app shell;
  conversion engines are cached lazily on first use, avoiding a 50+ MiB install stall
- same-origin runtime GET responses use the versioned cache; test-mode and
  standalone-validator requests bypass the service worker
- selected files and converted outputs are browser File API objects and never
  pass through `fetch`, Cache Storage, or a service worker
- after an engine's first online conversion, the installed app shell and that
  engine perform the same conversion offline

The direct-save route requires a secure context and the File System Access API.
Current Chrome, Edge, Brave, and Opera are the primary targets. Missing features
produce a visible limited-browser state; there is no full-memory or server-side
fallback.

## Reproducible Wasm builds

Pinned inputs:

- FFmpeg 8.1.2 official source archive, SHA-256
  `464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c`
- OpenCORE AMR 0.1.6 source archive, SHA-256
  `483eb4061088e2b34b358e47540b5d495a96cd468e361050fae615b1809dc4a1`
- LAME 4.0 official source archive, SHA-256
  `3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb`
- libopus 1.6.1 official source archive, SHA-256
  `6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1`
- libogg 1.3.6 official source archive, SHA-256
  `5c8253428e181840cd20d41f3ca16557a9cc04bad4a3d04cce84808677fa1061`
- libvorbis 1.3.7 official source archive, SHA-256
  `b33cc4934322bcbf6efcbacf49e3ca01aadbea4114ec9589d1b1e9d20f72954b`
- libvpx 1.16.0 official source archive, SHA-256
  `7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c`
- bzip2 1.0.8 official source archive, SHA-256
  `ab5a03176ee106d3f0fa90e381da478ddae405918153cca248e682cd0c4a2269`
- XZ Utils 5.8.3 official source archive, SHA-256
  `fff1ffcf2b0da84d308a14de513a1aa23d4e9aa3464d17e64b9714bfdd0bbfb6`
- libarchive 3.8.9 official source archive, SHA-256
  `888c934f9d95648ecb9163dc8e23ab80a476ecb81a8f1154704a227b5b676dde`
- libjxl 0.12.0 commit
  `a7a9c787341cf703dede03c2009fa460cae5e5df`, with pinned Brotli, Highway,
  skcms, libpng 1.6.58, and zlib 1.3.2 inputs recorded in its manifest
- libavif 1.4.1 commit
  `6543b22b5bc706c53f038a16fe515f921556d9b3`, libaom 3.13.2 commit
  `ad44980d7f3c7a2605c25d51ea96946949000841`, and pinned FFmpeg 8.1.2,
  libpng 1.6.58, and zlib 1.3.2 inputs recorded in its manifest
- `emscripten/emsdk:6.0.4-x64` image digest
  `sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b`
- Emscripten SDK 6.0.4 no-Docker installer revision
  `224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f`

The supported no-Docker comparisons run on Linux as fail-independent CI matrix
entries. After the workflow installs and activates the pinned SDK, the exact
commands are:

```bash
source work/emsdk/emsdk_env.sh
bash media/ffmpeg/reproduce-nondocker.sh
bash compression/bzip2/reproduce-nondocker.sh
bash compression/xz/reproduce-nondocker.sh full
bash compression/xz/reproduce-nondocker.sh decoder
bash compression/libarchive7z/reproduce-nondocker.sh
bash images/libtiff/reproduce-nondocker.sh
bash images/libjxl/reproduce-nondocker.sh decoder
bash images/libjxl/reproduce-nondocker.sh encoder
bash images/libavif/reproduce-nondocker.sh decoder
bash images/libavif/reproduce-nondocker.sh encoder
```

Each recipe verifies every archive/revision, rebuilds into repository-local
`work/`, compares the complete published directory byte-for-byte, and removes
scratch/output data on success or failure. FFmpeg run
[`33242017745`](https://github.com/tanishqbaweja/fileconverter/actions/runs/33242017745)
passed in 557 seconds. The fail-independent all-engine run
[`33297796443`](https://github.com/tanishqbaweja/fileconverter/actions/runs/33297796443)
proved SVG, FFmpeg, BZIP2, both XZ variants, 7Z, both JPEG XL variants, and the
AVIF decoder exactly; TIFF passed its targeted transient-download rerun
[`33298467168`](https://github.com/tanishqbaweja/fileconverter/actions/runs/33298467168).
The clean AVIF encoder bytes were separately browser-certified, published, and
reproduced exactly by run
[`33311548748`](https://github.com/tanishqbaweja/fileconverter/actions/runs/33311548748)
after diagnosing the former persistent BuildKit cache as non-reproducible
provenance. No Docker command is part of any supported comparison. The
authoritative job IDs, hashes, diagnosis, profile evidence, and cleanup result
are in `evidence/non-docker-all-engine-repro-2026-08-30.json`; the earlier
FFmpeg-specific source audit remains in
`evidence/non-docker-ffmpeg-repro-audit-2026-08-29.json`.

Build the application and Node-built SVG artifact locally:

```powershell
npm ci
npm run build:svg
npm run build
```

All 11 published engine directories now have executable exact clean no-Docker
reproduction. Legacy container recipes remain only as historical build
documentation and are not required by CI. Exact configure switches and
Emscripten flags are in `media/ffmpeg/`,
`compression/bzip2/`, `compression/xz/`, `compression/libarchive7z/`, and
`images/libtiff/`, `images/libjxl/`, or `images/libavif/`.
Generated settings are recorded in the corresponding
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

The deterministic complex remux fixture is 780,989 bytes with SHA-256
`33d7ac90faed1d7598a5226bb0eae98892e4b4914080915b4902b7acf1f7f65f`.

Chrome was launched as a clean process tree for every retained report. The acceptance
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
| MKV → MP4, 1 MiB shared direct writer (Chrome 152) | 3 | 2,958,573,265 B | 2,962,151,538 B | 249.2 MiB | 44.4 MiB | −22.7–−13.7 MiB |
| MKV → M4A | 3 | 2,958,573,265 B | 249,427,974 B | 164.7 MiB | 32 MiB | −1.1–0.9 MiB |
| MP4 → M4A | 3 | 2,964,855,971 B | 249,427,976 B | 203.3 MiB | 73.8 MiB | −4.0–−0.6 MiB |
| MKV → WAV | 3 | 2,958,573,265 B | 7,107,834,734 B | 178.0 MiB | 32 MiB | −7.2–−4.3 MiB |
| MP4 → WAV | 3 | 2,964,855,971 B | 7,107,834,950 B | 224.1 MiB | 73.8 MiB | −8.1–−4.8 MiB |
| MKV → MPEG-4 MP4 | 3 | 2,958,573,265 B | 3,086,358,463 B | 211.3 MiB | 89.6 MiB | −1.0–7.1 MiB |
| MKV → WebM | 3 | 2,958,573,265 B | 921,524,214 B | 208.8 MiB | 80 MiB | 0.7–6.0 MiB |
| MKV → VP9 WebM | 3 | 181,825,549 B | 65,122,757 B | 244.9 MiB | 88 MiB | 7.2–17.8 MiB |
| MP4 → VP8 WebM | 3 | 147,136,619 B | 5,105,363 B | 226.9 MiB | 64 MiB | 11.4–14.3 MiB |
| MP4 → VP9 WebM | 3 | 147,136,625 B | 4,143,084 B | 237.1 MiB | 64 MiB | 7.4–14.5 MiB |
| MKV → MP4 scale (6 GiB) | 1 clean session | 6,443,020,778 B | 6,448,220,966 B | 194.8 MiB | 40 MiB | 6.1 MiB |
| MKV → MP4 scale (10 GiB) | 1 clean session | 10,737,988,703 B | 10,746,764,442 B | 210.3 MiB | 40 MiB | −14.4 MiB |
| MOV → MP4 | 3 | 149,251,969 B | 149,087,892 B | 168.2 MiB | 40 MiB | 13.1–17.4 MiB |
| MOV → M4A | 3 | 149,251,969 B | 14,557,639 B | 164.5 MiB | 32 MiB | 7.2–15.3 MiB |
| MOV → WAV | 3 | 149,251,969 B | 414,733,404 B | 195.3 MiB | 32 MiB | 2.8–36.0 MiB |
| MOV → VP8 WebM | 3 | 147,136,647 B | 5,100,809 B | 244.4 MiB | 48 MiB | 15.5–44.6 MiB |
| MOV → VP9 WebM | 3 | 147,136,647 B | 4,126,570 B | 236.8 MiB | 64 MiB | 11.5–13.0 MiB |
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
| OGV → VP9 WebM | 3 | 137,635,308 B | 67,478,525 B | 224.1 MiB | 64 MiB | 1.7–4.9 MiB |
| OGV → WAV | 3 | 137,635,308 B | 74,880,078 B | 204.9 MiB | 32 MiB | 12.4–31.6 MiB |
| M2V → MPEG-4 MP4 | 3 | 136,166,136 B | 124,300,753 B | 177.1 MiB | 32 MiB | 1.1–8.3 MiB |
| M2V → VP8 WebM | 3 | 136,166,136 B | 37,835,173 B | 163.9 MiB | 32 MiB | 2.6–6.8 MiB |
| M2V → VP9 WebM | 3 | 136,166,136 B | 44,351,703 B | 223.4 MiB | 56 MiB | −4.4–1.3 MiB |
| M2V → MPEG-TS | 3 | 136,166,136 B | 142,319,760 B | 202.0 MiB | 32 MiB | cleanup passed |
| MKV → M2V | 3 | 136,294,704 B | 136,166,136 B | 207.8 MiB | 32 MiB | cleanup passed |
| MP4 → M2V | 3 | 136,284,917 B | 136,166,136 B | 210.8 MiB | 32 MiB | cleanup passed |
| MOV → M2V | 3 | 136,284,843 B | 136,166,136 B | 210.4 MiB | 32 MiB | cleanup passed |
| AVI → M2V | 3 | 136,465,056 B | 136,166,136 B | 206.2 MiB | 32 MiB | cleanup passed |
| MPEG-TS → M2V | 3 | 142,273,136 B | 136,166,136 B | 198.6 MiB | 32 MiB | cleanup passed |
| M4V → MP4 | 3 | 179,609,473 B | 179,625,924 B | 234.2 MiB | 32 MiB | cleanup passed |
| MKV → M4V | 3 | 180,576,319 B | 179,609,473 B | 211.5 MiB | 32 MiB | cleanup passed |
| MP4 → M4V | 3 | 179,625,218 B | 179,609,473 B | 195.4 MiB | 32 MiB | cleanup passed |
| MOV → M4V | 3 | 179,625,169 B | 179,609,473 B | 198.9 MiB | 32 MiB | cleanup passed |
| AVI → M4V | 3 | 179,650,578 B | 179,609,473 B | 201.9 MiB | 32 MiB | cleanup passed |
| H.264 → MP4 | 3 | 145,801,019 B | 145,812,361 B | 233.9 MiB | 54.4 MiB | cleanup passed |
| H.264 → VP8 WebM | 3 | 145,801,019 B | 4,752,826 B | 239.7 MiB | 40 MiB | cleanup passed |
| H.264 → VP9 WebM | 3 | 145,801,019 B | 3,265,035 B | 243.7 MiB | 56 MiB | cleanup passed |
| MKV → H.264 | 3 | 146,855,294 B | 145,801,019 B | 207.2 MiB | 32 MiB | cleanup passed |
| MP4 → H.264 | 3 | 146,854,557 B | 145,801,019 B | 213.8 MiB | 32 MiB | cleanup passed |
| MOV → H.264 | 3 | 146,854,612 B | 145,801,019 B | 208.3 MiB | 32 MiB | cleanup passed |
| 3GP → H.264 | 3 | 146,854,456 B | 145,801,019 B | 212.8 MiB | 32 MiB | cleanup passed |
| MPEG-TS → H.264 | 3 | 150,441,548 B | 145,810,379 B | 211.5 MiB | 32 MiB | cleanup passed |
| FLV → H.264 | 3 | 146,903,486 B | 145,801,019 B | 209.1 MiB | 32 MiB | cleanup passed |
| MKV → AAC | 3 | 146,855,294 B | 1,037,649 B | 179.9 MiB | 32 MiB | cleanup passed |
| MP4 → AAC | 3 | 146,854,557 B | 1,037,649 B | 175.7 MiB | 32 MiB | cleanup passed |
| MOV → AAC | 3 | 146,854,612 B | 1,037,637 B | 184.7 MiB | 32 MiB | cleanup passed |
| 3GP → AAC | 3 | 146,854,456 B | 1,037,649 B | 186.7 MiB | 32 MiB | cleanup passed |
| MPEG-TS → AAC | 3 | 150,441,548 B | 1,037,546 B | 211.3 MiB | 32 MiB | cleanup passed |
| FLV → AAC | 3 | 146,903,486 B | 1,037,649 B | 184.7 MiB | 32 MiB | cleanup passed |
| MKV → Ogg Vorbis | 3 | 222,125,242 B | 106,739 B | 191.1 MiB | 32 MiB | cleanup passed |
| WebM → Ogg Vorbis | 3 | 222,124,822 B | 106,739 B | 185.0 MiB | 32 MiB | cleanup passed |
| OGV → Ogg Vorbis | 3 | 137,218,662 B | 1,346,492 B | 202.4 MiB | 32 MiB | cleanup passed |
| MKV → Ogg Opus | 3 | 222,942,211 B | 922,267 B | 207.8 MiB | 32 MiB | cleanup passed |
| WebM → Ogg Opus | 3 | 222,941,314 B | 922,267 B | 206.0 MiB | 32 MiB | cleanup passed |
| AAC → M4A | 3 | 134,367,785 B | 133,906,114 B | 179.8 MiB | 32 MiB | 0.2–16.3 MiB |
| AAC → WAV | 3 | 134,367,785 B | 770,273,358 B | 186.5 MiB | 32 MiB | −3.1–−0.7 MiB |
| AAC → FLAC | 3 | 134,367,785 B | 114,800,971 B | 167.1 MiB | 32 MiB | −6.7–−0.8 MiB |
| MKV → FLAC | 3 | 146,855,294 B | 988,027 B | 212.6 MiB | 32 MiB | cleanup passed |
| MP4 → FLAC | 3 | 146,854,557 B | 986,210 B | 214.2 MiB | 32 MiB | cleanup passed |
| MOV → FLAC | 3 | 146,854,612 B | 986,198 B | 213.9 MiB | 32 MiB | cleanup passed |
| 3GP → FLAC | 3 | 146,854,456 B | 986,210 B | 214.7 MiB | 32 MiB | cleanup passed |
| 3GP/AMR-NB → WAV | 3 | 156,907,373 B | 11,520,078 B | 229.2 MiB | 32 MiB | cleanup passed |
| 3GP/AMR-NB → FLAC | 3 | 156,907,373 B | 6,525,834 B | 194.3 MiB | 32 MiB | cleanup passed |
| 3GP/AMR-NB → AIFF | 3 | 156,907,373 B | 11,520,054 B | 226.5 MiB | 32 MiB | cleanup passed |
| 3GP/AMR-NB → MP3 | 3 | 156,907,373 B | 11,521,300 B | 197.5 MiB | 32 MiB | cleanup passed |
| 3GP/AMR-NB → Opus | 3 | 156,907,373 B | 5,850,664 B | 196.8 MiB | 32 MiB | cleanup passed |
| 3GP/AMR-NB → Ogg Vorbis | 3 | 156,907,373 B | 1,329,515 B | 214.9 MiB | 32 MiB | cleanup passed |
| MPEG-TS → FLAC | 3 | 150,441,548 B | 987,948 B | 211.6 MiB | 32 MiB | cleanup passed |
| FLV → FLAC | 3 | 146,903,486 B | 988,027 B | 210.7 MiB | 32 MiB | cleanup passed |
| AVI → FLAC | 3 | 159,500,442 B | 1,017,396 B | 223.3 MiB | 32 MiB | cleanup passed |
| OGV → FLAC | 3 | 137,218,662 B | 10,205,021 B | 213.1 MiB | 32 MiB | cleanup passed |
| ALAC M4A → WAV | 3 | 140,941,469 B | 153,600,128 B | 227.1 MiB | 32 MiB | 12.0–28.9 MiB |
| ALAC M4A → FLAC, fresh-session repeat | 3 | 140,941,469 B | 138,185,793 B | 230.4 MiB | 32 MiB | 9.5–38.7 MiB |
| WAV → ALAC M4A | 3 | 153,600,106 B | 140,941,506 B | 200.2 MiB | 32 MiB | 13.5–40.0 MiB |
| FLAC → ALAC M4A | 3 | 138,185,686 B | 140,941,506 B | 199.1 MiB | 32 MiB | 11.8–43.8 MiB |
| WMA2 → WAV | 3 | 142,503,082 B | 364,798,078 B | 190.7 MiB | 32 MiB | 4.5–34.3 MiB |
| WMA2 → FLAC | 3 | 142,503,082 B | 326,238,814 B | 191.2 MiB | 32 MiB | −0.6–4.7 MiB |
| WAV → WMA2 | 3 | 153,600,104 B | 60,000,756 B | 150.2 MiB | 32 MiB | 5.8–41.4 MiB |
| FLAC → WMA2 | 3 | 138,186,536 B | 60,000,756 B | 159.9 MiB | 32 MiB | 0.8–5.1 MiB |
| AAC M4A → WMA2 | 3 | 134,807,097 B | 303,139,894 B | 167.6 MiB | 32 MiB | cleanup passed |
| ALAC M4A → WMA2 | 3 | 140,941,469 B | 60,001,031 B | 192.4 MiB | 32 MiB | cleanup passed |
| Raw AAC → WMA2 | 3 | 134,367,785 B | 300,890,144 B | 164.8 MiB | 32 MiB | cleanup passed |
| MP3 → WMA2 | 3 | 136,002,312 B | 255,002,360 B | 152.1 MiB | 32 MiB | cleanup passed |
| AIFF → WMA2 | 3 | 201,600,102 B | 157,501,560 B | 177.2 MiB | 32 MiB | cleanup passed |
| Ogg Vorbis → WMA2 | 3 | 144,431,506 B | 172,503,065 B | 148.3 MiB | 32 MiB | cleanup passed |
| Ogg Opus → WMA2 | 3 | 147,964,541 B | 172,503,065 B | 166.1 MiB | 32 MiB | cleanup passed |
| MKV/AAC → WMA2 | 3 | 146,855,294 B | 4,880,823 B | 211.2 MiB | 32 MiB | 1.42-1.74 s |
| MP4/AAC → WMA2 | 3 | 146,854,557 B | 4,880,823 B | 205.3 MiB | 32 MiB | 1.30-1.67 s |
| MOV/AAC → WMA2 | 3 | 146,854,612 B | 4,880,799 B | 197.8 MiB | 32 MiB | 1.44-1.73 s |
| 3GP/AAC → WMA2 | 3 | 146,854,456 B | 4,880,823 B | 200.9 MiB | 32 MiB | 1.31-1.78 s |
| MPEG-TS/AAC → WMA2 | 3 | 150,441,548 B | 4,880,665 B | 215.7 MiB | 32 MiB | 1.57-2.06 s |
| FLV/AAC → WMA2 | 3 | 146,903,486 B | 4,880,702 B | 182.7 MiB | 32 MiB | 1.29-1.91 s |
| AVI/MP3 → WMA2 | 3 | 159,500,442 B | 4,867,872 B | 215.1 MiB | 32 MiB | 1.32-1.78 s |
| OGV/Vorbis → WMA2 | 3 | 137,218,662 B | 58,503,065 B | 201.7 MiB | 32 MiB | 4.96-5.61 s |
| WebM/Opus → WMA2 | 3 | 222,941,314 B | 4,503,065 B | 237.5 MiB | 32 MiB | 1.62-2.19 s |
| MKV/AAC → AIFF | 3 | 146,855,294 B | 6,244,406 B | 215.9 MiB | 32 MiB | 1.08-1.41 s |
| MP4/AAC → AIFF | 3 | 146,854,557 B | 6,242,390 B | 210.3 MiB | 32 MiB | 1.11-1.39 s |
| MOV/AAC → AIFF | 3 | 146,854,612 B | 6,242,390 B | 208.7 MiB | 32 MiB | 1.10-1.49 s |
| 3GP/AAC → AIFF | 3 | 146,854,456 B | 6,242,390 B | 197.7 MiB | 32 MiB | 1.06-1.34 s |
| MPEG-TS/AAC → AIFF | 3 | 150,441,548 B | 6,244,406 B | 219.1 MiB | 32 MiB | 1.32-1.97 s |
| FLV/AAC → AIFF | 3 | 146,903,486 B | 6,244,406 B | 210.1 MiB | 32 MiB | 1.01-1.47 s |
| AVI/MP3 → AIFF | 3 | 159,500,442 B | 6,227,792 B | 205.3 MiB | 32 MiB | 1.05-1.48 s |
| OGV/Vorbis → AIFF | 3 | 137,218,662 B | 74,880,054 B | 207.4 MiB | 32 MiB | 2.10-2.61 s |
| WebM/Opus → AIFF | 3 | 222,941,314 B | 5,760,054 B | 213.2 MiB | 32 MiB | 1.46-1.70 s |
| WebM/Opus → WAV | 3 | 222,941,314 B | 5,760,078 B | 190.4 MiB | 32 MiB | 1.36-1.78 s |
| WebM/Opus → FLAC | 3 | 222,941,314 B | 888,268 B | 214.8 MiB | 32 MiB | 1.66-1.91 s |
| WebM/Opus → AMR-NB | 3 | 222,941,314 B | 96,038 B | 227.5 MiB | 32 MiB | 2.10-2.29 s |
| WebM/Opus → MP3 | 3 | 222,941,314 B | 960,813 B | 227.0 MiB | 32 MiB | 1.91-2.59 s |
| WebM/Opus → AAC-LC | 3 | 222,941,314 B | 621,779 B | 183.7 MiB | 32 MiB | 3.91-4.50 s |
| AMR-NB to WAV | 3 | 134,229,414 B | 1,342,294,158 B | 209.7 MiB | 32 MiB | cleanup passed |
| AMR-NB to FLAC | 3 | 134,229,414 B | 760,765,211 B | 166.0 MiB | 32 MiB | cleanup passed |
| AMR-WB `.awb` to WAV | 3 | 137,420,809 B | 1,441,792,078 B | 201.3 MiB | 32 MiB | 72.32-76.10 s |
| AMR-WB `.awb` to FLAC | 3 | 137,420,809 B | 531,051,566 B | 159.8 MiB | 32 MiB | 122.94-125.22 s |
| AMR-WB `.awb` to MP3 | 3 | 137,420,809 B | 360,449,037 B | 172.9 MiB | 32 MiB | 196.35-200.97 s |
| AMR-WB `.awb` to AIFF | 3 | 137,420,809 B | 1,441,792,054 B | 214.9 MiB | 32 MiB | 71.72-73.45 s |
| AMR-WB `.awb` to Opus | 3 | 137,420,809 B | 346,683,480 B | 180.2 MiB | 32 MiB | 152.87-154.81 s |
| AMR-WB `.awb` to AAC-LC | 3 | 137,420,809 B | 380,256,896 B | 209.8 MiB | 32 MiB | 459.75-583.09 s |
| AMR-WB `.awb` to Ogg Vorbis | 3 | 137,420,809 B | 182,985,148 B | 151.0 MiB | 32 MiB | 221.03-232.91 s |
| AIFF PCM to FLAC | 3 | 220,800,108 B | 32,365,732 B | 207.2 MiB | 32 MiB | read 262,144 B / write 8,344 B |
| Ogg Vorbis to FLAC | 3 | 144,431,506 B | 397,265,921 B | 198.4 MiB | 32 MiB | read 262,144 B / write 16,617 B |
| Ogg Opus to FLAC | 3 | 147,964,541 B | 386,531,887 B | 194.4 MiB | 32 MiB | read 262,144 B / write 16,213 B |
| AAC M4A to AIFF | 3 | 36,929,878 B | 201,601,126 B | 195.4 MiB | 32 MiB | 3.94-4.38 s |
| ALAC M4A to AIFF | 3 | 140,941,469 B | 153,600,102 B | 226.2 MiB | 32 MiB | 5.22-5.86 s |
| Raw AAC to AIFF | 3 | 134,367,785 B | 770,273,334 B | 172.8 MiB | 32 MiB | 12.85-13.47 s |
| AMR-NB to AIFF | 3 | 134,229,414 B | 1,342,294,134 B | 195.1 MiB | 32 MiB | 65.92-66.64 s |
| MP3 to AIFF | 3 | 50,401,224 B | 201,600,102 B | 165.8 MiB | 32 MiB | 5.00-5.96 s |
| FLAC to AIFF | 3 | 138,185,686 B | 153,600,102 B | 209.5 MiB | 32 MiB | 3.10-3.59 s |
| WAV to AIFF | 3 | 153,600,106 B | 153,600,102 B | 172.5 MiB | 32 MiB | 1.60-2.10 s |
| WMA2 to AIFF | 3 | 142,503,082 B | 364,798,054 B | 179.0 MiB | 32 MiB | 7.03-7.38 s |
| Ogg Vorbis to AIFF | 3 | 144,431,506 B | 441,600,054 B | 169.0 MiB | 32 MiB | 9.63-10.03 s |
| Ogg Opus to AIFF | 3 | 147,964,541 B | 441,600,054 B | 180.2 MiB | 32 MiB | 19.00-19.65 s |
| AAC M4A to Ogg Vorbis | 3 | 36,929,878 B | 3,723,084 B | 160.9 MiB | 32 MiB | 18.54-19.25 s |
| ALAC M4A to Ogg Vorbis | 3 | 140,941,469 B | 12,155,861 B | 201.0 MiB | 32 MiB | 19.07-19.45 s |
| Raw AAC to Ogg Vorbis | 3 | 134,367,785 B | 17,146,674 B | 165.1 MiB | 32 MiB | 63.17-64.10 s |
| AMR-NB to Ogg Vorbis | 3 | 134,229,414 B | 154,581,919 B | 156.0 MiB | 32 MiB | 239.78-243.43 s |
| MP3 to Ogg Vorbis | 3 | 50,401,224 B | 3,710,193 B | 164.0 MiB | 32 MiB | 20.05-20.48 s |
| FLAC to Ogg Vorbis | 3 | 138,185,686 B | 12,155,741 B | 158.0 MiB | 32 MiB | 17.07-17.81 s |
| WAV to Ogg Vorbis | 3 | 153,600,106 B | 12,155,741 B | 160.6 MiB | 32 MiB | 16.12-16.44 s |
| WMA2 to Ogg Vorbis | 3 | 142,503,082 B | 28,839,568 B | 155.3 MiB | 32 MiB | 38.79-39.21 s |
| AIFF to Ogg Vorbis | 3 | 201,600,102 B | 3,730,840 B | 164.0 MiB | 32 MiB | 17.92-18.14 s |
| Ogg Opus to Ogg Vorbis | 3 | 147,964,541 B | 36,194,998 B | 159.8 MiB | 32 MiB | 57.51-58.47 s |
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

The 10 GiB row's **210.3 MiB is incremental Chrome private memory**, not the
converted-file size. That production-browser remux genuinely read
10,737,988,703 bytes and wrote 10,746,764,442 bytes in 92.853 seconds; the full
output was hashed, packet-traversed, independently validated, and then deleted.

The current direct-writer core was also compared with the ordinary 256 KiB core
on the exact protected 2,958,573,265-byte source in Chrome 152. Both three-run
sets produced the same 2,962,151,538-byte SHA-256 output. The retained 1 MiB
specialist's median was 36.064 seconds (82.14 MB/s), versus 43.141 seconds
(68.66 MB/s) for the candidate: 16.4% less elapsed time and 19.6% more
throughput. Both stayed below 250 MiB with one pending write. The slower
candidate was reverted and its converted outputs and bulky reports were
deleted after the compact comparison was recorded in
`evidence/remux-performance-audit-2026-08-28.json`.

A historical Chrome 150 report completed an older engine build in 17.42–23.30
seconds, but its output bytes/hash differ from the current build and the browser
version also changed. It is therefore not treated as a controlled candidate for
the current A/B. Investigating that historical build/browser performance gap
remains open under P-08 rather than being mislabeled as a proven regression in
one component.

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
| Images, tiled TIFF -> PNG | 50,338,032 B | 164.1 MiB | native PNG decode, dimensions, SSIM 1.0 against streamed reference |
| Images, JPEG XL -> PNG | 630,393 B | 202.4 MiB | exact repeatable PNG hash, native decode, dimensions, SSIM 1.0 |
| Images, animated JPEG XL -> PNG ZIP | 1,315,111 B | 229.1 MiB | repeatable ZIP hash; all eight frames exactly match independent native decode; timing manifest |
| Images, PNG -> JPEG XL | 780,611 B | 223.0 MiB | repeatable lossless JXL hash; native decode, dimensions, SSIM 1.0 |
| Images, AVIF -> JPEG XL | 100,464 B | 244.0 MiB | repeatable lossless JXL hash of Chromium-decoded pixels; independent native decode and dimensions |
| Images, BMP -> JPEG XL | 24,883,254 B | 224.0 MiB | bounded direct BMP rows; repeatable exact lossless JXL pixels and native decode |
| Images, animated GIF -> JPEG XL | 281,853 B | 222.0 MiB | eight exact RGBA frames; exact 250 ms timing, microsecond timebase, infinite loop, repeatable output |
| Images, WebP -> AVIF | 28,496 B | 240.7 MiB | repeatable genuine AV1 image; native decode, dimensions, visual fidelity |
| Images, animated GIF -> AVIF | 281,853 B | 237.5 MiB | repeatable all-frame AVIF; exact 250 ms timing, microsecond timebase, infinite loop, alpha validation |
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
| Archives, TAR.BZ2 -> ZIP | 270,592,763 B | 190.5 MiB | 3-run native entry size/SHA-256 validation |
| Compression, bytes -> XZ | 268,435,456 B | 172.7 MiB | independent Python LZMA decode and SHA-256 |
| Compression, XZ -> bytes | 268,448,840 B | 203.0 MiB | exact streamed output SHA-256 |
| Archives, TAR -> TAR.XZ | 268,436,992 B | 175.0 MiB | streamed USTAR validation plus independent Python LZMA decode/SHA-256 |
| Archives, TAR.XZ -> TAR | 268,449,796 B | 173.7 MiB | streamed USTAR validation and exact SHA-256 |
| Archives, TAR.XZ -> ZIP | 268,449,796 B | 228.8 MiB | 3-run native entry size/SHA-256 validation |
| Archives, TAR.GZ -> TAR.BZ2 | 268,517,551 B | 168.7 MiB | 3-run native entry size/SHA-256 validation |
| Archives, TAR.GZ -> TAR.XZ | 268,517,551 B | 191.6 MiB | 3-run native entry size/SHA-256 validation |
| Archives, TAR.BZ2 -> TAR.GZ | 270,592,763 B | 183.9 MiB | 3-run native entry size/SHA-256 validation |
| Archives, TAR.BZ2 -> TAR.XZ | 270,592,763 B | 195.9 MiB | 3-run native entry size/SHA-256 validation |
| Archives, TAR.XZ -> TAR.GZ | 268,449,796 B | 239.9 MiB | 3-run native entry size/SHA-256 validation |
| Archives, TAR.XZ -> TAR.BZ2 | 268,449,796 B | 209.4 MiB | 3-run native entry size/SHA-256 validation |
| Archives, TAR -> 7Z | 268,436,992 B | 216.9 MiB | 3-run adaptive COPY/LZMA2 gate plus native entry size/SHA-256 |
| Archives, 7Z -> TAR | 268,435,574 B | 199.8 MiB | native libarchive listing plus entry size/SHA-256 |
| Archives, 7Z -> TAR.GZ | 268,435,574 B | 222.7 MiB | native libarchive listing plus entry size/SHA-256 |
| Archives, 7Z -> ZIP | 268,435,574 B | 218.3 MiB | independent ZIP entry size/SHA-256 |
| Archives, ZIP -> TAR | 268,517,517 B | 194.4 MiB | libarchive entry size/SHA-256 |
| Archives, ZIP -> TAR.GZ | 268,517,517 B | 194.5 MiB | libarchive entry size/SHA-256 |
| Archives, ZIP -> TAR.BZ2 | 268,517,517 B | 160.6 MiB | 3-run native entry size/SHA-256 validation |
| Archives, ZIP -> TAR.XZ | 268,517,517 B | 195.7 MiB | 3-run native entry size/SHA-256 validation |
| Archives, TAR.GZ -> ZIP | 268,517,551 B | 201.1 MiB | libarchive entry size/SHA-256 |
| Subtitles, WebVTT -> TTML | 73,788,904 B | 204.5 MiB | exact streamed output hash |
| Documents, TXT -> DOCX | 67,130,000 B | 148.0 MiB | ZIP CRC/OOXML structure plus streamed SAX text SHA-256 |
| Documents, TXT -> ODT | 67,130,000 B | 161.1 MiB | ODF ZIP/mimetype/manifest structure plus streamed SAX text SHA-256 |
| Ebooks, TXT -> EPUB | 67,130,000 B | 135.5 MiB | EPUB OCF/package/navigation structure plus streamed SAX text SHA-256 |
| Documents, Markdown -> HTML | 141,110,000 B | 194.6 MiB | exact streamed output hash |
| Ebooks, Markdown -> EPUB | 141,110,000 B | 198.9 MiB | EPUB OCF/package/navigation/XHTML structure plus streamed SHA-256 |
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

The six container-to-FLAC routes share one optimized stress-fixture pass: a
single 65-second high-bitrate H.264/AAC encode is stream-copied into MKV, MP4,
MOV, 3GP, MPEG-TS, and FLV. All six 146.9–150.4 MB sources are generated in
3.89 seconds under `fixtures/stress`. Eighteen Chrome conversions completed in
1.21–1.98 seconds at 210.7–214.7 MiB worst incremental private memory, produced
repeatable FLAC, passed independent decoded-audio validation, and left no
generated source or converted copy after category cleanup.

AVI/MP3 and OGV/Vorbis FLAC extraction reuse two codec-specific stress
fixtures generated concurrently in about 11 seconds. The OGV generator was
reduced from roughly 19 seconds to 10.63 seconds by using Vorbis quality 0 while
stream-copying the 137 MB Theora payload. A fully copied Vorbis experiment was
rejected because repeated codec-delay samples produced 782.587 seconds of FLAC
from 780 seconds of timestamps; that failure remains retained. The continuous
Vorbis fixture passed 3/3 in 3.39–3.75 seconds at 213.1 MiB; AVI passed in
1.26–1.60 seconds at 223.3 MiB. Every source and output was removed after
validation.

The H.264 elementary gate reuses one optimized fixture pass: a single
65-second high-bitrate encode is remuxed into six containers and extracted to
a 145,801,019-byte Annex B stream. All seven >128 MiB sources were generated
under `fixtures/stress` in 6.26 seconds. H.264-to-MP4 passed 3/3 in
1.75–2.26 seconds at 233.9 MiB; VP8 passed in 9.46–9.87 seconds at 239.7 MiB;
and VP9 passed in 13.77–14.18 seconds at 243.7 MiB, retaining 6.3 MiB of
headroom below the unchanged limit. The six extraction routes passed in
1.60–3.09 seconds at 207.2–213.8 MiB. Independent validation fully decoded
every output, checked VP8/VP9 visual similarity, and proved that each raw
extraction retained all 1,560 decoded frames. Forced-write tests removed every
partial output, and category cleanup deleted the large sources and converted
copies.

The MPEG-2 elementary gate builds one 136,166,136-byte M2V source and remuxes
five containers concurrently under `fixtures/stress`; all six sources are ready
in 3.78 seconds. Direct M2V-to-MPEG-TS
wrapping passed 3/3 in 1.96–2.30 seconds at 202.0 MiB worst incremental private
memory. MKV, MP4, MOV, AVI, and MPEG-TS extraction passed 3/3 in 1.68–2.31
seconds at 198.6–210.8 MiB. Every run retained one pending write, 262,144-byte
maximum reads, 32 MiB Wasm, byte-repeatable output, and complete independent
decode of all 11,904 frames. Six forced-write cases removed their partial OPFS
outputs. The category's intentionally expensive full-decode validation remains
separate from conversion timing, and cleanup deletes all generated container
sources and converted copies.

The MPEG-4 Part 2 elementary gate continuously encodes one 179,609,473-byte,
60-second, 1,920×1,080 B-frame M4V source in 5.36 seconds and creates the four
container variants concurrently; the complete five-source set was ready in
6.39 seconds. Direct M4V-to-MP4 packet copy passed 3/3 in 1.80–2.25 seconds at
234.2 MiB worst incremental private memory. MKV, MP4, MOV, and AVI extraction
passed 3/3 in 1.63–2.10 seconds at 195.4–211.5 MiB. All fifteen outputs were
byte-repeatable, independently probed, fully decoded through all 1,440 frames,
and removed. Reads and writes stayed at or below 262,144 bytes, only one write
was pending, and Wasm stayed at 32 MiB. The direct-copy design is the fastest
lossless path because it performs no video decode or re-encode.

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

The container-to-WMA2 gate reuses that fixed 48 kHz, 320 kbit/s encoder without
adding another Wasm module or worker. Nine certified AAC, MP3, Vorbis, and Opus
container inputs passed 27/27 conversions in 1.29-5.61 seconds. Complete-Chrome
incremental private memory ranged from 182.7 to 237.5 MiB. Every output was
byte-repeatable, genuine ASF/WMA2, fully decoded and ASDR-validated; reads stayed
at or below 262,144 bytes, writes and queueing at 3,200 bytes, and one operation
was pending. Parallel shared-fixture generation keeps the category fast, and its
`finally` cleanup removed about 1.93 GiB of generated media, every converted
copy, and the Chrome profile while retaining only compact reports.

The container-to-AIFF gate reuses the fixed profile-28 PCM decoder and direct
writer without another Wasm module or worker. Nine AAC, MP3, Vorbis, and Opus
container variants passed 27/27 conversions in 1.01-2.61 seconds at 197.7-219.1
MiB complete-Chrome incremental private memory. Every output was byte-repeatable,
genuine signed 16-bit big-endian AIFF, fully traversed and decoded-audio
PSNR-validated; reads stayed at or below 262,144 bytes, writes and queueing at
16,384 bytes, and one operation was pending. Category cleanup removed about
1.93 GiB of generated media, every converted copy, and the Chrome profile.

The optimized WebM/Opus audio gate reuses those existing output profiles and
the same one-worker, 32 MiB Wasm core. WAV, FLAC, AMR-NB, MP3, and AAC-LC each
passed three isolated complete-Chrome runs on a 222,941,314-byte AV1/Opus WebM
in 1.36-4.50 seconds. Worst incremental private memory was 227.5 MiB, leaving
22.5 MiB below the fixed cap. Every output was byte-repeatable, fully decoded,
and independently PSNR- or ASDR-validated; reads stayed at 262,144 bytes or
less, writes at 16,384 bytes or less, and only one operation was pending. An
exact fixture filter generates only the AV1/Opus source and its WebM packet-copy
derivative, reducing peak category media from about 1.93 GiB to about 446 MiB.
The category finalizer deleted both large fixtures, all outputs, and the Chrome
profile while retaining only compact reports.

The container-to-M4A/AMR completion gate uses the same one-worker, 32 MiB
Wasm core and direct destination writer. AVI/MP3-to-M4A passed three Chrome
runs in 1.83-2.22 seconds at 228.4 MiB worst incremental private memory;
OGV/Vorbis-to-M4A passed in 18.74-19.57 seconds at 181.6 MiB; and
WebM/Opus-to-M4A passed in 3.82-4.39 seconds at 229.5 MiB. The M4A outputs are
fragmented AAC-LC, byte-repeatable, fully decoded, and ASDR-validated. Direct
3GP/AMR-NB packet extraction passed in 2.56-2.73 seconds at 205.4 MiB with the
exact compressed-packet SHA-256 retained. All routes bounded reads to 262,144
bytes, writes to at most 75,641 bytes, queueing to one operation, and deleted
their generated sources and converted copies in category cleanup.

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

The AIFF-output gate ran ten source cases three times each, including separate
AAC and ALAC M4A fixtures. Conversion times ranged from 1.60-2.10 seconds for
153,600,106-byte WAV to 65.92-66.64 seconds for the 134,229,414-byte AMR-NB
source; the other eight cases completed in 3.10-19.65 seconds. Worst complete
Chrome incremental private memory was 226.2 MiB for ALAC, leaving 23.8 MiB
below the unchanged limit. Every result probed as AIFF/PCM S16BE, produced a
repeatable hash, kept reads to 262,144 bytes and writes/queueing to at most
32,768 bytes, held one operation at a time, and passed full decoded PCM SHA-256
or APSNR validation. The category reused already generated repository-local
fixtures instead of spending another 520 seconds regenerating them, then its
`finally` cleanup deleted every generated media source, converted copy, and
Chrome profile while retaining the compact tracked JSON manifests and reports
as the durable evidence record.

The AMR-NB-output gate ran ten isolated source cases three times each,
including separate AAC and ALAC M4A fixtures. All 30 conversions passed on
36,929,878-201,600,102-byte sources in 7.67-41.99 seconds. Worst complete-Chrome
incremental private memory was 217.0 MiB, leaving 33.0 MiB below the unchanged
limit. Every result was byte-repeatable, probed as genuine 8 kHz mono AMR-NB
MR122, fully decoded and frame-counted by native FFmpeg, kept reads at or below
262,144 bytes, writes and queueing at 32 bytes, one operation in flight, one
worker, and 32 MiB Wasm. Focused ASDR checks passed all nine public routes. A
hot-path fix now skips `av_audio_fifo_realloc` whenever the preallocated FIFO
already has enough space; this removed the measured MP3 allocation failure and
avoids needless reallocations for all audio conversions. Five independent
fixture jobs run concurrently, reducing generation from roughly 520 seconds to
218.48 seconds (about 58%), and targeted reruns generate only requested inputs.
Generated sources, converted copies, Chrome profiles, and reproducibility build
directories are repository-local and removed by the category or manual cleanup;
only compact manifests and pass/fail reports remain.

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
The separate VP9 core passed three runs per source with byte-repeatable output:
MKV completed in 329.00–330.04 seconds at 244.9 MiB worst incremental private
memory, OGV in 97.19–97.53 seconds at 224.1 MiB, and M2V in 68.34–69.32 seconds
at 223.4 MiB. Every output was independently probed as VP9 WebM, midpoint-SSIM
checked, and fully decoded. The 4-thread VP9 configuration improved the M2V
benchmark by 19.2%; limiting only high-resolution decoding to two threads kept
the MKV path below the 96 MiB Wasm ceiling while preserving four-thread encode.
The same core converted the final 147.1 MiB MP4 source in 14.80–15.36 seconds
at 237.1 MiB and MOV in 14.67–15.17 seconds at 236.8 MiB. Two rejected MP4
fixture topologies measured 254.5–268.5 MiB; the final 1,282-pixel source
exercises the core's two-thread high-resolution decoder while leaving all four
VP9 encoder threads active, cutting the passing profile by 17.4–31.4 MiB
without relaxing the 250 MiB process-tree limit or encode settings.
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

The committed extended TIFF fixtures are reproducible with native FFmpeg and
the pinned Python packages in `scripts/requirements-tiff-fixtures.txt`.
`npm run fixtures:images` regenerates the small correctness matrix;
`npm run fixtures:animated-transparent` regenerates the tiny deterministic APNG
and WebP fixtures used to verify GIF alpha, disposal, timing, and finite loops;
`npm run fixtures:tiff-stress` streams the large tiled fixture and its
independent PNG reference inside `fixtures/stress/images`.

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
npm run profile:gif-output
npm run profile:gif-output-static
npm run profile:webp-output
npm run profile:tiff
npm run profile:jxl
npm run profile:records
npm run profile:subtitles
npm run profile:archives
npm run profile:bzip2
npm run profile:xz
npm run profile:sevenzip
npm run profile:category -- archive-transcode
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

`npm run audit:public-evidence` checks the current registry against the retained
local stress reports. `npm run evidence:public:write` refreshes the tracked,
compact `evidence/public-profile-evidence.json` index only after that raw audit
passes. Fresh CI checkouts run `npm run audit:public-evidence:manifest` to verify
the indexed 388 route IDs, tested sizes, report hashes, repeatability, and memory
peaks against the current registry without committing hundreds of bulky raw
reports. `npm run audit:engine-reproducibility` similarly ensures that every
published engine directory has a reproducible build entry.

The corrected partitioned hosted baseline is recorded in
`evidence/hosted-ci-audit-2026-08-28.json`. GitHub Actions run `33182400184`
passed the production build, lint, TypeScript, unit/evidence gates, 13 privacy
and offline cases, and all 871 conversion/validator cases split into 152 image,
484 media, and 235 streaming tests. The engine audit now covers declarations and
executable exact clean no-Docker rebuilds for all 11 published directories. The
all-engine job IDs, source inputs, output hashes, AVIF provenance diagnosis, and
cleanup are recorded in
`evidence/non-docker-all-engine-repro-2026-08-30.json`.
The integrated main-branch gate is GitHub Actions run
[`33252270830`](https://github.com/tanishqbaweja/fileconverter/actions/runs/33252270830):
all seven jobs passed, including 871 browser conversions and both exact
no-Docker engine comparisons.
The final all-engine branch gate is run
[`33312105530`](https://github.com/tanishqbaweja/fileconverter/actions/runs/33312105530):
all 16 jobs passed, including 13/13 privacy/offline tests, all 871 browser
conversions, and exact clean no-Docker reproduction for every one of the 11
published engine directories. All failure-artifact uploads were skipped and the
run retains zero artifacts.

## Repository map

- `app/` — interface, runtime capability display, PWA registration, cleanup UI
- `lib/capability-registry.ts` — single source for formats and public matrix
- `workers/` — bounded media, compression, archive, subtitle, image, record, XML, ebook, and document
  transforms; FFmpeg bridge, destinations, and lifecycle
- `media/ffmpeg/`, `compression/bzip2/`, `compression/xz/`, and `compression/libarchive7z/` — reproducible native Wasm builds
- `public/engines/` — auditable generated engine artifacts
- `evidence/` — compact tracked indexes derived from retained local evidence
- `scripts/` — fixtures, validators, cleanup, process-tree memory reports
- `tests/browser/` — correctness, privacy, offline, and bounded-I/O tests
- `worker/` — production security headers and static application handler

## Licensing

Application code is project-owned. FFmpeg licensing depends on the exact
configured components; this version-3 build excludes GPL/nonfree switches and
is LGPL-3.0-or-later. LAME is LGPL-2.0-or-later, OpenCORE AMR is Apache-2.0 licensed, and libopus, libogg, libvorbis, and libvpx are
BSD-3-Clause licensed, bzip2 carries its permissive upstream license, and the
linked liblzma core is 0BSD.
Deployers must still review FFmpeg's LGPL terms, the
bundled third-party notices, and any codec patent obligations applicable to
their jurisdiction and distribution model.

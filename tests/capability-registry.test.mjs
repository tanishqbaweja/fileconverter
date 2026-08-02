import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  conversionProfiles,
  detectFormat,
  formats,
  publicProfilesFor,
} from "../lib/capability-registry.ts";

test("registry contains no PDF input, output, or route", () => {
  assert.equal(
    formats.some(
      (format) =>
        format.id === "pdf" ||
        format.extensions.includes("pdf") ||
        format.mimeTypes.includes("application/pdf"),
    ),
    false,
  );
  assert.equal(
    conversionProfiles.some(
      (profile) => profile.input === "pdf" || profile.output === "pdf",
    ),
    false,
  );
});

test("normal selector exposes only public profiles with passed evidence", () => {
  for (const format of formats) {
    for (const profile of publicProfilesFor(format.id, false)) {
      assert.equal(profile.public, true);
      assert.equal(profile.automatedTestStatus, "passed");
      assert.equal(typeof profile.maxTestedBytes, "number");
      assert.ok(profile.maxTestedBytes > 0);
    }
  }
});

test("every profile references registered formats", () => {
  const ids = new Set(formats.map((format) => format.id));
  for (const profile of conversionProfiles) {
    assert.ok(ids.has(profile.input), `missing input ${profile.input}`);
    assert.ok(ids.has(profile.output), `missing output ${profile.output}`);
  }
});

test("every FFmpeg profile is declared by the reproducible Wasm manifest", () => {
  const manifest = JSON.parse(
    readFileSync("public/engines/remux/build-manifest.json", "utf8"),
  );
  const declared = new Set(manifest.profiles);
  for (const profile of conversionProfiles.filter((candidate) =>
    candidate.engine.startsWith("ffmpeg-"),
  )) {
    assert.ok(declared.has(profile.id), `manifest missing ${profile.id}`);
  }
  assert.ok(manifest.maximumWasmMemoryBytes <= 128 * 1024 * 1024);
  assert.equal(manifest.largeFileMemfs, false);
  assert.equal(manifest.outstandingWrites, 1);
  assert.deepEqual(manifest.modules, [
    {
      name: "within-remux",
      wasmPthreadPoolSize: 0,
      videoCodecThreads: 1,
      profiles: ["stream-copy", "audio"],
    },
    {
      name: "within-direct",
      wasmPthreadPoolSize: 0,
      videoCodecThreads: 1,
      avioOutputBufferBytes: 1024 * 1024,
      profiles: ["mkv-to-mp4-direct-save"],
    },
    {
      name: "within-mpeg4",
      wasmPthreadPoolSize: 4,
      videoCodecThreads: 2,
      profiles: ["mkv-to-mp4-mpeg4", "m2v-to-mp4-mpeg4"],
    },
    {
      name: "within-webm",
      wasmPthreadPoolSize: 8,
      videoCodecThreads: 4,
      profiles: [
        "mkv-to-webm",
        "mp4-to-webm",
        "mov-to-webm",
        "3gp-to-webm",
        "mpeg-ts-to-webm",
        "flv-to-webm",
        "avi-to-webm",
        "ogv-to-webm",
        "m2v-to-webm",
      ],
    },
    {
      name: "within-vp9",
      wasmPthreadPoolSize: 8,
      videoCodecThreads: 4,
      profiles: [
        "mkv-to-webm-vp9",
        "mp4-to-webm-vp9",
        "mov-to-webm-vp9",
        "3gp-to-webm-vp9",
        "mpeg-ts-to-webm-vp9",
        "flv-to-webm-vp9",
        "avi-to-webm-vp9",
        "ogv-to-webm-vp9",
        "m2v-to-webm-vp9",
      ],
    },
  ]);
  assert.ok(manifest.enabledEncoders.includes("libvpx_vp9"));
});

test("every BZIP2 profile is declared by its fixed-memory Wasm manifest", () => {
  const manifest = JSON.parse(
    readFileSync("public/engines/bzip2/build-manifest.json", "utf8"),
  );
  const profiles = conversionProfiles.filter(
    (profile) =>
      profile.engine === "bzip2-wasm" ||
      (profile.engine === "archive-codec-pipeline" &&
        (profile.input === "tar-bz2" || profile.output === "tar-bz2")) ||
      (profile.engine === "compression-codec-pipeline" &&
        (profile.input === "bzip2" || profile.output === "bzip2")),
  );
  assert.deepEqual(
    profiles.map((profile) => profile.id),
    manifest.profiles,
  );
  assert.equal(manifest.bzip2Version, "1.0.8");
  assert.equal(manifest.initialWasmMemoryBytes, 8 * 1024 * 1024);
  assert.equal(manifest.maximumWasmMemoryBytes, 8 * 1024 * 1024);
  assert.equal(manifest.inputBufferBytes, 256 * 1024);
  assert.equal(manifest.outputBufferBytes, 64 * 1024);
  assert.equal(manifest.outstandingWrites, 1);
  assert.equal(manifest.compressionBlockSize100k, 1);
});

test("every XZ profile is declared by its fixed-memory Wasm manifest", () => {
  const manifest = JSON.parse(
    readFileSync("public/engines/xz/build-manifest.json", "utf8"),
  );
  const profiles = conversionProfiles.filter(
    (profile) =>
      profile.engine === "xz-wasm" ||
      (profile.engine === "archive-codec-pipeline" &&
        (profile.input === "tar-xz" || profile.output === "tar-xz")) ||
      (profile.engine === "compression-codec-pipeline" &&
        (profile.input === "xz" || profile.output === "xz")),
  );
  assert.deepEqual(
    profiles.map((profile) => profile.id),
    manifest.profiles,
  );
  assert.equal(manifest.xzVersion, "5.8.3");
  assert.equal(manifest.initialWasmMemoryBytes, 48 * 1024 * 1024);
  assert.equal(manifest.maximumWasmMemoryBytes, 48 * 1024 * 1024);
  assert.equal(manifest.decoderMemoryLimitBytes, 32 * 1024 * 1024);
  assert.equal(manifest.inputBufferBytes, 256 * 1024);
  assert.equal(manifest.outputBufferBytes, 64 * 1024);
  assert.equal(manifest.outstandingWrites, 1);
  assert.equal(manifest.compressionPreset, 0);
  assert.equal(manifest.integrityCheck, "CRC64");
});

test("the TAR.XZ to 7Z route uses its compact fixed-memory decoder manifest", () => {
  const manifest = JSON.parse(
    readFileSync("public/engines/xz-decoder/build-manifest.json", "utf8"),
  );
  assert.deepEqual(manifest.profiles, ["tar-xz-to-sevenzip"]);
  assert.equal(manifest.engine, "within-xz-decoder");
  assert.equal(manifest.variant, "decoder-only");
  assert.equal(manifest.xzVersion, "5.8.3");
  assert.equal(manifest.initialWasmMemoryBytes, 24 * 1024 * 1024);
  assert.equal(manifest.maximumWasmMemoryBytes, 24 * 1024 * 1024);
  assert.equal(manifest.decoderMemoryLimitBytes, 16 * 1024 * 1024);
  assert.equal(manifest.inputBufferBytes, 256 * 1024);
  assert.equal(manifest.outputBufferBytes, 64 * 1024);
  assert.equal(manifest.outstandingWrites, 1);
});

test("every 7Z profile is declared by its fixed-memory Wasm manifest", () => {
  const manifest = JSON.parse(
    readFileSync("public/engines/archive7z/build-manifest.json", "utf8"),
  );
  const profiles = conversionProfiles.filter(
    (profile) => profile.engine === "libarchive7z-wasm",
  );
  assert.deepEqual(
    profiles.map((profile) => profile.id),
    manifest.profiles,
  );
  assert.equal(manifest.libarchiveVersion, "3.8.9");
  assert.equal(manifest.initialWasmMemoryBytes, 56 * 1024 * 1024);
  assert.equal(manifest.maximumWasmMemoryBytes, 56 * 1024 * 1024);
  assert.equal(manifest.inputBufferBytes, 256 * 1024);
  assert.equal(manifest.outputBufferBytes, 64 * 1024);
  assert.equal(manifest.outstandingWrites, 1);
  assert.equal(manifest.maximumEntries, 10_000);
  assert.equal(manifest.nameTableSlots, 32_768);
  assert.equal(manifest.maximumExpansionRatio, 100);
  assert.equal(manifest.sequentialUnknownLengthUstarInput, true);
});

test("every TIFF profile is declared by its fixed-memory Wasm manifest", () => {
  const manifest = JSON.parse(
    readFileSync("public/engines/tiff/build-manifest.json", "utf8"),
  );
  const profiles = conversionProfiles.filter(
    (profile) => profile.engine === "libtiff-wasm",
  );
  assert.deepEqual(profiles.map((profile) => profile.id), manifest.profiles);
  assert.equal(manifest.libtiffVersion, "4.7.2");
  assert.equal(manifest.libpngVersion, "1.6.58");
  assert.equal(manifest.zlibVersion, "1.3.2");
  assert.equal(manifest.libjpegTurboVersion, "3.1.4.1");
  assert.equal(manifest.initialWasmMemoryBytes, 40 * 1024 * 1024);
  assert.equal(manifest.maximumWasmMemoryBytes, 40 * 1024 * 1024);
  assert.equal(manifest.inputBufferBytes, 256 * 1024);
  assert.equal(manifest.outputBufferBytes, 64 * 1024);
  assert.equal(manifest.maximumStripBytes, 4 * 1024 * 1024);
  assert.equal(manifest.maximumDecodedBlockBytes, 4 * 1024 * 1024);
  assert.equal(manifest.maximumTileStripeBytes, 4 * 1024 * 1024);
  assert.deepEqual(manifest.readCompressions, [
    "none",
    "packbits",
    "lzw",
    "deflate",
    "jpeg",
  ]);
  assert.equal(manifest.outstandingWrites, 1);
});

test("the SVG profile is declared by its pinned bounded Wasm manifest", () => {
  const manifest = JSON.parse(
    readFileSync("public/engines/svg/build-manifest.json", "utf8"),
  );
  const profiles = conversionProfiles.filter(
    (profile) => profile.engine === "svg-browser",
  );
  assert.deepEqual(profiles.map((profile) => profile.id), manifest.profiles);
  assert.equal(manifest.resvgWasmVersion, "2.6.2");
  assert.equal(manifest.wasmBytes, 2_478_606);
  assert.equal(
    manifest.wasmSha256,
    "22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70",
  );
  assert.equal(manifest.maximumInputBytes, 4 * 1024 * 1024);
  assert.equal(manifest.maximumOutputBytes, 64 * 1024 * 1024);
  assert.equal(manifest.maximumPixels, 8_388_608);
  assert.equal(manifest.maximumElements, 10_000);
  assert.equal(manifest.outputWriteChunkBytes, 256 * 1024);
  assert.equal(manifest.outstandingWrites, 1);
});

test("compound archives and mainstream images are detected by filename", () => {
  assert.equal(
    detectFormat({ name: "backup.tar.gz", type: "application/gzip" }),
    "tar-gz",
  );
  assert.equal(
    detectFormat({ name: "backup.TAR.BZ2", type: "application/x-bzip2" }),
    "tar-bz2",
  );
  assert.equal(detectFormat({ name: "payload.BZ2", type: "" }), "bzip2");
  assert.equal(
    detectFormat({ name: "backup.TAR.XZ", type: "application/x-xz" }),
    "tar-xz",
  );
  assert.equal(detectFormat({ name: "payload.XZ", type: "" }), "xz");
  assert.equal(detectFormat({ name: "backup.7Z", type: "" }), "sevenzip");
  assert.equal(detectFormat({ name: "scan.TIFF", type: "" }), "tiff");
  assert.ok(
    publicProfilesFor("bzip2", true).some(
      (profile) => profile.id === "bzip2-decompress",
    ),
  );
  assert.ok(
    publicProfilesFor("xz", true).some(
      (profile) => profile.id === "xz-decompress",
    ),
  );
  assert.ok(
    publicProfilesFor("zip").some(
      (profile) => profile.id === "zip-to-tar-gz",
    ),
  );
  assert.ok(
    publicProfilesFor("sevenzip").some(
      (profile) => profile.id === "sevenzip-to-tar-gz",
    ),
  );
  assert.ok(
    publicProfilesFor("sevenzip").some(
      (profile) => profile.id === "sevenzip-to-tar-bz2",
    ),
  );
  assert.ok(
    publicProfilesFor("sevenzip").some(
      (profile) => profile.id === "sevenzip-to-tar-xz",
    ),
  );
  assert.ok(
    publicProfilesFor("sevenzip").some(
      (profile) => profile.id === "sevenzip-to-zip",
    ),
  );
  assert.ok(
    publicProfilesFor("tar-gz").some(
      (profile) => profile.id === "tar-gz-to-zip",
    ),
  );
  assert.equal(detectFormat({ name: "photo.JPG", type: "" }), "jpeg");
  assert.equal(detectFormat({ name: "still.webp", type: "" }), "webp");
  assert.equal(detectFormat({ name: "animation.GIF", type: "" }), "gif");
  assert.equal(detectFormat({ name: "legacy-video.OGM", type: "" }), "ogv");
  assert.equal(detectFormat({ name: "elementary.M2V", type: "" }), "m2v");
  assert.equal(detectFormat({ name: "audio.ADTS", type: "" }), "aac");
  assert.equal(detectFormat({ name: "legacy-audio.WMA", type: "" }), "wma");
  assert.equal(detectFormat({ name: "voice-note.AMR", type: "" }), "amr");
  assert.deepEqual(
    conversionProfiles
      .filter((profile) => profile.input === "amr" || profile.output === "amr")
      .map((profile) => profile.id)
      .sort(),
    ["amr-to-flac", "amr-to-wav"],
  );
  assert.ok(
    publicProfilesFor("amr").some(
      (profile) => profile.id === "amr-to-wav",
    ),
  );
  assert.equal(
    formats.find((format) => format.id === "wma")?.extensions[0],
    "wma",
  );
  assert.deepEqual(
    conversionProfiles
      .filter((profile) => profile.input === "wma" || profile.output === "wma")
      .map((profile) => profile.id)
      .sort(),
    ["flac-to-wma", "wav-to-wma", "wma-to-flac", "wma-to-wav"],
  );
  assert.ok(
    publicProfilesFor("wma").some((profile) => profile.id === "wma-to-wav"),
  );
  assert.ok(
    publicProfilesFor("wav").some((profile) => profile.id === "wav-to-wma"),
  );
  assert.deepEqual(
    ["aiff", "ogg", "opus"].map((input) =>
      publicProfilesFor(input).some(
        (profile) => profile.id === `${input}-to-flac`,
      ),
    ),
    [true, true, true],
  );
  assert.equal(detectFormat({ name: "lossless.M4A", type: "audio/mp4" }), "m4a");
  assert.equal(
    formats.find((format) => format.id === "alac")?.extensions[0],
    "m4a",
  );
  assert.ok(
    publicProfilesFor("wav", true).some(
      (profile) => profile.id === "wav-to-alac",
    ),
  );
  assert.equal(detectFormat({ name: "photo.avif", type: "" }), "avif");
  assert.equal(detectFormat({ name: "vector.SVG", type: "" }), "svg");
  assert.equal(detectFormat({ name: "legacy.BMP", type: "" }), "bmp");
  assert.equal(detectFormat({ name: "application.ICO", type: "" }), "ico");
  assert.ok(
    publicProfilesFor("png").some((profile) => profile.id === "png-to-ico"),
  );
  assert.ok(
    publicProfilesFor("bmp").some((profile) => profile.id === "bmp-to-ico"),
  );
  assert.equal(detectFormat({ name: "records.json", type: "" }), "json");
  assert.equal(detectFormat({ name: "document.xml", type: "" }), "xml");
  assert.equal(detectFormat({ name: "report.DOCX", type: "" }), "docx");
  assert.ok(
    publicProfilesFor("docx").some(
      (profile) => profile.id === "docx-to-txt",
    ),
  );
  assert.equal(detectFormat({ name: "ledger.XLSX", type: "" }), "xlsx");
  assert.ok(
    publicProfilesFor("xlsx", true).some(
      (profile) => profile.id === "xlsx-to-csv",
    ),
  );
  assert.equal(detectFormat({ name: "briefing.PPTX", type: "" }), "pptx");
  assert.ok(
    publicProfilesFor("pptx", true).some(
      (profile) => profile.id === "pptx-to-txt",
    ),
  );
  assert.equal(detectFormat({ name: "report.ODT", type: "" }), "odt");
  assert.equal(detectFormat({ name: "ledger.ODS", type: "" }), "ods");
  assert.equal(detectFormat({ name: "briefing.ODP", type: "" }), "odp");
  assert.equal(detectFormat({ name: "clip.MOV", type: "" }), "mov");
  assert.ok(
    publicProfilesFor("mov").some((profile) => profile.id === "mov-to-mp4"),
  );
  assert.ok(
    publicProfilesFor("mov").some((profile) => profile.id === "mov-to-m4a"),
  );
  assert.ok(
    publicProfilesFor("mov").some((profile) => profile.id === "mov-to-wav"),
  );
  assert.equal(detectFormat({ name: "mobile.3GPP", type: "" }), "3gp");
  assert.ok(
    publicProfilesFor("3gp").some(
      (profile) => profile.id === "3gp-to-mp4",
    ),
  );
  assert.ok(
    publicProfilesFor("3gp").some(
      (profile) => profile.id === "3gp-to-m4a",
    ),
  );
  assert.ok(
    publicProfilesFor("3gp").some(
      (profile) => profile.id === "3gp-to-wav",
    ),
  );
  assert.deepEqual(
    publicProfilesFor("3gp", true)
      .filter((profile) => profile.output === "webm" || profile.output === "webm-vp9")
      .map((profile) => profile.id),
    ["3gp-to-webm", "3gp-to-webm-vp9"],
  );
  assert.equal(detectFormat({ name: "broadcast.M2TS", type: "" }), "mpeg-ts");
  assert.ok(
    publicProfilesFor("mpeg-ts").some(
      (profile) => profile.id === "mpeg-ts-to-mp4",
    ),
  );
  assert.ok(
    publicProfilesFor("mpeg-ts").some(
      (profile) => profile.id === "mpeg-ts-to-m4a",
    ),
  );
  assert.ok(
    publicProfilesFor("mpeg-ts").some(
      (profile) => profile.id === "mpeg-ts-to-wav",
    ),
  );
  assert.deepEqual(
    publicProfilesFor("mpeg-ts", true)
      .filter((profile) => profile.output === "webm" || profile.output === "webm-vp9")
      .map((profile) => profile.id),
    ["mpeg-ts-to-webm", "mpeg-ts-to-webm-vp9"],
  );
  assert.equal(detectFormat({ name: "legacy.F4V", type: "" }), "flv");
  assert.ok(
    publicProfilesFor("flv").some(
      (profile) => profile.id === "flv-to-mp4",
    ),
  );
  assert.ok(
    publicProfilesFor("flv").some(
      (profile) => profile.id === "flv-to-m4a",
    ),
  );
  assert.ok(
    publicProfilesFor("flv").some(
      (profile) => profile.id === "flv-to-wav",
    ),
  );
  assert.deepEqual(
    publicProfilesFor("flv", true)
      .filter((profile) => profile.output === "webm" || profile.output === "webm-vp9")
      .map((profile) => profile.id),
    ["flv-to-webm", "flv-to-webm-vp9"],
  );
  assert.equal(detectFormat({ name: "legacy.DIVX", type: "" }), "avi");
  assert.ok(
    publicProfilesFor("avi").some(
      (profile) => profile.id === "avi-to-mp4",
    ),
  );
  assert.ok(
    publicProfilesFor("avi").some(
      (profile) => profile.id === "avi-to-wav",
    ),
  );
  assert.deepEqual(
    publicProfilesFor("avi")
      .filter((profile) => profile.output === "webm" || profile.output === "webm-vp9")
      .map((profile) => profile.id),
    ["avi-to-webm", "avi-to-webm-vp9"],
  );
  for (const input of ["mkv", "mp4", "mov", "3gp", "mpeg-ts", "flv"]) {
    assert.ok(
      publicProfilesFor(input).some(
        (profile) => profile.id === `${input}-to-flac`,
      ),
    );
  }
  for (const input of ["avi", "ogv"]) {
    assert.ok(
      publicProfilesFor(input).some(
        (profile) => profile.id === `${input}-to-flac`,
      ),
    );
  }
  assert.ok(publicProfilesFor("odt").some((profile) => profile.id === "odt-to-txt"));
  assert.ok(publicProfilesFor("ods").some((profile) => profile.id === "ods-to-csv"));
  assert.ok(publicProfilesFor("odp").some((profile) => profile.id === "odp-to-txt"));
  assert.ok(publicProfilesFor("csv").some((profile) => profile.id === "csv-to-json"));
  assert.ok(publicProfilesFor("tsv").some((profile) => profile.id === "tsv-to-json"));
  assert.ok(publicProfilesFor("json").some((profile) => profile.id === "json-to-csv"));
  assert.ok(publicProfilesFor("json").some((profile) => profile.id === "json-to-tsv"));
  assert.equal(detectFormat({ name: "book.EPUB", type: "" }), "epub");
  assert.ok(
    publicProfilesFor("epub").some(
      (profile) => profile.id === "epub-to-txt",
    ),
  );
  assert.ok(
    publicProfilesFor("xml").some(
      (profile) => profile.id === "xml-to-ndjson",
    ),
  );
  assert.equal(detectFormat({ name: "captions.SSA", type: "" }), "ass");
  assert.equal(detectFormat({ name: "track.MP3", type: "" }), "mp3");
  assert.equal(detectFormat({ name: "lossless.flac", type: "" }), "flac");
  assert.equal(detectFormat({ name: "master.AIFF", type: "" }), "aiff");
  assert.equal(detectFormat({ name: "voice.ogg", type: "" }), "ogg");
  assert.equal(detectFormat({ name: "voice.opus", type: "" }), "opus");
  assert.equal(detectFormat({ name: "movie.MP4", type: "" }), "mp4");
  assert.ok(
    publicProfilesFor("mp4").some((profile) => profile.id === "mp4-to-m4a"),
  );
  assert.ok(
    publicProfilesFor("mp4").some((profile) => profile.id === "mp4-to-wav"),
  );
  assert.ok(
    publicProfilesFor("mp4").some((profile) => profile.id === "mp4-to-webm"),
  );
  assert.ok(
    publicProfilesFor("mp4").some(
      (profile) => profile.id === "mp4-to-webm-vp9",
    ),
  );
  assert.ok(
    publicProfilesFor("mov").some((profile) => profile.id === "mov-to-webm"),
  );
  assert.ok(
    publicProfilesFor("mov").some(
      (profile) => profile.id === "mov-to-webm-vp9",
    ),
  );
  assert.ok(
    publicProfilesFor("mkv").some(
      (profile) => profile.id === "mkv-to-mp4-mpeg4",
    ),
  );
});

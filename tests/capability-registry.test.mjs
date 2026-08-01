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
      profiles: ["mkv-to-webm", "ogv-to-webm", "m2v-to-webm"],
    },
  ]);
});

test("compound archives and mainstream images are detected by filename", () => {
  assert.equal(
    detectFormat({ name: "backup.tar.gz", type: "application/gzip" }),
    "tar-gz",
  );
  assert.ok(
    publicProfilesFor("zip").some(
      (profile) => profile.id === "zip-to-tar-gz",
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
    publicProfilesFor("mkv").some(
      (profile) => profile.id === "mkv-to-mp4-mpeg4",
    ),
  );
});

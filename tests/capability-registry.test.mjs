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
    },
    {
      name: "within-webm",
      wasmPthreadPoolSize: 8,
      videoCodecThreads: 4,
    },
  ]);
});

test("compound archives and mainstream images are detected by filename", () => {
  assert.equal(
    detectFormat({ name: "backup.tar.gz", type: "application/gzip" }),
    "tar-gz",
  );
  assert.equal(detectFormat({ name: "photo.JPG", type: "" }), "jpeg");
  assert.equal(detectFormat({ name: "still.webp", type: "" }), "webp");
  assert.equal(detectFormat({ name: "animation.GIF", type: "" }), "gif");
  assert.equal(detectFormat({ name: "photo.avif", type: "" }), "avif");
  assert.equal(detectFormat({ name: "legacy.BMP", type: "" }), "bmp");
  assert.equal(detectFormat({ name: "records.json", type: "" }), "json");
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
});

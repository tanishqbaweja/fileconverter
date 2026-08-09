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

test("MPEG-2 elementary routes expose only their measured evidence", () => {
  const expected = new Map([
    ["m2v-to-mpeg-ts", 136_166_136],
    ["mkv-to-m2v", 136_294_704],
    ["mp4-to-m2v", 136_284_917],
    ["mov-to-m2v", 136_284_843],
    ["avi-to-m2v", 136_465_056],
    ["mpeg-ts-to-m2v", 142_273_136],
  ]);
  for (const [id, maxTestedBytes] of expected) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, `missing ${id}`);
    assert.equal(profile.public, true);
    assert.equal(profile.automatedTestStatus, "passed");
    assert.equal(profile.maxTestedBytes, maxTestedBytes);
  }
});

test("M4V elementary routes expose only their measured evidence", () => {
  const expected = new Map([
    ["m4v-to-mp4", 179_609_473],
    ["mkv-to-m4v", 180_576_319],
    ["mp4-to-m4v", 179_625_218],
    ["mov-to-m4v", 179_625_169],
    ["avi-to-m4v", 179_650_578],
  ]);
  for (const [id, maxTestedBytes] of expected) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, `missing ${id}`);
    assert.equal(profile.public, true);
    assert.equal(profile.automatedTestStatus, "passed");
    assert.equal(profile.maxTestedBytes, maxTestedBytes);
  }
});

test("AV1 WebM stream copy is public after its measured evidence passes", () => {
  const profile = conversionProfiles.find(
    (candidate) => candidate.id === "mkv-to-webm-av1",
  );
  assert.ok(profile);
  assert.equal(profile.automatedTestStatus, "passed");
  assert.equal(profile.maxTestedBytes, 222_942_211);
  assert.equal(
    publicProfilesFor("mkv").some(
      (candidate) => candidate.id === "mkv-to-webm-av1",
    ),
    true,
  );
});

test("container MP3 extraction is public after its measured evidence passes", () => {
  const expected = new Map([
    ["mkv", 181_340_062],
    ["mp4", 181_344_111],
    ["mov", 181_344_078],
    ["avi", 182_803_272],
    ["mpeg-ts", 185_645_300],
    ["flv", 181_377_794],
  ]);
  for (const [input, maxTestedBytes] of expected) {
    const id = `${input}-to-mp3`;
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, `missing ${id}`);
    assert.equal(profile.automatedTestStatus, "passed");
    assert.equal(profile.maxTestedBytes, maxTestedBytes);
    assert.equal(
      publicProfilesFor(input).some((candidate) => candidate.id === id),
      true,
    );
  }
});

test("container AAC extraction is public only at its measured evidence limit", () => {
    const measuredBytes = {
      mkv: 146_855_294,
      mp4: 146_854_557,
      mov: 146_854_612,
      "3gp": 146_854_456,
      "mpeg-ts": 150_441_548,
      flv: 146_903_486,
    };
    for (const [input, bytes] of Object.entries(measuredBytes)) {
      const id = `${input}-to-aac`;
      const profile = conversionProfiles.find((candidate) => candidate.id === id);
      assert.ok(profile, `missing ${id}`);
      assert.equal(profile.automatedTestStatus, "passed");
      assert.equal(profile.maxTestedBytes, bytes);
      assert.equal(
        publicProfilesFor(input).some((candidate) => candidate.id === id),
        true,
      );
    }
  });

test("every profile references registered formats", () => {
  const ids = new Set(formats.map((format) => format.id));
  for (const profile of conversionProfiles) {
    assert.ok(ids.has(profile.input), `missing input ${profile.input}`);
    assert.ok(ids.has(profile.output), `missing output ${profile.output}`);
  }
});

test("Ogg-family container extraction is public at its measured evidence limit", () => {
  const measuredBytes = new Map([
    ["mkv-to-ogg", 222_125_242],
    ["webm-to-ogg", 222_124_822],
    ["ogv-to-ogg", 137_218_662],
    ["mkv-to-opus", 222_942_211],
    ["webm-to-opus", 222_941_314],
  ]);
  for (const [id, bytes] of measuredBytes) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, `missing ${id}`);
    assert.equal(profile.automatedTestStatus, "passed");
    assert.equal(profile.maxTestedBytes, bytes);
    assert.equal(
      publicProfilesFor(profile.input).some((candidate) => candidate.id === id),
      true,
    );
  }
});

test("container HEVC extraction is public only at its measured evidence limit", () => {
  for (const id of [
    "mkv-to-hevc",
    "mp4-to-hevc",
    "mov-to-hevc",
    "mpeg-ts-to-hevc",
  ]) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, `missing ${id}`);
    assert.equal(profile.automatedTestStatus, "passed");
    assert.ok(profile.maxTestedBytes >= 128 * 1024 * 1024);
    assert.equal(
      publicProfilesFor(profile.input).some((candidate) => candidate.id === id),
      true,
    );
  }
});

test("Matroska copy routes are public only at their measured evidence limits", () => {
  const measuredBytes = new Map([
    ["mp4-to-mkv", 147_136_623],
    ["mov-to-mkv", 147_136_647],
    ["3gp-to-mkv", 146_854_522],
    ["mpeg-ts-to-mkv", 150_441_548],
    ["flv-to-mkv", 146_903_539],
    ["avi-to-mkv", 159_500_442],
    ["webm-to-mkv", 222_941_314],
    ["ogv-to-mkv", 137_218_662],
  ]);
  for (const [id, maxTestedBytes] of measuredBytes) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, `missing ${id}`);
    assert.equal(profile.automatedTestStatus, "passed");
    assert.equal(profile.maxTestedBytes, maxTestedBytes);
    assert.equal(
      publicProfilesFor(profile.input).some((candidate) => candidate.id === id),
      true,
    );
  }
});

test("container MPEG-TS copy routes are public only at their measured evidence limits", () => {
  const measuredBytes = new Map([
    ["mkv-to-mpeg-ts", 147_131_071],
    ["mp4-to-mpeg-ts", 147_136_623],
    ["mov-to-mpeg-ts", 147_136_646],
    ["3gp-to-mpeg-ts", 146_854_522],
    ["flv-to-mpeg-ts", 146_903_539],
  ]);
  for (const [id, maxTestedBytes] of measuredBytes) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, `missing ${id}`);
    assert.equal(profile.automatedTestStatus, "passed");
    assert.equal(profile.maxTestedBytes, maxTestedBytes);
    assert.equal(
      publicProfilesFor(profile.input).some((candidate) => candidate.id === id),
      true,
    );
  }
});

test("container 3GP copy routes are public only at their measured evidence limits", () => {
  const measuredBytes = new Map([
    ["mkv-to-3gp", 147_131_069],
    ["mp4-to-3gp", 147_136_621],
    ["mov-to-3gp", 147_136_645],
    ["mpeg-ts-to-3gp", 150_441_548],
    ["flv-to-3gp", 146_903_539],
  ]);
  for (const [id, maxTestedBytes] of measuredBytes) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, `missing ${id}`);
    assert.equal(profile.automatedTestStatus, "passed");
    assert.equal(profile.maxTestedBytes, maxTestedBytes);
    assert.equal(
      publicProfilesFor(profile.input).some((candidate) => candidate.id === id),
      true,
    );
  }
});

test("container MOV copy routes are public only at their measured evidence limits", () => {
  const measuredBytes = new Map([
    ["mkv-to-mov", 147_131_073],
    ["mp4-to-mov", 147_136_624],
    ["3gp-to-mov", 146_854_522],
    ["mpeg-ts-to-mov", 150_441_548],
    ["flv-to-mov", 146_903_539],
  ]);
  for (const [id, maxTestedBytes] of measuredBytes) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, `missing ${id}`);
    assert.equal(profile.automatedTestStatus, "passed");
    assert.equal(profile.maxTestedBytes, maxTestedBytes);
    assert.equal(
      publicProfilesFor(profile.input).some((candidate) => candidate.id === id),
      true,
    );
  }
});

test("container FLV copy routes are public only at their measured evidence limits", () => {
  const measuredBytes = new Map([
    ["mkv-to-flv", 147_131_070],
    ["mp4-to-flv", 147_136_622],
    ["mov-to-flv", 147_136_646],
    ["3gp-to-flv", 146_854_522],
    ["mpeg-ts-to-flv", 150_441_548],
  ]);
  for (const [id, maxTestedBytes] of measuredBytes) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, `missing ${id}`);
    assert.equal(profile.automatedTestStatus, "passed");
    assert.equal(profile.maxTestedBytes, maxTestedBytes);
    assert.equal(
      publicProfilesFor(profile.input).some((candidate) => candidate.id === id),
      true,
    );
  }
});

test("ASS output routes are public only at their measured evidence limits", () => {
  for (const [id, maxTestedBytes] of [
    ["srt-to-ass", 67_327_792],
    ["vtt-to-ass", 73_788_904],
  ]) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, `missing ${id}`);
    assert.equal(profile.automatedTestStatus, "passed");
    assert.equal(profile.maxTestedBytes, maxTestedBytes);
    assert.equal(
      publicProfilesFor(profile.input).some((candidate) => candidate.id === id),
      true,
    );
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
      profiles: [
        "stream-copy",
        "audio",
        "h264-extract",
        "hevc-extract",
        "mpeg2-extract",
        "mpeg2-wrap",
        "mpegts-copy",
        "threegp-copy",
        "mov-copy",
        "flv-copy",
        "m4v-extract",
        "m4v-wrap",
        "av1-webm-copy",
        "matroska-copy",
        "mp3-extract",
        "aac-extract",
        "ogg-audio-extract",
      ],
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
        "h264-to-webm",
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
        "h264-to-webm-vp9",
      ],
    },
  ]);
  assert.ok(manifest.enabledEncoders.includes("libvpx_vp9"));
  assert.ok(manifest.enabledDemuxers.includes("h264"));
  assert.ok(manifest.enabledDemuxers.includes("m4v"));
  assert.ok(manifest.enabledMuxers.includes("h264"));
  assert.ok(manifest.enabledMuxers.includes("hevc"));
  assert.ok(manifest.enabledMuxers.includes("mpeg2video"));
  assert.ok(manifest.enabledMuxers.includes("m4v"));
  assert.ok(manifest.enabledMuxers.includes("matroska"));
  assert.ok(manifest.enabledMuxers.includes("mp3"));
  assert.ok(manifest.enabledMuxers.includes("adts"));
  assert.ok(manifest.enabledMuxers.includes("ogg"));
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
  assert.equal(detectFormat({ name: "elementary.AVC", type: "" }), "h264");
  assert.equal(detectFormat({ name: "elementary.H265", type: "" }), "hevc");
  assert.deepEqual(
    publicProfilesFor("h264", true)
      .filter((profile) => profile.input === "h264" || profile.output === "h264")
      .map((profile) => profile.id),
    ["h264-to-mp4", "h264-to-webm", "h264-to-webm-vp9"],
  );
  assert.deepEqual(
    publicProfilesFor("h264")
      .filter((profile) => profile.input === "h264")
      .map((profile) => profile.id),
    ["h264-to-mp4", "h264-to-webm", "h264-to-webm-vp9"],
  );
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
  for (const input of ["mkv", "mp4", "mov", "3gp", "mpeg-ts", "flv"]) {
    assert.ok(
      publicProfilesFor(input).some(
        (profile) => profile.id === `${input}-to-h264`,
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
  assert.equal(detectFormat({ name: "elementary.M4V", type: "video/mp4" }), "m4v");
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

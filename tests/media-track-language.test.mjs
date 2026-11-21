import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectMediaSource,
  MAX_ISO_BMFF_INSPECTION_BYTES,
  MAX_MATROSKA_INSPECTION_BYTES,
} from "../lib/media-source-inspection.ts";

function observedBlob(...parts) {
  const blob = new Blob(parts);
  const reads = [];
  return {
    size: blob.size,
    reads,
    slice(start, end) {
      reads.push([start, end]);
      return blob.slice(start, end);
    },
  };
}

// Handcrafted headers isolate edge cases; the independent real media
// fixture assertions live in media-source-inspection.test.mjs.
function ebml(id, ...parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const size = length < 127
    ? Buffer.from([0x80 + length])
    : length < 16_383
      ? Buffer.from([0x40 + (length >>> 8), length & 0xff])
      : Buffer.from([0x20 + (length >>> 16), (length >>> 8) & 0xff, length & 0xff]);
  return Buffer.concat([Buffer.from(id, "hex"), size, ...parts]);
}

const legacy = (tag) => ebml("22b59c", Buffer.from(tag));
const extended = (tag) => ebml("22b59d", Buffer.from(tag));
const mkvAudio = (...extra) => ebml("ae",
  ebml("83", Buffer.from([2])), ebml("86", Buffer.from("A_AAC")), ...extra,
);
const mkv = (...tracks) => observedBlob(
  ebml("1a45dfa3", ebml("4282", Buffer.from("matroska"))),
  ebml("18538067", ebml("1654ae6b", ...tracks)),
);

function tags(inspection) {
  return inspection.streams.map(({ languageTag }) => languageTag);
}

test("Matroska discloses only direct, complete declared tags and gives extended tags precedence", async () => {
  const source = mkv(
    mkvAudio(),
    mkvAudio(legacy("fre-ca\0")),
    mkvAudio(extended("zh-Hant-TW"), legacy("chi")),
    mkvAudio(ebml("e1", extended("ja-JP")), legacy("eng")),
    mkvAudio(legacy("und")),
  );
  const result = await inspectMediaSource(source, "mkv");
  assert.deepEqual(tags(result), [undefined, "fre-ca", "zh-Hant-TW", "eng", undefined]);
  assert.deepEqual(result.metadataSignals, [
    "Declared languages of inspected tracks: stream 2: fre-ca; stream 3: zh-Hant-TW; stream 4: eng",
  ]);
  assert.deepEqual(source.reads, [[0, source.size]]);
});

test("Matroska never falls back after a duplicate, oversized or unusable overriding tag", async () => {
  const result = await inspectMediaSource(mkv(
    mkvAudio(legacy("eng"), legacy("eng")),
    mkvAudio(legacy("eng"), extended("en-GB"), extended("en-US")),
    mkvAudio(legacy("eng"), extended("en-US\0jpn")),
    mkvAudio(legacy("eng"), extended("en\n")),
    mkvAudio(legacy("eng"), extended("еn-US")), // Cyrillic e.
    mkvAudio(legacy("eng"), extended("x" + "-abcdefgh".repeat(7))),
    mkvAudio(legacy("eng"), extended("und")),
    mkvAudio(legacy("eng"), Buffer.from([0x22, 0xb5, 0x9d])),
    mkvAudio(legacy("eng"), extended("x-private")),
  ), "mkv");
  assert.deepEqual(tags(result), [
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, "x-private",
  ]);
});

test("a Matroska scan cut within a track avoids claiming a legacy language without checking its override", async () => {
  const source = mkv(
    mkvAudio(legacy("eng")),
    mkvAudio(legacy("jpn"), ebml("ec", Buffer.alloc(65_536)), extended("ja-JP")),
  );
  const result = await inspectMediaSource(source, "mkv");
  assert.deepEqual(tags(result), ["eng", undefined]);
  assert.deepEqual(source.reads, [[0, MAX_MATROSKA_INSPECTION_BYTES]]);
});

test("the metadata line bounds the number of displayed tags while keeping their stream association", async () => {
  const result = await inspectMediaSource(mkv(
    mkvAudio(), ...Array.from({ length: 18 }, () => mkvAudio(extended("en-US"))),
  ), "mkv");
  assert.equal(result.streams.length, 19);
  assert.equal(result.streams[18].languageTag, "en-US");
  assert.deepEqual(result.metadataSignals, [
    "Declared languages of inspected tracks: " +
    Array.from({ length: 16 }, (_, index) => `stream ${index + 2}: en-US`).join("; ") + "; 2 more",
  ]);
});

function box(type, ...parts) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + parts.reduce((sum, part) => sum + part.length, 0));
  head.write(type, 4, "ascii");
  return Buffer.concat([head, ...parts]);
}

function packed(tag) {
  return [...tag].reduce((value, char) => (value << 5) | (char.charCodeAt(0) - 0x60), 0);
}

function mdhd(word, version = 0, size = version === 0 ? 24 : 36) {
  const data = Buffer.alloc(size);
  data.writeUInt8(version);
  if (version === 0 && size >= 24) {
    data.writeUInt32BE(48_000, 12);
    data.writeUInt32BE(96_000, 16);
    data.writeUInt16BE(word, 20);
  } else if (version === 1 && size >= 32) {
    data.writeUInt32BE(48_000, 20);
    data.writeBigUInt64BE(96_000n, 24);
    if (size >= 34) data.writeUInt16BE(word, 32);
  }
  return box("mdhd", data);
}

const elng = (tag, { version = 0, flags = 0, terminator = true } = {}) =>
  box("elng", Buffer.from([version, 0, 0, flags]), Buffer.from(terminator ? tag + "\0" : tag));

function isoAudio(header, extras = [], sampleTableBoxes = []) {
  const handler = Buffer.alloc(12);
  handler.write("soun", 8, "ascii");
  const sampleDescription = Buffer.alloc(8);
  sampleDescription.writeUInt32BE(1, 4);
  const sampleEntry = Buffer.alloc(28);
  sampleEntry.writeUInt16BE(2, 16);
  sampleEntry.writeUInt32BE(48_000 * 65_536, 24);
  return box("trak", box("mdia",
    header, ...extras, box("hdlr", handler),
    box("minf", box("stbl", box("stsd", sampleDescription, box("mp4a", sampleEntry)), ...sampleTableBoxes)),
  ));
}

const iso = (...tracks) => observedBlob(box("ftyp", Buffer.from("isom")), box("moov", ...tracks));

test("ISO-BMFF decodes both packed header versions, prefers elng, and ignores non-peers", async () => {
  const source = iso(
    isoAudio(mdhd(packed("jpn"))),
    isoAudio(mdhd(packed("deu"), 1)),
    isoAudio(mdhd(packed("chi")), [elng("zh-Hant")]),
    isoAudio(mdhd(packed("spa")), [], [elng("fr-FR")]),
  );
  const result = await inspectMediaSource(source, "mp4");
  assert.deepEqual(tags(result), ["jpn", "deu", "zh-Hant", "spa"]);
  assert.deepEqual(result.streams.map(({ durationSeconds }) => durationSeconds), [2, 2, 2, 2]);
  assert.deepEqual(result.metadataSignals, [
    "Declared languages of inspected tracks: stream 1: jpn; stream 2: deu; stream 3: zh-Hant; stream 4: spa",
  ]);
  assert.equal(result.inspectedBytes, source.reads.reduce((bytes, [a, b]) => bytes + b - a, 0));
  assert.ok(source.reads.every(([a, b]) => b - a <= 68));
});

test("ISO-BMFF omits ambiguous, unspecified and invalid track-language declarations", async () => {
  const english = mdhd(packed("eng"));
  const source = iso(
    isoAudio(mdhd(11)), // A QuickTime-only code must not be read as Japanese in MP4.
    isoAudio(mdhd(0x8000 | packed("eng"))),
    isoAudio(mdhd(0x7fff)),
    isoAudio(mdhd(packed("eng"), 1, 34)), // Missing reserved field.
    isoAudio(mdhd(packed("und"))),
    isoAudio(english, [mdhd(packed("fra"))]),
    isoAudio(english, [elng("fr-FR"), elng("en-US")]),
    isoAudio(english, [elng("fr-FR", { version: 1 })]),
    isoAudio(english, [elng("fr-FR", { flags: 1 })]),
    isoAudio(english, [elng("fr-FR", { terminator: false })]),
    isoAudio(english, [elng("fr-FR\0en-US")]),
    isoAudio(english, [elng("und")]),
    isoAudio(english, [elng("x" + "-abcdefgh".repeat(7))]),
  );
  const result = await inspectMediaSource(source, "mp4");
  assert.deepEqual(tags(result), Array(13).fill(undefined));
  assert.deepEqual(result.metadataSignals, []);
  assert.equal(result.streams[3].durationSeconds, 2);
});

test("QuickTime legacy numeric tags are restricted to the QuickTime brand", async () => {
  const tracks = [0, 11, 19, 33, 86, 87, 94, 95, 128, 138, 139, 0x7fff].map(
    (word) => isoAudio(mdhd(word)),
  );
  tracks.push(isoAudio(mdhd(0), [elng("en-GB")]));
  const mov = observedBlob(box("ftyp", Buffer.from("qt  ")), box("moov", ...tracks));
  const result = await inspectMediaSource(mov, "mov");
  assert.deepEqual(tags(result), [
    "en", "ja", "zh-Hant", "zh-Hans", undefined, "om", "eo", undefined,
    "cy", "jv-Latn", undefined, undefined, "en-GB",
  ]);
  assert.deepEqual(tags(await inspectMediaSource(iso(...tracks.slice(0, -1)), "mov")),
    Array(tracks.length - 1).fill(undefined));
});

test("optional ISO-BMFF language reads yield to the existing byte ceiling and sample table", async () => {
  const sampleCount = 16_334;
  const sizes = Buffer.alloc(12 + sampleCount * 4);
  sizes.writeUInt32BE(sampleCount, 8);
  for (let i = 0; i < sampleCount; i += 1) sizes.writeUInt32BE(10, 12 + i * 4);
  const source = iso(isoAudio(
    mdhd(packed("eng")), [elng("x" + "-abcdefgh".repeat(6))], [box("stsz", sizes)],
  ));
  const result = await inspectMediaSource(source, "mp4");
  assert.deepEqual(tags(result), [undefined]);
  assert.equal(result.bitrateBps, sampleCount * 40);
  assert.ok(result.inspectedBytes <= MAX_ISO_BMFF_INSPECTION_BYTES);
  assert.ok(MAX_ISO_BMFF_INSPECTION_BYTES - result.inspectedBytes < 60);
  assert.ok(source.reads.some(([a, b]) => b - a === sampleCount * 4));
  assert.ok(!source.reads.some(([a, b]) => b - a === 60));
});

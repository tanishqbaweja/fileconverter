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
  assert.deepEqual(source.reads, [[0, 4096], [4096, MAX_MATROSKA_INSPECTION_BYTES]]);
});

const chapterId = "1043a770", tagsId = "1254c367", attachmentId = "1941a469";
function seek(id, relative, extra = []) {
  const offset = Buffer.alloc(4); offset.writeUInt32BE(relative);
  return ebml("4dbb", ebml("53ab", Buffer.from(id, "hex")), ebml("53ac", offset), ...extra);
}
function lateMetadata({ badOffset, conflict = false, badSize = false, unknownCluster = false } = {}) {
  const tracks = ebml("1654ae6b", mkvAudio(legacy("eng"), ebml(attachmentId, Buffer.from([1]))));
  const realCluster = ebml("1f43b675", Buffer.alloc(70_000));
  const cluster = unknownCluster ? Buffer.concat([Buffer.from("1f43b675ff", "hex"), realCluster.subarray(7)]) : realCluster;
  const chapter = badSize ? Buffer.from("1043a770207fff", "hex") : ebml(chapterId, Buffer.alloc(256, 0xee));
  const tags = ebml(tagsId, Buffer.from([1]));
  const attachments = ebml(attachmentId, Buffer.from([0xaa]));
  const head = (a, b, c) => ebml("114d9b74", seek(chapterId, a), seek(tagsId, b), seek(attachmentId, c),
    ...(conflict ? [seek(chapterId, a + 1)] : []));
  const start = head(0, 0, 0).length + tracks.length + cluster.length;
  const chunk = ebml("18538067", head(badOffset ?? start, start + chapter.length, start + chapter.length + tags.length),
    tracks, cluster, chapter, tags, attachments);
  const envelope = ebml("1a45dfa3", ebml("4282", Buffer.from("matroska")));
  return { source: observedBlob(envelope, chunk), start: envelope.length + 7 + start, chapterSize: chapter.length };
}

test("Matroska checks indexed late chapters, tags and attachments without reading their payloads", async () => {
  const { source, start, chapterSize } = lateMetadata();
  const inspection = await inspectMediaSource(source, "mkv");
  assert.deepEqual(inspection.metadataSignals, ["Indexed chapters header", "Indexed tags header", "Indexed attachments header",
    "Declared languages of inspected tracks: stream 1: eng"]);
  assert.deepEqual(source.reads, [[0, 4096], [start, start + 5], [start + 5, start + 6],
    [start + chapterSize, start + chapterSize + 5], [start + chapterSize + 6, start + chapterSize + 11]]);
  assert.equal(inspection.inspectedBytes, 4112);
});

test("Matroska ignores suspect index positions, conflicting hints and mismatched or oversized headers", async () => {
  const options = [{ badOffset: 0 }, { badOffset: 700 }, { badOffset: 0xffffffff }, { conflict: true }, { badSize: true }, { unknownCluster: true }];
  for (const option of options) {
    const { source } = lateMetadata(option);
    const result = await inspectMediaSource(source, "mkv");
    assert.ok(!result.metadataSignals.some(signal => /^Chapters$|Indexed chapters/i.test(signal)), JSON.stringify(option));
    assert.ok(!result.metadataSignals.includes("Attachments"), "nested lookalike must not prove top-level metadata");
    assert.ok(result.inspectedBytes <= MAX_MATROSKA_INSPECTION_BYTES);
  }
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

function isoSubtitle(type, {
  handler = "sbtl", language = "fra", extendedLanguage, entryCount = 1, entryBytes = 8,
  wrongParent = false, lateHandler = false, trackId = 9,
} = {}) {
  const hdlr = Buffer.alloc(12);
  const stsd = Buffer.alloc(8);
  hdlr.write(handler, 8, "ascii");
  stsd.writeUInt32BE(entryCount, 4);
  const description = box("stsd", stsd, box(type, Buffer.alloc(entryBytes)));
  const table = wrongParent ? description : box("minf", box("stbl", description));
  const parts = [mdhd(packed(language)), table];
  if (lateHandler) parts.push(box("hdlr", hdlr)); else parts.unshift(box("hdlr", hdlr));
  if (extendedLanguage) parts.push(elng(extendedLanguage));
  const tkhd = Buffer.alloc(24);
  tkhd.writeUInt32BE(trackId, 12);
  return box("trak", box("tkhd", tkhd), box("mdia", ...parts));
}

test("ISO-BMFF shows known subtitle framing and languages without reading any cue payload", async () => {
  const ftyp = box("ftyp", Buffer.from("isom"));
  const mdat = box("mdat", Buffer.alloc(200_000));
  const source = observedBlob(ftyp, mdat, box("moov",
    isoSubtitle("tx3g", { lateHandler: true }),
    isoAudio(mdhd(packed("eng"))),
    isoSubtitle("wvtt", { handler: "text", language: "deu", extendedLanguage: "de-AT", trackId: 11 }),
    isoSubtitle("stpp", { handler: "subt", language: "spa", trackId: 15 }),
  ));
  const result = await inspectMediaSource(source, "mp4");
  assert.equal(result.mediaType, "audio");
  assert.equal(result.codec, "AAC");
  assert.deepEqual(result.streams.map(({ mediaType, isoSubtitleSampleEntry }) => [mediaType, isoSubtitleSampleEntry]), [
    ["subtitle", "tx3g"], ["audio", undefined], ["subtitle", "wvtt"], ["subtitle", "stpp"],
  ]);
  assert.deepEqual(tags(result), ["fra", "eng", "de-AT", "spa"]);
  assert.deepEqual(result.streams.map(({ isoTrackId }) => isoTrackId), [9, undefined, 11, 15]);
  assert.ok(result.streams.filter(({ mediaType }) => mediaType === "subtitle")
    .every(s => s.durationSeconds === 2 && s.width === null && s.channels === null));
  assert.ok(source.reads.every(([start, end]) => end <= ftyp.length + 8 || start >= ftyp.length + mdat.length));
  // Three new track IDs add three 8-byte tkhd headers and 24-byte records.
  assert.equal(result.inspectedBytes, 602);
});

test("generic chapter text, ambiguous descriptions and unrelated handlers do not claim subtitle tracks", async () => {
  const result = await inspectMediaSource(iso(
    isoAudio(mdhd(packed("eng"))),
    isoSubtitle("text", { handler: "text" }),
    isoSubtitle("tx3g", { handler: "tmcd" }),
    isoSubtitle("tx3g", { handler: "soun" }),
    isoSubtitle("wvtt", { entryCount: 2 }),
    isoSubtitle("stpp", { entryBytes: 4 }),
    isoSubtitle("tx3g", { wrongParent: true }),
  ), "mp4");
  assert.deepEqual(result.streams.map(({ mediaType }) => mediaType), ["audio"]);
  await assert.rejects(inspectMediaSource(iso(isoSubtitle("tx3g")), "mp4"), /complete audio or video track/);
});

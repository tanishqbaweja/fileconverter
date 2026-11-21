import assert from "node:assert/strict";
import test from "node:test";
import {
  runIsoTimedTextToWebVtt, TIMED_TEXT_READ_BYTES, TIMED_TEXT_WRITE_BYTES,
} from "../workers/iso-timed-text-webvtt.ts";

const word = value => {
  const bytes = Buffer.alloc(4); bytes.writeUInt32BE(value); return bytes;
};
const words = (...values) => Buffer.concat(values.map(word));
const wide = value => {
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(value)); return bytes;
};
const bg = (type, ...parts) => Buffer.concat([word(8 + parts.reduce((n, b) => n + b.length, 0)), Buffer.from(type), ...parts]);
const boxTable = (type, rows) => bg(type, words(0, rows.length), ...rows);
const ftyp = bg("ftyp", Buffer.from("isom"), word(0));
const scaleBox = (type, scale) => bg(type, Buffer.alloc(12), word(scale), Buffer.alloc(8));
const sample = (text, extra = Buffer.alloc(0)) => {
  const value = Buffer.from(text);
  const length = Buffer.alloc(2); length.writeUInt16BE(value.length);
  return Buffer.concat([length, value, extra]);
};

function makeTrack({
  samples, offsets, deltas = samples.map(() => 1000), rule = [1, samples.length, 1],
  trackId = 7, timescale = 1000, wideOffsets = false, edit, compact = false,
  external = false, invalidIndex = false, sttsRows = deltas.map(delta => words(1, delta)),
}) {
  const hdlr = bg("hdlr", words(0, 0), Buffer.from("sbtl"));
  const tx3g = Buffer.alloc(38); tx3g.writeUInt16BE(invalidIndex ? 2 : 1, 6);
  const tables = bg("stbl",
    boxTable("stsd", [bg("tx3g", tx3g)]),
    boxTable("stsc", [words(...rule)]),
    boxTable("stts", sttsRows),
    bg("stsz", words(0, 0, samples.length), ...samples.map(s => word(s.length))),
    boxTable(wideOffsets ? "co64" : "stco", offsets.map(wideOffsets ? wide : word)),
    ...(compact ? [bg("stz2")] : []),
  );
  const references = bg("dinf", boxTable("dref", [bg("url ", word(external ? 0 : 1))]));
  return bg("trak", bg("tkhd", Buffer.alloc(12), word(trackId)), ...(edit ? [edit] : []),
    bg("mdia", scaleBox("mdhd", timescale), hdlr, bg("minf", references, tables)));
}

function fixture(samples, options = {}) {
  const { second, extraBoxes = [], movieScale = 1000, offsets = [ftyp.length + 8] } = options;
  const tracks = [makeTrack({ samples, offsets, ...options })];
  if (second !== undefined) tracks.push(makeTrack({ samples, offsets, ...options, trackId: second }));
  return Buffer.concat([ftyp, bg("mdat", ...samples), bg("moov", scaleBox("mvhd", movieScale), ...tracks), ...extraBoxes]);
}

async function convert(input, { track, abort, cancelAfterWrites, failWrite, onRead } = {}) {
  const readSizes = [], readRanges = [], writeSizes = [], chunks = [], warnings = [];
  let pending = 0;
  const runtime = {
    size: input.length,
    assertActive() {
      if (abort?.() || writeSizes.length === cancelAfterWrites) throw new DOMException("Cancelled", "AbortError");
    },
    warn(message) { warnings.push(message); },
    async read(start, length) {
      assert.ok(length <= TIMED_TEXT_READ_BYTES);
      readSizes.push(length);
      readRanges.push([start, length]); onRead?.(start, length);
      return Uint8Array.from(input.subarray(start, start + length));
    },
    async write(bytes) {
      assert.equal(++pending, 1);
      if (failWrite) throw new DOMException("Destination failed", "QuotaExceededError");
      assert.ok(bytes.length <= TIMED_TEXT_WRITE_BYTES);
      chunks.push(Buffer.from(bytes)); writeSizes.push(bytes.length);
      await new Promise(resolve => setImmediate(resolve));
      pending--;
    },
  };
  const result = await runIsoTimedTextToWebVtt(runtime, track);
  return { result, text: Buffer.concat(chunks).toString("utf8"), readSizes, readRanges, writeSizes, warnings };
}

test("decodes UTF-8 and BOM-tagged UTF-16 while ignoring clear samples and escaping cue syntax", async () => {
  const bigEndian = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from("中😀", "utf16le").swap16()]);
  const littleEndian = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("é", "utf16le")]);
  const samples = [
    sample("Hello <&>\r\n\r\nNext --> tail", bg("styl", words(1, 0))),
    sample(""), sample(bigEndian), sample(littleEndian),
  ];
  const r = await convert(fixture(samples, { deltas: [1000, 700, 1500, 800] }));
  assert.deepEqual(r.result, { trackId: 7, samples: 4, cues: 3 });
  assert.equal(r.text,
    "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello &lt;&amp;&gt;\n&nbsp;\nNext --&gt; tail\n\n" +
    "00:00:01.700 --> 00:00:03.200\n中😀\n\n00:00:03.200 --> 00:00:04.000\né\n\n");
  assert.equal(r.warnings.length, 1);
});

test("requires track selection when more than one timed-text track exists", async () => {
  const input = fixture([sample("Chosen")], { second: 19 });
  await assert.rejects(convert(input), /choose an explicit timed-text track ID/);
  assert.equal((await convert(input, { track: 19 })).result.trackId, 19);
  await assert.rejects(convert(input, { track: 2 }), /no matching tx3g/);
});

test("applies a 64-bit leading empty edit and clips media cues using both timescales", async () => {
  const edit = bg("edts", bg("elst", words(0x01000000, 2),
    wide(200), wide(0xffffffffffffffffn), word(0x10000),
    wide(250), wide(24000), word(0x10000)));
  const input = fixture([sample("Clipped first"), sample("Clipped second"), sample("Past edit")],
    { timescale: 48000, movieScale: 200, deltas: [48000, 48000, 48000], edit });
  assert.equal((await convert(input)).text,
    "WEBVTT\n\n00:00:01.000 --> 00:00:01.500\nClipped first\n\n00:00:01.500 --> 00:00:02.250\nClipped second\n\n");
});

test("honors sparse co64 subtitle offsets beyond 4 GiB without reading intervening media", async () => {
  const dataEnd = 5 * 1024 ** 3;
  const cue = sample("Late physical offset");
  const offset = dataEnd - cue.length;
  const head = Buffer.concat([ftyp, word(1), Buffer.from("mdat"), wide(dataEnd - ftyp.length)]);
  const moov = bg("moov", makeTrack({ samples: [cue], offsets: [offset], wideOffsets: true }));
  const sections = [[0, head], [offset, cue], [dataEnd, moov]];
  const reads = [], output = [];
  const result = await runIsoTimedTextToWebVtt({ size: dataEnd + moov.length, assertActive() {}, warn() {},
    async read(start, length) {
      reads.push([start, length]);
      const section = sections.find(([at, bytes]) => start >= at && start + length <= at + bytes.length);
      assert.ok(section, `Unexpected read ${start} + ${length}`);
      return Uint8Array.from(section[1].subarray(start - section[0], start - section[0] + length));
    },
    async write(bytes) { output.push(Buffer.from(bytes)); },
  });
  assert.equal(result.cues, 1);
  assert.equal(Buffer.concat(output).toString(), "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nLate physical offset\n\n");
  assert.ok(reads.reduce((sum, [, length]) => sum + length, 0) < 512);
});

test("caps individual writes and propagates cancellation or destination error", async () => {
  const original = "&".repeat(65535);
  const input = fixture([sample(original)]);
  const r = await convert(input);
  assert.ok(r.writeSizes.length >= 5 && Math.max(...r.writeSizes) === 65536);
  assert.ok(r.text.includes("&amp;".repeat(original.length)));
  await assert.rejects(convert(input, { failWrite: true }), { name: "QuotaExceededError" });
  await assert.rejects(convert(input, { cancelAfterWrites: 1 }), { name: "AbortError" });
  let checks = 0;
  await assert.rejects(convert(input, { abort: () => ++checks === 7 }), { name: "AbortError" });
});

test("sample-size and timing tables are read in fixed windows across thousands of samples", async () => {
  const samples = Array.from({ length: 4_300 }, () => sample(""));
  samples[samples.length - 1] = sample("After both table boundaries");
  const input = fixture(samples, { deltas: samples.map(() => 1) });
  const r = await convert(input);
  assert.equal(r.result.samples, 4_300);
  assert.ok(r.readSizes.filter(length => length === 16_384).length >= 3);
  assert.equal(Math.max(...r.readSizes), 16_384);
  assert.ok(r.readSizes.length < 125, "Thousands of tiny samples must not trigger individual reads");
  assert.equal(r.text, "WEBVTT\n\n00:00:04.299 --> 00:00:04.300\nAfter both table boundaries\n\n");
});

test("coalesces selected samples within each chunk without reading interleaved bytes", async () => {
  const samples = [sample("One"), sample(""), sample("Two"), sample("Three"), sample(""), sample("Four")];
  const left = Buffer.concat(samples.slice(0, 3)), right = Buffer.concat(samples.slice(3));
  const gap = Buffer.alloc(8192, 0x9f);
  const start = ftyp.length + 8, second = start + left.length + gap.length, end = second + right.length;
  const make = offsets => Buffer.concat([ftyp, bg("mdat", left, gap, right),
    bg("moov", makeTrack({ samples, offsets, rule: [1, 3, 1] }))]);
  const actual = await convert(make([start, second]));
  assert.deepEqual(actual.readRanges.filter(([offset]) => offset >= start && offset < end), [[start, left.length], [second, right.length]]);
  assert.equal(actual.result.cues, 4);
  assert.ok(actual.text.includes("00:00:05.000 --> 00:00:06.000\nFour\n\n"));
  const invalidNext = start + left.length - 1;
  await assert.rejects(convert(make([start, invalidNext]), { onRead(offset) {
    assert.ok(offset < start || offset >= end, "Do not read a chunk known to overlap the next one");
  } }), /non-overlapping/);
});

test("larger samples are read once in isolation and never raise the 128 KiB cap", async () => {
  const aboveWindow = sample("Large sample with decorations", Buffer.alloc(90000));
  const small = sample("After large sample");
  const actual = await convert(fixture([aboveWindow, small]));
  const start = ftyp.length + 8;
  assert.deepEqual(actual.readRanges.filter(([offset]) => offset >= start && offset < start + aboveWindow.length + small.length),
    [[start, aboveWindow.length], [start + aboveWindow.length, small.length]]);
  assert.equal(actual.result.cues, 2);
  await assert.rejects(convert(fixture([sample("Out of bounds", Buffer.alloc(TIMED_TEXT_READ_BYTES))])), /bounded sample limit/);
});

test("rejects nonlocal, unindexed, mis-timed, malformed and fragmented samples", async () => {
  const cases = [
    [fixture([sample("Hello")], { external: true }), /only to media data/],
    [fixture([sample("Hello")], { invalidIndex: true }), /external data reference/],
    [fixture([sample("Hello")], { compact: true }), /compact sizes/],
    [fixture([sample("Hello")], { offsets: [8] }), /outside the track's media data/],
    [fixture([sample("A"), sample("B")], { offsets: [ftyp.length + 8, ftyp.length + 8], rule: [1, 1, 1] }), /non-overlapping/],
    [fixture([sample("A")], { sttsRows: [words(2, 1000)] }), /timing sample count/],
    [fixture([sample("Hello")], { timescale: 10000, deltas: [1] }), /positive duration/],
    [fixture([Buffer.from([0, 4, 0x61])]), /text length crosses/],
    [fixture([sample(Buffer.from([0xc0, 0xaf]))]), /invalid UTF-8/],
    [fixture([sample("NUL\0")]), /control character/],
    [fixture([sample("")]), /no visible/],
    [fixture([sample("Hello")], { extraBoxes: [bg("moof")] }), /fragmented/],
  ];
  for (const [input, error] of cases) await assert.rejects(convert(input), error);
});

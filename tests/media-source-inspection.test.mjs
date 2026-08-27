import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  inspectMediaSource,
  MAX_MP3_INSPECTION_BYTES,
  MAX_WAV_INSPECTION_BYTES,
} from "../lib/media-source-inspection.ts";

function wavBlob({
  dataBytes = 2 * 1024 * 1024,
  channels = 2,
  sampleRate = 44_100,
  bitsPerSample = 16,
} = {}) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  const blockAlign = (channels * bitsPerSample) / 8;
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataBytes, 40);
  return new Blob([header, new Uint8Array(dataBytes)], { type: "audio/wav" });
}

function trackingBlob(blob) {
  const reads = [];
  return {
    get size() {
      return blob.size;
    },
    slice(start = 0, end = blob.size, type = "") {
      reads.push([start, Math.min(end, blob.size)]);
      return blob.slice(start, end, type);
    },
    reads,
  };
}

async function trackedFixture(extension) {
  return trackedNamedFixture(`audio-source.${extension}`);
}

async function trackedNamedFixture(name) {
  const bytes = await readFile(new URL(`../fixtures/media/${name}`, import.meta.url));
  return trackingBlob(new Blob([bytes]));
}

test("bounded WAV inspection reports real PCM stream fields", async () => {
  const source = trackingBlob(wavBlob());
  const result = await inspectMediaSource(source, "wav");
  assert.ok(result);
  assert.equal(result.container, "RIFF/WAVE");
  assert.equal(result.codec, "PCM");
  assert.equal(result.sampleRateHz, 44_100);
  assert.equal(result.channels, 2);
  assert.equal(result.channelLayout, "Stereo");
  assert.equal(result.bitsPerSample, 16);
  assert.equal(result.bitrateBps, 1_411_200);
  assert.ok(Math.abs(result.durationSeconds - 11.8886) < 0.001);
  assert.equal(result.inspectedBytes, 44);
  assert.deepEqual(source.reads, [
    [0, 12],
    [12, 20],
    [20, 36],
    [36, 44],
  ]);
});

test("bounded WAV inspection rejects a renamed non-WAVE payload", async () => {
  await assert.rejects(
    inspectMediaSource(new Blob(["not a wave file"]), "wav"),
    /valid RIFF\/RF64 WAVE header/,
  );
});

test("bounded MP3 inspection parses a genuine MPEG-1 Layer III frame", async () => {
  const bytes = new Uint8Array(160_000);
  bytes.set([0xff, 0xfb, 0x90, 0x00], 0);
  bytes.set([0xff, 0xfb, 0x90, 0x00], 417);
  const source = trackingBlob(new Blob([bytes], { type: "audio/mpeg" }));
  const result = await inspectMediaSource(source, "mp3");
  assert.ok(result);
  assert.equal(result.container, "MPEG audio");
  assert.equal(result.codec, "MPEG-1 Layer III (MP3)");
  assert.equal(result.sampleRateHz, 44_100);
  assert.equal(result.channels, 2);
  assert.equal(result.bitrateBps, 128_000);
  assert.ok(Math.abs(result.durationSeconds - 10) < 0.001);
  assert.equal(result.inspectedBytes, MAX_MP3_INSPECTION_BYTES);
  assert.deepEqual(source.reads, [
    [0, 10],
    [0, 4_096],
    [159_872, 160_000],
  ]);
});

test("MP3 inspection rejects an isolated sync word without a second frame", async () => {
  const bytes = new Uint8Array(8_000);
  bytes.set([0xff, 0xfb, 0x90, 0x00], 0);
  await assert.rejects(
    inspectMediaSource(new Blob([bytes]), "mp3"),
    /frame sequence is not structurally consistent/,
  );
});

test("MP3 inspection skips bounded ID3v2 data without reading the tag", async () => {
  const tagBytes = 8_192;
  const bytes = new Uint8Array(32_000);
  bytes.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0x40, 0], 0);
  bytes.set([0xff, 0xfb, 0x90, 0x00], 10 + tagBytes);
  bytes.set([0xff, 0xfb, 0x90, 0x00], 10 + tagBytes + 417);
  const source = trackingBlob(new Blob([bytes]));
  const result = await inspectMediaSource(source, "mp3");
  assert.ok(result);
  assert.deepEqual(result.metadataSignals, ["ID3v2.4 tag"]);
  assert.deepEqual(source.reads, [
    [0, 10],
    [8_202, 12_298],
    [31_872, 32_000],
  ]);
  assert.equal(result.inspectedBytes, MAX_MP3_INSPECTION_BYTES);
});

test("bounded FLAC inspection reads STREAMINFO and metadata headers only", async () => {
  const source = await trackedFixture("flac");
  const result = await inspectMediaSource(source, "flac");
  assert.ok(result);
  assert.equal(result.container, "Native FLAC");
  assert.equal(result.codec, "FLAC");
  assert.equal(result.durationSeconds, 4);
  assert.equal(result.sampleRateHz, 48_000);
  assert.equal(result.channels, 1);
  assert.equal(result.bitsPerSample, 16);
  assert.deepEqual(result.metadataSignals, ["Vorbis comments"]);
  assert.equal(result.inspectedBytes, 50);
  assert.ok(source.reads.every(([start, end]) => end - start <= 34));
});

test("bounded AIFF inspection decodes COMM's 80-bit sample rate", async () => {
  const source = await trackedFixture("aiff");
  const result = await inspectMediaSource(source, "aiff");
  assert.ok(result);
  assert.equal(result.container, "AIFF");
  assert.equal(result.codec, "PCM (big-endian)");
  assert.equal(result.durationSeconds, 4);
  assert.equal(result.bitrateBps, 768_000);
  assert.equal(result.sampleRateHz, 48_000);
  assert.equal(result.channelLayout, "Mono");
  assert.equal(result.bitsPerSample, 16);
  assert.deepEqual(result.metadataSignals, ["Name"]);
  assert.equal(result.inspectedBytes, 54);
  assert.ok(source.reads.every(([start, end]) => end - start <= 22));
});

test("bounded AAC inspection estimates ADTS facts from 32 frame headers", async () => {
  const source = await trackedFixture("aac");
  const result = await inspectMediaSource(source, "aac");
  assert.ok(result);
  assert.equal(result.container, "ADTS");
  assert.equal(result.codec, "AAC LC");
  assert.ok(Math.abs(result.durationSeconds - 4.0282) < 0.0001);
  assert.equal(result.bitrateBps, 268_195);
  assert.equal(result.sampleRateHz, 48_000);
  assert.equal(result.channelLayout, "Stereo");
  assert.equal(result.inspectedBytes, 234);
  assert.ok(source.reads.every(([start, end]) => end - start <= 10));
});

test("renamed payloads are rejected by FLAC, AIFF, and AAC inspection", async () => {
  const payload = new Blob([new Uint8Array(1_024)]);
  await assert.rejects(inspectMediaSource(payload, "flac"), /FLAC signature/);
  await assert.rejects(inspectMediaSource(payload, "aiff"), /AIFF\/AIFC header/);
  await assert.rejects(inspectMediaSource(payload, "aac"), /valid ADTS/);
});

test("bounded Ogg inspection distinguishes genuine Vorbis and Opus", async () => {
  const vorbisSource = await trackedFixture("ogg");
  const vorbis = await inspectMediaSource(vorbisSource, "ogg");
  assert.ok(vorbis);
  assert.equal(vorbis.container, "Ogg");
  assert.equal(vorbis.codec, "Vorbis");
  assert.equal(vorbis.durationSeconds, 4);
  assert.equal(vorbis.bitrateBps, 96_000);
  assert.equal(vorbis.sampleRateHz, 48_000);
  assert.equal(vorbis.channelLayout, "Mono");
  assert.deepEqual(vorbis.metadataSignals, ["Vorbis identification"]);
  assert.equal(vorbis.inspectedBytes, 12_893);

  const opusSource = await trackedFixture("opus");
  const opus = await inspectMediaSource(opusSource, "opus");
  assert.ok(opus);
  assert.equal(opus.container, "Ogg");
  assert.equal(opus.codec, "Opus");
  assert.equal(opus.durationSeconds, 4);
  assert.equal(opus.bitrateBps, 155_362);
  assert.equal(opus.sampleRateHz, 48_000);
  assert.equal(opus.channelLayout, "Mono");
  assert.deepEqual(opus.metadataSignals, ["OpusHead"]);
  assert.equal(opus.inspectedBytes, 67_631);
  assert.ok(opusSource.reads.every(([start, end]) => end - start <= 66 * 1_024));
});

test("bounded AMR inspection reports raw NB and 3GP-contained WB honestly", async () => {
  const narrowSource = await trackedFixture("amr");
  const narrow = await inspectMediaSource(narrowSource, "amr");
  assert.ok(narrow);
  assert.equal(narrow.container, "AMR-NB storage");
  assert.equal(narrow.codec, "AMR-NB");
  assert.ok(Math.abs(narrow.durationSeconds - 4.02) < 0.0001);
  assert.equal(narrow.bitrateBps, 12_200);
  assert.equal(narrow.sampleRateHz, 8_000);
  assert.equal(narrow.channelLayout, "Mono");
  assert.equal(narrow.inspectedBytes, 6_441);

  const wideSource = await trackedNamedFixture("amr-wb-source.awb");
  const wide = await inspectMediaSource(wideSource, "amr-wb");
  assert.ok(wide);
  assert.equal(wide.container, "3GP / ISO-BMFF");
  assert.equal(wide.codec, "AMR-WB");
  assert.equal(wide.durationSeconds, 10.24);
  assert.equal(wide.bitrateBps, 23_850);
  assert.equal(wide.sampleRateHz, 16_000);
  assert.equal(wide.channelLayout, "Mono");
  assert.equal(wide.inspectedBytes, 280);
});

test("bounded ISO-BMFF inspection handles AAC and fragmented ALAC M4A", async () => {
  const aacSource = await trackedFixture("m4a");
  const aac = await inspectMediaSource(aacSource, "m4a");
  assert.ok(aac);
  assert.equal(aac.container, "M4A / ISO-BMFF");
  assert.equal(aac.codec, "AAC");
  assert.ok(Math.abs(aac.durationSeconds - 4.021333) < 0.000001);
  assert.equal(aac.bitrateBps, 125_324);
  assert.equal(aac.sampleRateHz, 48_000);
  assert.equal(aac.channelLayout, "Mono");
  assert.deepEqual(aac.metadataSignals, ["User metadata box"]);
  assert.equal(aac.inspectedBytes, 1_068);

  const alacSource = await trackedNamedFixture("audio-source-alac.m4a");
  const alac = await inspectMediaSource(alacSource, "m4a");
  assert.ok(alac);
  assert.equal(alac.container, "M4A / ISO-BMFF");
  assert.equal(alac.codec, "ALAC");
  assert.equal(alac.durationSeconds, 4);
  assert.equal(alac.bitrateBps, 533_680);
  assert.equal(alac.sampleRateHz, 48_000);
  assert.equal(alac.channelLayout, "Stereo");
  assert.equal(alac.bitsPerSample, 16);
  assert.equal(alac.inspectedBytes, 780);
  assert.ok(alacSource.reads.every(([start, end]) => end - start <= 396));
});

test("renamed payloads are rejected by Ogg, AMR, and ISO-BMFF inspection", async () => {
  const payload = new Blob([new Uint8Array(1_024)]);
  await assert.rejects(inspectMediaSource(payload, "ogg"), /valid Ogg page header/);
  await assert.rejects(inspectMediaSource(payload, "amr"), /valid AMR signature/);
  await assert.rejects(inspectMediaSource(payload, "m4a"), /no ISO-BMFF ftyp box/);
});

test("bounded ASF inspection reports WMA stream rather than container bitrate", async () => {
  const source = await trackedFixture("wma");
  const result = await inspectMediaSource(source, "wma");
  assert.ok(result);
  assert.equal(result.container, "ASF");
  assert.equal(result.codec, "Windows Media Audio 2");
  assert.ok(Math.abs(result.durationSeconds - 4) < 0.000001);
  assert.equal(result.bitrateBps, 320_000);
  assert.equal(result.sampleRateHz, 48_000);
  assert.equal(result.channelLayout, "Stereo");
  assert.deepEqual(result.metadataSignals, [
    "Content description",
    "Extended content description",
  ]);
  assert.equal(result.inspectedBytes, 326);
  assert.ok(source.reads.every(([start, end]) => end - start <= 80));
  await assert.rejects(
    inspectMediaSource(new Blob([new Uint8Array(1_024)]), "wma"),
    /valid ASF header object/,
  );
});

test("unsupported formats do not pretend to have detailed inspection", async () => {
  assert.equal(await inspectMediaSource(new Blob(["a,b\n1,2\n"]), "csv"), null);
});

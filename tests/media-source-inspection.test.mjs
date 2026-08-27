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
  const bytes = await readFile(
    new URL(`../fixtures/media/audio-source.${extension}`, import.meta.url),
  );
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

test("unsupported formats do not pretend to have detailed inspection", async () => {
  assert.equal(await inspectMediaSource(new Blob(["a,b\n1,2\n"]), "csv"), null);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareLongPcm16, LONG_AUDIO_FIDELITY_LIMITS } from "../scripts/lib/long-audio-fidelity.mjs";
const pcm = values => { const bytes = Buffer.alloc(values.length * 2); values.forEach((value, index) => bytes.writeInt16LE(value, index * 2)); return bytes; };
async function* chunks(bytes, size) { for (let at = 0; at < bytes.length; at += size) yield bytes.subarray(at, at + size); }
test("long independent PCM checker consumes every sample across unrelated odd/even chunk boundaries with exact full digests", async () => {
  const a = pcm([1000, -1000, 0, 20, -32768, 32767, 50, 99]), b = pcm([1001, -999, 0, 21, -32768, 32766, 52, 99]);
  for (const [left, right] of [[1, 7], [3, 2], [16, 5]]) {
    const result = await compareLongPcm16(chunks(a, left), chunks(b, right), { channels: 2, expectedFrames: 4 });
    assert.equal(result.samples, 8); assert.equal(result.frames, 4); assert.equal(result.squaredError, "8");
    assert.deepEqual(result.channelSquaredError, ["5", "3"]); assert.equal(result.maximumAbsoluteError, 2);
    assert.equal(result.sourceSha256, createHash("sha256").update(a).digest("hex"));
    assert.equal(result.outputSha256, createHash("sha256").update(b).digest("hex"));
    assert.equal(result.maximumInputChunkBytes, 262144); assert.equal(result.maximumOutstandingChunksPerStream, 1);
    assert.equal(result.fullOutputBufferAllocated, false); assert.equal(result.minimumChannelSdrDb, -6.5);
  }
});
test("sample counts, tails, low fidelity, empty data and oversized/undeclared scopes cannot pass long PCM validation", async () => {
  const a = pcm([1000, 1000, 1000, 1000]);
  const policy = { channels: 2, expectedFrames: 2 };
  await assert.rejects(compareLongPcm16(chunks(a, 3), chunks(a.subarray(0, -2), 2), policy), /sample counts differ/);
  await assert.rejects(compareLongPcm16(chunks(a, 3), chunks(a.subarray(0, -1), 2), policy), /partial final sample/);
  await assert.rejects(compareLongPcm16(chunks(a, 3), chunks(a, 2), { ...policy, expectedFrames: 3 }), /frame count/);
  await assert.rejects(compareLongPcm16(chunks(a, 3), chunks(a, 2), { ...policy, expectedFrames: 1 }), /frame count/);
  await assert.rejects(compareLongPcm16(chunks(Buffer.alloc(0), 1), chunks(Buffer.alloc(0), 1), policy));
  await assert.rejects(compareLongPcm16(chunks(a, 3), chunks(pcm([-32768, -32768, -32768, -32768]), 2), policy), /SDR/);
  await assert.rejects(compareLongPcm16(chunks(a, 3), chunks(a, 2), { ...policy, minimumChannelSdrDb: -7 }));
  await assert.rejects(compareLongPcm16(chunks(a, 3), chunks(a, 2), { ...policy, expectedFrames: LONG_AUDIO_FIDELITY_LIMITS.frames + 1 }));
  await assert.rejects(compareLongPcm16(chunks(a, 3), chunks(a, 2), { ...policy, channels: 3 }));
});
test("exact long PCM and silent channels remain lossless, with BigInt sums beyond JavaScript safe integer range", async () => {
  const exact = pcm([0, 0, 32767, 0, -32768, 0]), result = await compareLongPcm16(chunks(exact, 1), chunks(exact, 5), { channels: 2, expectedFrames: 3 });
  assert.equal(result.exact, true); assert.deepEqual(result.channelSdrDb, ["infinity", "infinity"]); assert.equal(result.psnrDb, "infinity");
  const size = 262144, a = Buffer.alloc(size), b = Buffer.alloc(size);
  for (let at = 0; at < size; at += 2) { a.writeInt16LE(-32768, at); b.writeInt16LE(32767, at); }
  async function* repeat(bytes) { for (let index = 0; index < 17; index++) yield bytes; }
  await assert.rejects(compareLongPcm16(repeat(a), repeat(b), { channels: 1, expectedFrames: 17 * size / 2, minimumChannelSdrDb: 0 }), error => {
    assert.equal(error.fidelity.samples, 17 * size / 2);
    assert.equal(error.fidelity.squaredError, String(BigInt(17 * size / 2) * 65535n ** 2n));
    assert.ok(BigInt(error.fidelity.squaredError) > BigInt(Number.MAX_SAFE_INTEGER)); return true;
  });
});
test("new native long validator preserves scalar complete decode and exact historical float-ASDR; small60dB policy unchanged", async () => {
  const source = await readFile("scripts/lib/long-audio-fidelity.mjs", "utf8"), small = await readFile("scripts/lib/streaming-audio-fidelity.mjs", "utf8");
  assert.match(source, /windowsHide: true/); assert.match(source, /"-cpuflags", "0"/); assert.match(source, /"-xerror"/);
  assert.match(source, /exactHistoricalFilterRetained: true/); assert.match(source, /doesNotReplaceStrictUnalignedCompletePcm: true/);
  assert.doesNotMatch(source, /"-ss"|"-t"|"-ar"|"-ac"|"-c:a", "(?:libopus|libvorbis)"/);
  assert.match(small, /minimumPsnrDb = 60/); assert.match(small, /maximumSamples <= 1048576/);
});

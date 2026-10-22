import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { parseCompactAacPacket } from "../scripts/lib/bounded-native-lines.mjs";
import { createStreamingPcmTrimDigest } from "../scripts/lib/streaming-pcm-trim-digest.mjs";
import { compareStreamingAacPackets } from "../scripts/lib/large-aac-copy-fidelity.mjs";
import { inspectLargeMp4FirstSample } from "../scripts/lib/large-mp4-first-sample-duration.mjs";
import { vpxScalePlan, assertVpxMemoryGateCoverage } from "../scripts/lib/vpx-scale-plan.mjs";
const hash = "SHA256:" + "a".repeat(64);
test("first scaling stage requires genuine128MiB1080p sources and cannot claim10GiB acceptance", () => {
  const plan = vpxScalePlan("1080p-128m"); assert.equal(plan.minimumSourceBytes, 128 * 1024 ** 2);
  assert.equal(plan.width, 1920); assert.equal(plan.height, 1080); assert.equal(plan.durationSeconds * plan.frameRate, 960);
  assert.equal(plan.near10GiBAcceptance, false); assert.ok(Object.isFrozen(plan));
  assert.equal(vpxScalePlan(undefined), null); assert.equal(vpxScalePlan("0"), null); assert.throws(() => vpxScalePlan("small"));
});
test("memory gate rejects zero conversions and incomplete explicit cross/repeat/scale selections", () => {
  for (const input of [{ conversionCount: 0, independentOutputCount: 0 }, { conversionCount: 1, independentOutputCount: 0 },
    { conversionCount: 1, independentOutputCount: 1, crossCheck: true }, { conversionCount: 1, independentOutputCount: 1, scale: true },
    { conversionCount: 12, independentOutputCount: 11, repeat: true }]) assert.throws(() => assertVpxMemoryGateCoverage(input));
  assert.doesNotThrow(() => assertVpxMemoryGateCoverage({ conversionCount: 1, independentOutputCount: 1, crossCheck: true, crossCheckCount: 1 }));
  assert.doesNotThrow(() => assertVpxMemoryGateCoverage({ conversionCount: 2, independentOutputCount: 2, scale: true }));
  assert.doesNotThrow(() => assertVpxMemoryGateCoverage({ conversionCount: 12, independentOutputCount: 12, repeat: true }));
});
test("bounded packet parser accepts real FFprobe prefixed trim fields and rejects unavailable/coerced data", () => {
  const line = `packet|stream_index=1|pts_time=-0.021333|dts_time=-0.021333|dts=-1024|duration_time=N/A|data_hash=${hash}|side_datum/skip_samples:side_data_type=Skip Samples|side_datum/skip_samples:skip_samples=1024|side_datum/skip_samples:discard_padding=0`;
  assert.deepEqual(parseCompactAacPacket(line), { streamIndex: 1, pts: -0.021333, dts: -0.021333, dtsTicks: -1024, duration: null, hash, skip: 1024, tail: 0, explicitTrim: true });
  for (const changed of [line.replace("pts_time=-0.021333", "pts_time="), line.replace("dts_time=-0.021333", "dts_time=N/A"),
    line.replace("duration_time=N/A", "duration_time=-1"), line.replace("stream_index=1|", ""), line + "|pts_time=0", line + "x".repeat(4096)])
    assert.throws(() => parseCompactAacPacket(changed));
});
test("PCM digest clips exact declared prefix/tail across arbitrary chunks, never searches for alignment", () => {
  const bytes = Buffer.from(Array.from({ length: 16 }, (_, i) => i)), digest = createStreamingPcmTrimDigest({ channels: 2, expectedSamples: 4, leadingSamples: 1, trailingSamples: 1 });
  digest.update(bytes.subarray(0, 3)); digest.update(bytes.subarray(3, 11)); digest.update(bytes.subarray(11));
  const result = digest.finish(); assert.equal(result.rawSha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(result.audibleSha256, createHash("sha256").update(bytes.subarray(4, 12)).digest("hex")); assert.equal(result.retainedPcmBytes, 0);
  assert.throws(() => digest.update(Buffer.alloc(1)));
  const short = createStreamingPcmTrimDigest({ channels: 1, expectedSamples: 4, leadingSamples: 0, trailingSamples: 0 });
  short.update(Buffer.alloc(2)); assert.throws(() => short.finish(), /truncated/);
});
test("large PCM counter accepts more than old small cap without collecting complete PCM", () => {
  const expectedSamples = 4000000, digest = createStreamingPcmTrimDigest({ channels: 1, expectedSamples, leadingSamples: 1024, trailingSamples: 0 });
  const chunk = Buffer.alloc(16384, 7); let left = expectedSamples * 2;
  while (left) { const count = Math.min(left, chunk.length); digest.update(chunk.subarray(0, count)); left -= count; }
  const result = digest.finish(); assert.equal(result.decodedBytes, 8000000); assert.equal(result.maximumChunkBytes, 16384); assert.equal(result.retainedPcmBytes, 0);
});
const stream = { index: 1, sample_rate: "48000", channels: 1, initial_padding: 1024 };
async function* packets(output, mutation = null) {
  for (let index = 0; index < 600; index++) {
    const clock = (index - 1) * 1024 / 48000;
    const row = { streamIndex: 1, pts: output ? clock : Number(clock.toFixed(3)), dts: output ? clock : Number(clock.toFixed(3)),
      duration: output ? 1024 / 48000 : 0.021, hash: String(index), skip: output && index === 0 ? 1024 : 0, tail: 0, explicitTrim: output && index === 0 };
    if (mutation && index === 300) mutation(row); yield row;
  }
}
test("streamed AAC compares every packet beyond512 with unchanged content/trim/1ms clocks", async () => {
  const result = await compareStreamingAacPackets(packets(false), packets(true), { beforeStream: stream, afterStream: { ...stream, initial_padding: 0 } });
  assert.equal(result.packetCount, 600); assert.equal(result.leadingSamples, 1024); assert.equal(result.maximumRetainedPackets, 8);
  for (const change of [row => { row.hash = "different"; }, row => { row.pts += 0.01; }, row => { row.skip = 1; }])
    await assert.rejects(compareStreamingAacPackets(packets(false), packets(true, change), { beforeStream: stream, afterStream: { ...stream, initial_padding: 0 } }));
});
test("wholly trimmed first AAC-LC presentation duration stays unavailable; interior absence is never guessed", async () => {
  async function* missingFirst() { let index = 0; for await (const packet of packets(false)) { if (index++ === 0) packet.duration = null; yield packet; } }
  const options = { beforeStream: stream, afterStream: { ...stream, initial_padding: 0 }, firstDuration: { rawPacketHash: "0", seconds: 1024 / 48000 } };
  const result = await compareStreamingAacPackets(missingFirst(), packets(true), options);
  assert.equal(result.sourceFirstPresentationDurationSeconds, null); assert.equal(result.sourceUnavailablePresentationDurations, 1);
  assert.equal(result.durationComparedPackets, 599); assert.equal(result.leadingSamples, 1024);
  await assert.rejects(compareStreamingAacPackets(missingFirst(), packets(true), { ...options, beforeStream: { ...stream, initial_padding: 0 } }));
  await assert.rejects(compareStreamingAacPackets(packets(false, row => { row.duration = null; }), packets(true), options), /Interior/);
});
const words = (...values) => { const data = Buffer.alloc(values.length * 4); values.forEach((value, i) => data.writeUInt32BE(value, i * 4)); return data; };
const box = (type, ...payload) => { const body = Buffer.concat(payload); return Buffer.concat([words(body.length + 8), Buffer.from(type), body]); };
function metadata({ explicit = false, tfhdDefault = true } = {}) {
  const track = box("trak", box("tkhd", words(0, 0, 0, 3)), box("mdia", box("mdhd", words(0, 0, 0, 48000)),
    box("minf", box("stbl", box("stts", words(0, 0)), box("stsz", words(0, 0, 0))))));
  return Buffer.concat([box("moov", track, box("mvex", box("trex", words(0, 3, 1, 1024, 0, 0)))),
    box("moof", box("traf", box("tfhd", words(0x020000 | (tfhdDefault ? 8 : 0), 3, ...(tfhdDefault ? [2048] : []))),
      box("tfdt", words(0, 0)), box("trun", words(1 | (explicit ? 0x100 : 0), 2, 0, ...(explicit ? [1024, 1024] : []))))) ]);
}
test("virtual8GiB metadata-only unit proves first serialized duration without reading media; not a stress conversion", async () => {
  for (const options of [{ explicit: true }, { tfhdDefault: true }, { tfhdDefault: false }]) {
    const prefix = metadata(options), read = async (offset, length) => { assert.ok(offset + length <= prefix.length); return prefix.subarray(offset, offset + length); };
    const result = await inspectLargeMp4FirstSample(read, 8 * 1024 ** 3, { trackId: 3, timeScale: 48000, firstDtsTicks: 0 });
    assert.equal(result.sampleDurationTicks, options.explicit || options.tfhdDefault === false ? 1024 : 2048);
    assert.ok(result.metadataBytesRead <= 262144 && result.largestReadBytes <= 64); assert.equal(result.mediaPayloadBytesRead, 0);
    await assert.rejects(inspectLargeMp4FirstSample(read, 8 * 1024 ** 3, { trackId: 3, timeScale: 44100, firstDtsTicks: 0 }));
    await assert.rejects(inspectLargeMp4FirstSample(read, 8 * 1024 ** 3, { trackId: 3, timeScale: 48000, firstDtsTicks: 1 }));
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { inspectSmallMp4SampleDuration } from "../scripts/lib/small-mp4-sample-duration.mjs";
const words = (...values) => { const out = Buffer.alloc(values.length * 4); values.forEach((value, index) => out.writeUInt32BE(value, index * 4)); return out; };
const box = (type, ...payload) => { const body = Buffer.concat(payload); return Buffer.concat([words(body.length + 8), Buffer.from(type), body]); };
function fixture({ explicit = false, tfhdDefault = true, decode = 0, initialSamples = 0, count = 2 } = {}) {
  const track = box("trak", box("tkhd", words(0, 0, 0, 3)), box("mdia", box("mdhd", words(0, 0, 0, 48000)),
    box("minf", box("stbl", box("stts", words(0, initialSamples)), box("stsz", words(0, 0, initialSamples))))));
  const moov = box("moov", track, box("mvex", box("trex", words(0, 3, 1, 1024, 0, 0))));
  const tfhd = box("tfhd", words(0x020000 | (tfhdDefault ? 8 : 0), 3, ...(tfhdDefault ? [explicit ? 2048 : 1024] : [])));
  const trun = box("trun", words(1 | (explicit ? 0x100 : 0), count, 0, ...(explicit ? Array(count).fill(1024) : [])));
  const prefix = Buffer.concat([box("ftyp", Buffer.from("isom")), moov, box("moof", box("traf", tfhd, box("tfdt", words(0, decode)), trun))]);
  return { bytes: Buffer.concat([prefix, box("mdat", Buffer.alloc(96, 7))]), payloadStart: prefix.length + 8 };
}
const options = { trackId: 3, timeScale: 48000, expectedPackets: 2, firstDtsTicks: 0 };
async function inspect(input, override = {}) {
  let maximum = 0;
  const result = await inspectSmallMp4SampleDuration(async (offset, length) => {
    assert.ok(offset + length <= input.payloadStart, "Media payload must never be read"); maximum = Math.max(maximum, length);
    return input.bytes.subarray(offset, offset + length);
  }, input.bytes.length, { ...options, ...override });
  assert.ok(maximum <= 64); assert.equal(result.mediaPayloadBytesRead, 0); return result;
}
test("serialized sample duration comes from trun or tfhd or trex, never guessed timestamps or payload", async () => {
  for (const [config, expected] of [[{}, "tfhd"], [{ explicit: true }, "trun"], [{ tfhdDefault: false }, "trex"]]) {
    const result = await inspect(fixture(config)); assert.equal(result.sourceBox, expected);
    assert.equal(result.sampleDurationTicks, 1024); assert.equal(result.packetCount, 2); assert.ok(result.sourceFieldOffset > 0);
    assert.ok(result.metadataBytesRead <= 262144); assert.equal(result.initialSampleTablesEmpty, true);
  }
});
test("wrong track, timescale, count, origin, nonempty initialization and malformed boxes fail closed", async () => {
  for (const override of [{ trackId: 4 }, { timeScale: 44100 }, { expectedPackets: 3 }, { firstDtsTicks: 100 }])
    await assert.rejects(inspect(fixture(), override));
  await assert.rejects(inspect(fixture({ initialSamples: 1 })));
  const escaped = fixture(); escaped.bytes.writeUInt32BE(0xffffffff, 0); await assert.rejects(inspect(escaped));
  const truncated = fixture(); truncated.bytes = truncated.bytes.subarray(0, -1); await assert.rejects(inspect(truncated));
  await assert.rejects(inspectSmallMp4SampleDuration(async () => Buffer.alloc(1), 3000000, options));
  await assert.rejects(inspectSmallMp4SampleDuration(async () => Buffer.alloc(1), 100, options));
});

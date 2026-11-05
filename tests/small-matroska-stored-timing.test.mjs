import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectSmallMatroskaTiming, inspectSmallMatroskaTimingFile, STORED_TIMING_LIMITS } from "../scripts/lib/small-matroska-stored-timing.mjs";
const hex = value => Buffer.from(value, "hex");
function size(value) {
  for (let width = 1; width <= 4; width++) if (value < 2 ** (7 * width) - 1) {
    const result = Buffer.alloc(width); result.writeUIntBE(value, 0, width); result[0] |= 1 << (8 - width); return result;
  } throw new Error("unit size");
}
const el = (id, data) => Buffer.concat([hex(id), size(data.length), data]);
const unsigned = value => { const buffer = Buffer.alloc(6); buffer.writeUIntBE(value, 0, 6); return buffer; };
const real = value => { const buffer = Buffer.alloc(8); buffer.writeDoubleBE(value); return buffer; };
function fixture({ defaultDuration = 41666666, blockDuration = null, group = false, lacing = false,
  trackScale = null, unknownSegment = false, duplicate = false, count = 48, includeDuration = true } = {}) {
  const track = Buffer.concat([el("d7", hex("01")), el("83", hex("01")), el("86", Buffer.from("V_VP9")),
    ...(defaultDuration === null ? [] : [el("23e383", unsigned(defaultDuration))]),
    ...(trackScale === null ? [] : [el("23314f", real(trackScale))]),
    ...(duplicate ? [el("d7", hex("02"))] : [])]);
  const rows = Array.from({ length: count }, (_, n) => {
    const header = Buffer.alloc(4); header[0] = 0x81; header.writeInt16BE(Math.round(n * 1000 / 24), 1); header[3] = lacing ? 2 : 0;
    const block = el(group ? "a1" : "a3", Buffer.concat([header, Buffer.alloc(1024)]));
    return group ? el("a0", Buffer.concat([block, ...(blockDuration === null ? [] : [el("9b", unsigned(blockDuration))])])) : block;
  });
  const body = Buffer.concat([el("1549a966", Buffer.concat([el("2ad7b1", unsigned(1000000)),
    ...(includeDuration ? [el("4489", real(2000))] : [])])), el("1654ae6b", el("ae", track)),
  el("1f43b675", Buffer.concat([el("e7", hex("00")), ...rows]))]);
  return unknownSegment ? Buffer.concat([hex("18538067ff"), body]) : el("18538067", body);
}
const inspect = bytes => inspectSmallMatroskaTiming({ bytes: bytes.length, read: async (at, count) => bytes.subarray(at, at + count) });
test("raw timing records all48blocks and exact stored duration, skips payload and never invents decoder fields", async () => {
  const bytes = fixture(), result = await inspect(bytes);
  assert.equal(result.durationSeconds, 2); assert.equal(result.timestampScaleNs, 1000000);
  assert.equal(result.tracks[0].defaultDurationNs, 41666666); assert.equal(result.blocks.length, 48);
  assert.equal(result.blocksWithExplicitDuration, 0); assert.equal(result.blocks.at(-1).timestampSeconds, 1.958);
  assert.equal(result.blocks.at(-1).explicitDurationTicks, null); assert.equal(result.decodedFrameDurationsInvented, false);
  assert.ok(result.bytesRead < 4096); assert.ok(result.largestRead <= 256); assert.ok(result.skippedEncodedPayloadBytes > 48000);
  assert.equal(result.publicAcceptance, false);
});
test("unknown top-level Segment size supported without losing bounded traversal", async () => {
  assert.equal((await inspect(fixture({ unknownSegment: true }))).blocks.length, 48);
});
test("explicit BlockGroup duration retained separately, including nonstandard zero rather than a fabricated positive duration", async () => {
  for (const duration of [0, 41]) { const result = await inspect(fixture({ group: true, blockDuration: duration }));
    assert.equal(result.blocksWithExplicitDuration, 48); assert.ok(result.blocks.every(row => row.explicitDurationTicks === duration)); }
});
test("missing default or Segment duration stays null; no inference from frame rate or next PTS", async () => {
  const result = await inspect(fixture({ defaultDuration: null, includeDuration: false }));
  assert.equal(result.tracks[0].defaultDurationNs, null); assert.equal(result.durationSeconds, null);
  assert.ok(result.blocks.every(row => row.explicitDurationTicks === null));
});
test("large input refused before a single read, never reads the protected multi-gigabyte original", async () => {
  let reads = 0; await assert.rejects(inspectSmallMatroskaTiming({ bytes: STORED_TIMING_LIMITS.fileBytes + 1,
    read: async () => { reads++; } }), /Small fixture only/); assert.equal(reads, 0);
});
test("out-of-scope lacing/scaling/duplicate track fields and excessive blocks fail closed", async () => {
  for (const options of [{ lacing: true }, { trackScale: 2 }, { duplicate: true }, { count: 129 }, { defaultDuration: 0 }])
    await assert.rejects(inspect(fixture(options)));
});
test("truncation, invalid VINT, unknown child size and parent overflow cannot masquerade as timing proof", async () => {
  const bytes = fixture();
  for (const broken of [bytes.subarray(0, -1), hex("0000"), hex("18538067851549a966ff"), hex("18538067831549a9")])
    await assert.rejects(inspect(broken));
});
test("short I/O fails rather than reporting invented metadata", async () => {
  await assert.rejects(inspectSmallMatroskaTiming({ bytes: 20, read: async () => Buffer.alloc(1) }), /Short diagnostic read/);
});
test("real explicitly reusable pinned source can be inspected read-only with bounded random reads", async () => {
  const result = await inspectSmallMatroskaTimingFile(new URL("../fixtures/media/vp9-fallback-comparison.mkv", import.meta.url));
  assert.equal(result.fileBytes, 58389); assert.equal(result.tracks[0].codecId, "V_MPEG4/ISO/AVC");
  assert.equal(result.tracks[0].defaultDurationNs, 41666666); assert.equal(result.durationSeconds, 2);
  assert.equal(result.blocks.length, 48); assert.ok(result.bytesRead <= 65536); assert.equal(result.publicAcceptance, false);
});

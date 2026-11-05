// Independent read-only diagnostic, restricted to tiny single-track fixtures.
// RFC9559 sections5.1.3.5.3,5.1.4.1.13,11. No decoder-field substitution.
import assert from "node:assert/strict";
import { open } from "node:fs/promises";
export const STORED_TIMING_LIMITS = Object.freeze({ fileBytes: 2097152, totalReadBytes: 65536,
  singleReadBytes: 256, elements: 2048, blocks: 128 });
const I = { segment: 0x18538067, info: 0x1549a966, tracks: 0x1654ae6b, track: 0xae,
  cluster: 0x1f43b675, group: 0xa0, simple: 0xa3, block: 0xa1 };
function vint(bytes, at, isId = false) {
  assert.ok(at < bytes.length && bytes[at] !== 0, "Truncated/invalid EBML VINT");
  let width = 1, mask = 128;
  while (!(bytes[at] & mask)) { width++; mask >>= 1; }
  assert.ok(width <= (isId ? 4 : 8) && at + width <= bytes.length, "EBML VINT width");
  let value = BigInt(isId ? bytes[at] : bytes[at] & (mask - 1));
  for (let n = 1; n < width; n++) value = value * 256n + BigInt(bytes[at + n]);
  const unknown = !isId && value === (1n << BigInt(7 * width)) - 1n;
  assert.ok(unknown || value <= BigInt(Number.MAX_SAFE_INTEGER), "Unsafe EBML size");
  return { width, value: unknown ? null : Number(value) };
}
const uint = bytes => {
  assert.ok(bytes.length > 0 && bytes.length <= 8, "EBML unsigned width");
  let value = 0n; for (const b of bytes) value = value * 256n + BigInt(b);
  assert.ok(value <= BigInt(Number.MAX_SAFE_INTEGER), "Unsafe EBML integer"); return Number(value);
};
const float = bytes => {
  assert.ok(bytes.length === 4 || bytes.length === 8, "EBML float width");
  const value = bytes.length === 4 ? bytes.readFloatBE() : bytes.readDoubleBE();
  assert.ok(Number.isFinite(value), "Nonfinite EBML float"); return value;
};
export async function inspectSmallMatroskaTiming({ bytes, read }) {
  assert.ok(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= STORED_TIMING_LIMITS.fileBytes, "Small fixture only; refuse large media");
  const report = { scope: "Stored EBML timing only; not decoded frame duration, full fidelity or public acceptance",
    specification: "https://www.rfc-editor.org/rfc/rfc9559.html", limits: STORED_TIMING_LIMITS,
    fileBytes: bytes, bytesRead: 0, largestRead: 0, elements: 0, timestampScaleNs: 1000000,
    timestampScaleExplicit: false, durationTicks: null, durationSeconds: null, tracks: [], blocks: [],
    skippedEncodedPayloadBytes: 0, decodedFrameDurationsInvented: false, publicAcceptance: false };
  const take = async (at, size) => {
    assert.ok(Number.isSafeInteger(at) && Number.isSafeInteger(size) && size > 0 && size <= 256 && at >= 0 && at + size <= bytes, "Bounded read range");
    report.bytesRead += size; assert.ok(report.bytesRead <= STORED_TIMING_LIMITS.totalReadBytes, "Total diagnostic I/O budget");
    report.largestRead = Math.max(report.largestRead, size);
    const value = await read(at, size); assert.ok(Buffer.isBuffer(value) && value.length === size, "Short diagnostic read"); return value;
  };
  const scalar = async (element, parser) => parser(await take(element.start, element.end - element.start));
  const once = (object, key, value) => { assert.equal(object[key], undefined, "Duplicate timing field: " + key); object[key] = value; };
  let segments = 0, infos = 0, trackSets = 0;
  async function walk(start, end, parent, state = {}) {
    for (let at = start; at < end;) {
      assert.ok(++report.elements <= STORED_TIMING_LIMITS.elements, "Element budget");
      const head = await take(at, Math.min(12, end - at)), id = vint(head, 0, true), length = vint(head, id.width);
      const element = { start: at + id.width + length.width,
        end: length.value === null ? end : at + id.width + length.width + length.value };
      assert.ok(element.start <= element.end && element.end <= end, "EBML element exceeds parent");
      assert.ok(length.value !== null || (parent === 0 && id.value === I.segment), "Unknown size supported only for top-level Segment");
      if (parent === 0 && id.value === I.segment) { assert.equal(++segments, 1); await walk(element.start, element.end, I.segment); }
      else if (parent === I.segment && id.value === I.info) { assert.equal(++infos, 1); await walk(element.start, element.end, I.info); }
      else if (parent === I.segment && id.value === I.tracks) { assert.equal(++trackSets, 1); await walk(element.start, element.end, I.tracks); }
      else if (parent === I.tracks && id.value === I.track) {
        assert.equal(report.tracks.length, 0, "Single-track diagnostic only"); const track = {};
        await walk(element.start, element.end, I.track, { track }); report.tracks.push(track);
      } else if (parent === I.segment && id.value === I.cluster) {
        const cluster = { timestamp: undefined, rows: [] }; await walk(element.start, element.end, I.cluster, { cluster });
        assert.notEqual(cluster.timestamp, undefined, "Cluster timestamp unavailable");
        for (const row of cluster.rows) row.clusterTimestampTicks = cluster.timestamp;
      } else if (parent === I.cluster && id.value === I.group) {
        const group = {}; await walk(element.start, element.end, I.group, { ...state, group });
        assert.ok(group.row, "BlockGroup without Block"); group.row.explicitDurationTicks = group.duration ?? null;
      } else if ((parent === I.cluster && id.value === I.simple) || (parent === I.group && id.value === I.block)) {
        assert.ok(report.blocks.length < STORED_TIMING_LIMITS.blocks, "Block budget");
        const prefix = await take(element.start, Math.min(11, element.end - element.start)), track = vint(prefix, 0);
        assert.ok(track.value > 0 && track.width + 3 < element.end - element.start, "Block header/payload unavailable");
        const flags = prefix[track.width + 2]; assert.equal(flags & 6, 0, "Laced blocks outside diagnostic scope");
        const row = { kind: id.value === I.simple ? "SimpleBlock" : "Block", trackNumber: track.value,
          relativeTimestampTicks: prefix.readInt16BE(track.width), clusterTimestampTicks: null,
          invisible: Boolean(flags & 8), explicitDurationTicks: null,
          encodedPayloadBytes: element.end - element.start - track.width - 3 };
        report.blocks.push(row); state.cluster.rows.push(row); report.skippedEncodedPayloadBytes += Math.max(0, element.end - element.start - prefix.length);
        if (parent === I.group) once(state.group, "row", row);
      } else if (parent === I.info && id.value === 0x2ad7b1) {
        assert.equal(report.timestampScaleExplicit, false); report.timestampScaleNs = await scalar(element, uint);
        assert.ok(report.timestampScaleNs > 0); report.timestampScaleExplicit = true;
      } else if (parent === I.info && id.value === 0x4489) {
        assert.equal(report.durationTicks, null); report.durationTicks = await scalar(element, float); assert.ok(report.durationTicks > 0);
      } else if (parent === I.track) {
        const fields = new Map([[0xd7, ["number", uint]], [0x83, ["type", uint]], [0x86, ["codecId", b => b.toString("ascii")]],
          [0x23e383, ["defaultDurationNs", uint]], [0x23314f, ["timestampScale", float]], [0x56aa, ["codecDelayNs", uint]]]);
        if (fields.has(id.value)) { const [key, parser] = fields.get(id.value); once(state.track, key, await scalar(element, parser)); }
        assert.ok(![0x6d80, 0x537f].includes(id.value), "ContentEncoding/TrackOffset outside scope");
      } else if (parent === I.cluster && id.value === 0xe7) once(state.cluster, "timestamp", await scalar(element, uint));
      else if (parent === I.group && id.value === 0x9b) once(state.group, "duration", await scalar(element, uint));
      else assert.ok(!(parent === I.group && [0x75a2, 0xa4, 0x75a1].includes(id.value)), "Padding/codec state/additions outside timing scope");
      at = element.end;
    }
  }
  await walk(0, bytes, 0); assert.equal(segments, 1); assert.equal(infos, 1); assert.equal(trackSets, 1);
  assert.equal(report.tracks.length, 1); assert.ok(report.blocks.length > 0);
  const track = report.tracks[0]; assert.equal(track.type, 1); assert.ok(["V_VP9", "V_MPEG4/ISO/AVC"].includes(track.codecId));
  assert.equal(track.timestampScale ?? 1, 1); assert.equal(track.codecDelayNs ?? 0, 0);
  assert.ok(track.defaultDurationNs === undefined || track.defaultDurationNs > 0);
  track.defaultDurationNs ??= null;
  for (const row of report.blocks) { assert.equal(row.trackNumber, track.number);
    row.timestampSeconds = (row.clusterTimestampTicks + row.relativeTimestampTicks) * report.timestampScaleNs / 1e9; }
  report.durationSeconds = report.durationTicks === null ? null : report.durationTicks * report.timestampScaleNs / 1e9;
  report.blocksWithExplicitDuration = report.blocks.filter(row => row.explicitDurationTicks !== null).length;
  return report;
}
export async function inspectSmallMatroskaTimingFile(file) {
  const handle = await open(file, "r");
  try {
    const before = await handle.stat(); assert.ok(before.isFile());
    const result = await inspectSmallMatroskaTiming({ bytes: before.size, read: async (at, size) => {
      const buffer = Buffer.alloc(size), { bytesRead } = await handle.read(buffer, 0, size, at); assert.equal(bytesRead, size); return buffer;
    } });
    const after = await handle.stat(); assert.equal(after.size, before.size); assert.equal(after.mtimeMs, before.mtimeMs);
    return result;
  } finally { await handle.close(); }
}

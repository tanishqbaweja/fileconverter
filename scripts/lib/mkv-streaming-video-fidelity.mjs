// Independent FFprobe validator for sustained MKV-to-MP4 packet-copy tests.
// Keep only one pair of packets and scalar totals; never retain media payloads.
import assert from "node:assert/strict";
import { boundedNativeLines } from "./bounded-native-lines.mjs";

const fields = new Set(["stream_index", "pts_time", "dts_time", "duration_time", "data_hash"]);
const tick = 1000;

function microseconds(text, optional = false) {
  if (optional && (text === undefined || text === "N/A")) return null;
  assert.match(text ?? "", /^-?\d+\.\d{6}$/);
  const value = Math.round(Number(text) * 1e6);
  assert.ok(Number.isSafeInteger(value), "Unsafe packet timestamp");
  return value;
}

export function parseMkvVideoPacket(line) {
  assert.ok(typeof line === "string" && line.length <= 4096);
  const [label, ...parts] = line.split("|");
  assert.equal(label, "packet");
  assert.ok(parts.length <= fields.size);
  const data = {};
  for (const part of parts) {
    const index = part.indexOf("=");
    assert.ok(index > 0);
    const key = part.slice(0, index);
    assert.ok(fields.has(key) && !Object.hasOwn(data, key), "Unexpected or duplicate packet field");
    data[key] = part.slice(index + 1);
  }
  assert.match(data.stream_index ?? "", /^\d+$/);
  const stream = Number(data.stream_index);
  assert.ok(Number.isSafeInteger(stream));
  assert.match(data.data_hash ?? "", /^SHA256:[a-f0-9]{64}$/);
  const duration = microseconds(data.duration_time, true);
  assert.ok(duration === null || duration > 0);
  return { stream, pts: microseconds(data.pts_time), dts: microseconds(data.dts_time, true), duration, hash: data.data_hash };
}

export async function compareMkvVideoPackets(source, output, { sourceIndex, outputIndex }) {
  const a = source[Symbol.asyncIterator](), b = output[Symbol.asyncIterator]();
  let packets = 0, comparableDts = 0, unavailableSourceDts = 0, comparableDurations = 0;
  let maximumPtsDeltaUs = 0, maximumDtsDeltaUs = 0, maximumDurationDeltaUs = 0;
  let lastOutputDts = -Infinity, sourceMinimumPtsUs = Infinity, outputMinimumPtsUs = Infinity;
  try {
    for (;;) {
      const [before, after] = await Promise.all([a.next(), b.next()]);
      assert.equal(before.done, after.done, "Video packet count changed");
      if (before.done) break;
      assert.ok(++packets <= 10_000_000, "Bounded fixture packet count exceeded");
      const x = before.value, y = after.value;
      assert.equal(x.stream, sourceIndex);
      assert.equal(y.stream, outputIndex);
      assert.equal(x.hash, y.hash, `Video payload or decode order changed at packet ${packets}`);
      const pts = Math.abs(x.pts - y.pts);
      assert.ok(pts <= tick, `Video PTS exceeds one source tick at packet ${packets}`);
      maximumPtsDeltaUs = Math.max(maximumPtsDeltaUs, pts);
      sourceMinimumPtsUs = Math.min(sourceMinimumPtsUs, x.pts);
      outputMinimumPtsUs = Math.min(outputMinimumPtsUs, y.pts);
      assert.ok(y.dts !== null && y.dts >= lastOutputDts, `Missing or nonmonotonic output DTS at packet ${packets}`);
      lastOutputDts = y.dts;
      if (x.dts === null) {
        assert.ok(comparableDts === 0 && ++unavailableSourceDts <= 16, "Missing interior or excessive source DTS");
      } else {
        comparableDts++;
        const dts = Math.abs(x.dts - y.dts);
        assert.ok(dts <= tick, `Video DTS exceeds one source tick at packet ${packets}`);
        maximumDtsDeltaUs = Math.max(maximumDtsDeltaUs, dts);
      }
      if (x.duration !== null) {
        assert.notEqual(y.duration, null, `Output video duration unavailable at packet ${packets}`);
        const duration = Math.abs(x.duration - y.duration);
        assert.ok(duration <= tick, `Video packet duration exceeds one source tick at packet ${packets}`);
        maximumDurationDeltaUs = Math.max(maximumDurationDeltaUs, duration);
        comparableDurations++;
      }
    }
  } finally {
    await Promise.allSettled([a.return?.(), b.return?.()]);
  }
  assert.ok(packets > 0 && comparableDts > 0 && comparableDurations > 0);
  return { packets, comparableDts, unavailableSourceDts, comparableDurations, maximumPtsDeltaUs, maximumDtsDeltaUs,
    maximumDurationDeltaUs, sourceMinimumPtsUs, outputMinimumPtsUs, packetBytesIdentical: true, maximumRetainedPacketPair: 2 };
}

export function probeMkvVideoPackets(file, ordinal, options) {
  assert.ok(Number.isInteger(ordinal) && ordinal >= 0 && ordinal < 32);
  const lines = boundedNativeLines("ffprobe", ["-v", "error", "-select_streams", `v:${ordinal}`,
    "-show_packets", "-show_entries", "packet=stream_index,pts_time,dts_time,duration_time,data_hash:packet_side_data=",
    "-show_data_hash", "sha256", "-of", "compact", file], options);
  return (async function* () { for await (const line of lines) yield parseMkvVideoPacket(line); })();
}

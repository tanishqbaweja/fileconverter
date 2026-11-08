import assert from "node:assert/strict";
import test from "node:test";
import { compareMkvVideoPackets, parseMkvVideoPacket } from "../scripts/lib/mkv-streaming-video-fidelity.mjs";

const make = (pts, dts, duration = "0.041000", char = "a") => parseMkvVideoPacket(
  `packet|stream_index=0|pts_time=${pts}|dts_time=${dts}|duration_time=${duration}|data_hash=SHA256:${char.repeat(64)}`);
const iterate = async function* (rows) { yield* rows; };
const compare = (x, y) => compareMkvVideoPackets(iterate(x), iterate(y), { sourceIndex: 0, outputIndex: 0 });
const before = [make("0.000000", "N/A"), make("0.083000", "-0.042000"), make("0.042000", "0.000000")];
const after = [make("0.000000", "-0.083000", "0.042000"), make("0.084000", "-0.041000"), make("0.042000", "0.000000")];

test("Video stream validation keeps decode order, exact payloads and signed clocks without an array history", async () => {
  const result = await compare(before, after);
  assert.equal(result.packets, 3);
  assert.equal(result.unavailableSourceDts, 1);
  assert.equal(result.comparableDts, 2);
  assert.equal(result.maximumPtsDeltaUs, 1000);
  assert.equal(result.maximumDtsDeltaUs, 1000);
  assert.equal(result.maximumDurationDeltaUs, 1000);
  assert.equal(result.maximumRetainedPacketPair, 2);
});

test("Video validator rejects extra packets, altered payloads and clocks, and unavailable interior DTS", async () => {
  await assert.rejects(compare(before, after.slice(0, 2)), /count changed/);
  await assert.rejects(compare(before, [{ ...after[0], hash: "x" }, ...after.slice(1)]), /payload or decode order/);
  await assert.rejects(compare(before, [after[0], { ...after[1], pts: 84001 }, after[2]]), /PTS exceeds/);
  await assert.rejects(compare([before[0], before[1], { ...before[2], dts: null }], after), /Missing interior/);
  await assert.rejects(compare(before, [after[0], after[1], { ...after[2], dts: -90000 }]), /nonmonotonic/);
  assert.throws(() => parseMkvVideoPacket("packet|stream_index=0|stream_index=0"), /duplicate/);
});

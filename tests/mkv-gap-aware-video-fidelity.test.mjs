import assert from "node:assert/strict";
import test from "node:test";
import { compareMkvGapAwareVideoPackets } from "../scripts/lib/mkv-gap-aware-video-fidelity.mjs";
import { compareMkvVideoPackets } from "../scripts/lib/mkv-streaming-video-fidelity.mjs";
const iterate = async function* (packets) { yield* packets; };
const row = (pts, dts = pts, duration = 41000) => ({ stream: 0, pts, dts, duration, hash: String(pts) });
const source = [row(0), row(41000), row(113000)], output = [row(0), row(41000, 41000, 72000), row(113000)];
const compare = (a, b, sourceReorderDepth = 0) => compareMkvGapAwareVideoPackets(iterate(a), iterate(b), { sourceIndex: 0, outputIndex: 0, sourceReorderDepth });

test("gap-aware checks preserve all actual clocks and presentation endpoints while validating each MP4 decode interval", async () => {
  await assert.rejects(compareMkvVideoPackets(iterate(source), iterate(output), { sourceIndex: 0, outputIndex: 0 }), /duration exceeds/);
  const proof = await compare(source, output);
  assert.equal(proof.maximumDtsDeltaUs, 0); assert.equal(proof.maximumPtsDeltaUs, 0); assert.equal(proof.maximumIntervalErrorUs, 0);
  assert.equal(proof.maximumDefaultDurationDifferenceUs, 31000); assert.equal(proof.sourceEndUs, proof.outputEndUs);
  assert.equal(proof.clockToleranceUs, 1000); assert.equal(proof.everyOutputIntervalCheckedAgainstAdjacentDts, true);
  assert.equal(proof.maximumRetainedPacketPair, 2); assert.equal(proof.maximumStartupTimingScalars, 3);
});

test("old nominal-CFR bug is still rejected; no extra clock tolerance or missing/interior-clock exemption", async () => {
  await assert.rejects(compare(source, [output[0], output[1], { ...output[2], dts: 82000 }]), /DTS exceeds/);
  for (const change of [
    a => { a[1].hash = "changed"; }, a => { a[1].pts += 1001; }, a => { a[1].duration = 41000; },
    a => { a[2].duration += 1001; }, a => { a[1].dts = null; }, a => { a.push(a.at(-1)); },
  ]) { const copy = structuredClone(output); change(copy); await assert.rejects(compare(source, copy)); }
  await assert.rejects(compare([source[0], { ...source[1], dts: null }, source[2]], output, 2), /Missing interior/);
  await assert.rejects(compare(source, output, 17));
});

test("missing HEVC prefix must match observed reordered cadence; bounded prefix cannot rewrite known DTS or PTS", async () => {
  const before = [row(0, null), row(125000, null), row(83000, 0), row(42000, 42000), row(166000, 83000)];
  const after = before.map((p, n) => ({ ...p, dts: [-83000, -41000, 0, 42000, 83000][n], duration: [42000, 41000, 42000, 41000, 41000][n] }));
  const proof = await compare(before, after, 2);
  assert.equal(proof.generatedStartupDtsValidated, true); assert.equal(proof.unavailableSourceDts, 2);
  assert.equal(proof.maximumStartupTimingScalars, 15);
  const broken = structuredClone(after); broken[0].dts -= 10000; broken[0].duration += 10000;
  await assert.rejects(compare(before, broken, 2), /Generated startup DTS/);
  await assert.rejects(compare(before, after, 1), /excessive/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { compareMkvSustainedAac } from "../scripts/lib/mkv-sustained-aac-fidelity.mjs";

const iterate = async function* (rows) { yield* rows; };
const compare = (a, b) => compareMkvSustainedAac(iterate(a), iterate(b));
const first = { streamIndex: 1, hash: "a", pts: -0.021, dts: -0.021, duration: null, explicitTrim: true, skip: 1024, tail: 0 };
const next = { ...first, hash: "b", pts: 0, dts: 0, duration: 0.021, explicitTrim: false, skip: 0 };
const shifted = p => ({ ...p, pts: p.pts - 0.000333, dts: p.dts - 0.000333, duration: 0.021 });

test("Sustained AAC keeps unavailable source preroll duration distinct from exact trim and measured clocks", async () => {
  const r = await compare([first, next], [shifted(first), shifted(next)]);
  assert.equal(r.packets, 2);
  assert.equal(r.initialSkipSamples, 1024);
  assert.equal(r.unavailableSourceDuration, 1);
  assert.equal(r.packetBytesIdentical, true);
});

test("Sustained AAC rejects incorrect trim, clocks, payload, and unavailable interior duration", async () => {
  await assert.rejects(compare([first, next], [{ ...shifted(first), skip: 1008 }, shifted(next)]), /leading trim/);
  await assert.rejects(compare([first, next], [shifted(first), { ...shifted(next), pts: 0.002 }]), /clock/);
  await assert.rejects(compare([first, next], [shifted(first), { ...shifted(next), hash: "c" }]), /packet bytes/);
  await assert.rejects(compare([first, { ...next, duration: null }], [shifted(first), shifted(next)]), /preroll/);
  await assert.rejects(compare([first, next], [shifted(first), { ...shifted(next), duration: null }]), /output packet duration/);
});

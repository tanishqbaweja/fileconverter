import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCpuProfile } from "../scripts/lib/cpu-profile-summary.mjs";
const frame = (id, functionName, children = []) => ({ id, callFrame: { functionName, url: "wasm://wasm/module" }, children });
const profile = () => ({ startTime: 0, endTime: 100,
  nodes: [frame(1, "(root)", [2, 3]), frame(2, "WelsEnc::EncodeFrame", [4]), frame(3, "(idle)"), frame(4, "memcpy")],
  samples: [4, 3], timeDeltas: [60, 40] });
test("CPU summary attributes generic native leaves through encoder ancestry without counting idle as compute", () => {
  const r = summarizeCpuProfile(profile());
  assert.deepEqual(r.categories.map((row) => [row.category, row.sampledMicroseconds]), [["openh264-encoder-stack", 60], ["idle", 40]]);
  assert.equal(r.topSelf[0].functionName, "memcpy");
  assert.equal(r.topInclusive[0].sampledMicroseconds, 100);
  assert.match(r.semantics, /not OS CPU utilization/);
});
test("CPU summary rejects unknown IDs, missing intervals, cycles and negative samples", () => {
  let p = profile(); p.samples[0] = 8; assert.throws(() => summarizeCpuProfile(p), /unknown CPU/);
  p = profile(); p.timeDeltas.pop(); assert.throws(() => summarizeCpuProfile(p));
  p = profile(); p.timeDeltas[0] = -1; assert.throws(() => summarizeCpuProfile(p), /cannot be invented/);
  p = profile(); p.nodes[3].children = [1]; assert.throws(() => summarizeCpuProfile(p), /cycle/);
});

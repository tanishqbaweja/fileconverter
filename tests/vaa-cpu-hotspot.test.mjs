import assert from "node:assert/strict";
import test from "node:test";
import { vaaCpuHotspot } from "../scripts/lib/vaa-cpu-hotspot.mjs";
const node = (id, functionName, children = []) => ({ id, callFrame: { functionName, url: "wasm://diagnostic", lineNumber: 0, columnNumber: 0 }, children });
function profile() {
  return { nodes: [node(1, "(root)", [2, 5]), node(2, "WelsVP::VAACalcSadBgd_c(const unsigned char*)", [3]),
    node(3, "within_vaa_block", [4]), node(4, "memcpy"), node(5, "(idle)")],
  samples: [2, 3, 4, 5], timeDeltas: [10, 20, 30, 40], startTime: 0, endTime: 100 };
}
test("VAA profile aggregation includes helper symbols and counts nested target samples only once", () => {
  const result = vaaCpuHotspot(profile());
  assert.equal(result.targetSelf.sampledMicroseconds, 30);
  assert.equal(result.targetInclusiveUnique.sampledMicroseconds, 60);
  assert.equal(result.targetInclusiveUnique.samples, 3);
  assert.equal(result.targetSelf.fractionOfSampledWindow, 0.3);
  assert.equal(result.targetInclusiveUnique.fractionOfSampledWindow, 0.6);
  assert.equal(result.targetSymbols.length, 2);
  assert.equal(result.otherTopSelf[0].functionName, "(idle)");
  assert.match(result.semantics, /not function call counts/);
});
test("VAA profile summary validates missing intervals, cycles and never invents unobserved target weight", () => {
  const missing = profile(); missing.timeDeltas.pop(); assert.throws(() => vaaCpuHotspot(missing));
  const cyclic = profile(); cyclic.nodes[3].children = [2]; assert.throws(() => vaaCpuHotspot(cyclic));
  const absent = profile(); for (const row of absent.nodes) row.callFrame.functionName = "unrelated";
  assert.equal(vaaCpuHotspot(absent).targetSelf.sampledMicroseconds, 0);
  assert.equal(vaaCpuHotspot(absent).targetInclusiveUnique.sampledMicroseconds, 0);
});

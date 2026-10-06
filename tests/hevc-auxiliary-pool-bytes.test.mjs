import assert from "node:assert/strict";
import test from "node:test";
import { hevcAuxiliaryPoolBytes } from "../scripts/lib/hevc-auxiliary-pool-bytes.mjs";

const sample = () => ({ kind: "hevc-auxiliary-pools", sequence: 1, phase: "before-encoder-send", layer: 0,
  activeDpbFrames: 6, shortReferenceFrames: 6, longReferenceFrames: 0, outputPendingFrames: 3,
  scope: "simultaneous-read-only-pools-not-free-blocks-not-acceptance",
  pools: ["tab_mvf", "rpl_tab"].map((name) => ({ name, configured: true, statisticsComplete: true,
    payloadBytes: 1024, backingBytesPerEntry: 1040, liveEntries: 6, cachedEntries: 1 })) });
test("Simultaneous HEVC auxiliary backing separates live data from cached data without adding overlapping DPB counts", () => {
  const result = hevcAuxiliaryPoolBytes(sample());
  assert.equal(result.available, true); assert.equal(result.requestedLiveBytes, 12480);
  assert.equal(result.requestedCachedBytes, 2080);
  assert.equal(result.allocatorOverheadBytes, null); assert.equal(result.contiguousFreeBlockCapacity, null);
  const zero = sample(); zero.pools.forEach((row) => { row.cachedEntries = 0; });
  assert.equal(hevcAuxiliaryPoolBytes(zero).requestedCachedBytes, 0);
});
test("Absent, incomplete, stale, malformed and impossible HEVC groups never become valid zero", () => {
  for (const mutate of [
    (s) => { s.sequence = 49; }, (s) => { s.layer = 2; }, (s) => { s.activeDpbFrames = null; },
    (s) => { s.phase = "latest-per-pool"; }, (s) => { s.filename = "not-allowed"; },
    (s) => { s.outputPendingFrames = 7; }, (s) => { s.pools.pop(); },
    (s) => { s.pools[0].statisticsComplete = false; }, (s) => { s.pools[0].configured = false; },
    (s) => { s.pools[0].cachedEntries = null; }, (s) => { s.pools[0].cachedEntries = 129; },
    (s) => { s.pools[0].name = "rpl_tab"; }, (s) => { s.pools[0].backingBytesPerEntry = 1024; },
    (s) => { s.pools[0].liveEntries = 0xffffffff; }, (s) => { s.pools[0].address = 123; },
  ]) {
    const row = sample(); mutate(row); const result = hevcAuxiliaryPoolBytes(row);
    assert.equal(result.available, false); assert.equal(result.requestedLiveBytes, null);
    assert.equal(result.requestedCachedBytes, null); assert.equal(result.pools, null);
  }
  assert.equal(hevcAuxiliaryPoolBytes(null).available, false);
});

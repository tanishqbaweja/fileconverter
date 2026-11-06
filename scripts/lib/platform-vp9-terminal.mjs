// Assert actual bridge participation; API preference is never physical GPU proof.
import assert from "node:assert/strict";
export function assertPlatformVp9Terminal(result,completedFrames=48) {
  assert.ok(result&&result.encoder,"Platform encoder observation required, never a CPU-fallback pass");
  assert.equal(result.selection??null,null,"Candidate-only control must not silently fall back");
  const e=result.encoder,m=result.metrics;
  assert.ok(Number.isInteger(e.supportProbeCount)&&e.supportProbeCount>=1&&e.supportProbeCount<=2);
  assert.ok(["prefer-hardware","no-preference"].includes(e.selectedHardwarePreference));
  assert.equal(typeof e.hardwarePreferredSupported,"boolean");assert.equal(e.physicalHardwareSelectionProven,false);
  assert.equal(e.maximumFramesInFlight,1);assert.equal(e.maximumPacketsInFlight,1);
  assert.ok(e.peakPackedBytes<=3110400);assert.ok(e.peakPacketBytes<=1048576);
  assert.equal(e.currentPackedBytes,0);assert.equal(e.pendingPacketBytes,0);assert.equal(e.closed,true);assert.equal(e.busy,false);
  assert.equal(m.wasmMemoryBytes,33554432);assert.equal(m.activeWorkerCount,1);
  if(result.type==="complete") {
    assert.equal(e.frames,completedFrames);assert.equal(e.packets,completedFrames);assert.equal(e.framesClosed,completedFrames);
  }
}

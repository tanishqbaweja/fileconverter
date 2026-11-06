import assert from "node:assert/strict";
import {test} from "node:test";
import {assertPlatformVp9Terminal} from "../scripts/lib/platform-vp9-terminal.mjs";
const result=()=>({type:"complete",selection:null,encoder:{frames:48,packets:48,framesClosed:48,supportProbeCount:2,
  selectedHardwarePreference:"no-preference",hardwarePreferredSupported:false,physicalHardwareSelectionProven:false,
  maximumFramesInFlight:1,maximumPacketsInFlight:1,peakPackedBytes:86400,peakPacketBytes:50000,
  currentPackedBytes:0,pendingPacketBytes:0,closed:true,busy:false},metrics:{wasmMemoryBytes:33554432,activeWorkerCount:1}});
test("platform observation requires actual support probes, completed frames and released bounded buffers without GPU claim",()=>{
  assert.doesNotThrow(()=>assertPlatformVp9Terminal(result()));
  for(const change of [{frames:0},{packets:47},{framesClosed:47},{supportProbeCount:0},{currentPackedBytes:1},
    {pendingPacketBytes:1},{maximumFramesInFlight:2},{peakPackedBytes:3110401},{physicalHardwareSelectionProven:true}]) {
    const r=result();Object.assign(r.encoder,change);assert.throws(()=>assertPlatformVp9Terminal(r));
  }
});
test("a valid CPU fallback or missing bridge can never be relabelled a platform conversion",()=>{
  for(const encoder of [null,undefined]){const r=result();r.encoder=encoder;assert.throws(()=>assertPlatformVp9Terminal(r));}
  const r=result();r.selection={backend:"wasm"};assert.throws(()=>assertPlatformVp9Terminal(r));
});

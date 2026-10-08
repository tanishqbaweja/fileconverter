// Unit-only bookkeeping fixtures, not actual Chromium/conversion outcomes.
import assert from "node:assert/strict";
import test from "node:test";
import { splitRenderNativeFacts } from "../scripts/lib/split-render-progress-evidence.mjs";
const sample=(bytes,sequence)=>[sequence,"2026-10-09T00:00:00.000Z","conversion-1",bytes,bytes+100,1,null,[[0,bytes-100,bytes],[1,100,100]]];
const fixture=()=>({limitMiB:250,formula:"peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory",
  blankBaseline:{privateBytes:200000000},startupSettlement:{earlyWindow:{privateBytes:201000000},minimumMs:300000,actualMs:300001},ownedPids:{chrome:123},
  runs:[{cimPeakPrivateBytes:450000000,incrementalPrivateMiB:238}],nativeMemory:{error:null,intervalMs:100,identities:[{pid:123},{pid:456}],phases:[
    {phase:"pre-conversion-1",peak:sample(400000000,1),validSamples:2,unavailableSamples:1},
    {phase:"conversion-1",peak:sample(480000000,99),validSamples:5,unavailableSamples:2},
    {phase:"finally-cleanup",peak:sample(600000000,100),validSamples:1,unavailableSamples:0}]}});
test("Native calculation includes actual late conversion peak and root, excludes unavailable samples and non-conversion phases",()=>{
  const result=splitRenderNativeFacts(fixture(),"UNIT_ONLY");assert.equal(result.actualPeakPrivateBytes,480000000);
  assert.equal(result.observedIncrementalPrivateMiB,280000000/1048576);assert.equal(result.nativePeakSequence,99);
  assert.equal(result.primaryLimitExceededInObservedWindow,true);assert.equal(result.completeChromiumMemoryAcceptance,false);
  assert.equal(result.phaseCoverage[1].unavailableSamples,2);
});
test("Missing/error samples, wrong tree sum or omitted root cannot masquerade as an accepted native metric",()=>{
  const missing=fixture();missing.nativeMemory.phases[1].peak[3]=null;assert.throws(()=>splitRenderNativeFacts(missing,"UNIT_ONLY"));
  const wrong=fixture();wrong.nativeMemory.phases[1].peak[7][0][1]--;assert.throws(()=>splitRenderNativeFacts(wrong,"UNIT_ONLY"));
  const root=fixture();root.ownedPids.chrome=999;assert.throws(()=>splitRenderNativeFacts(root,"UNIT_ONLY"),/original Chrome root/);
});

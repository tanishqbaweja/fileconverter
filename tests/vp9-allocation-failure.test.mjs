import assert from "node:assert/strict";
import { test } from "node:test";
import { parseVp9AllocationFailure } from "../scripts/lib/vp9-allocation-failure.mjs";
const sample = "[within-vp9-alloc] w=1920 h=804 b=160 a=32 frame=3790176 heap=100663296 max=100663296 managed=90000000 free=1000000 unclaimed=100000 | FB allocation failed site=new-frame w=1920 h=804 b=160 a=32";
test("failure-time actual heap and frame request are separate from old JS metric and underlying malloc request",()=>{
  const result=parseVp9AllocationFailure(sample);
  assert.equal(result.available,true);assert.equal(result.site,"new-frame");assert.equal(result.frameRequestBytes,3790176);
  assert.equal(result.wasmHeapBytes,100663296);assert.equal(result.allocatorFreeBytes,1000000);
  assert.equal(result.frameRequestIsUnderlyingMallocRequest,false);assert.equal(result.conversionSucceeded,false);assert.equal(result.primaryWholeBrowserMemoryMetric,false);
});
test("missing, contradictory, duplicate and unsafe numeric heap values remain unavailable/null",()=>{
  for(const value of [undefined,"",sample+sample,sample.replace("heap=100663296","heap=0"),sample.replace("heap=100663296","heap=200663296"),
    sample.replace("free=1000000","free=99000000"),sample.replace("frame=3790176","frame=9007199254740993"),"x".repeat(32769)]) {
    const result=parseVp9AllocationFailure(value);assert.equal(result.available,false);assert.equal(result.wasmHeapBytes,null);assert.equal(result.frameRequestBytes,null);
  }
});
test("unknown or mismatching source site is not guessed from valid allocator numbers",()=>{
  for(const value of [sample.split(" | ")[0],sample.replace("site=new-frame","site=unknown"),sample.replace("site=new-frame w=1920","site=new-frame w=640")]) {
    const result=parseVp9AllocationFailure(value);assert.equal(result.available,true);assert.equal(result.site,null);
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { makeVp9LazyUtilityFunctions,makeVp9LazyUtilityFilter,makeVp9LazyUtilityEncoder } from "../media/ffmpeg/vp9-lazy-utility-recipe.mjs";
import { runVp9LazyUtilityCUnit } from "../media/ffmpeg/vp9-lazy-utility-c-unit.mjs";
const audit=JSON.parse(await readFile(new URL("../evidence/2026-11-06-vp9-utility-buffer-source-audit.json",import.meta.url))),
  filter=JSON.parse(await readFile(new URL("../evidence/2026-11-06-vp9-lazy-utility-source.json",import.meta.url))),
  original={allocation:audit.functions.alloc_util_frame_buffers.exactSource,motion:audit.functions.init_motion_estimation.exactSource,scale:audit.functions.vp9_scale_if_required.exactSource};
test("lazy utility functions and filter setup are exact reversible source edits, never pixel or settings changes",()=>{
  const results=makeVp9LazyUtilityFunctions(original);
  for(const [result,preimage] of [...Object.entries(results).map(([name,result])=>[result,original[name]]),[makeVp9LazyUtilityFilter(filter.exactSource),filter.exactSource]]) {
    let reverse=result.generated;for(const [before,after] of result.edits.toReversed())reverse=reverse.replace(after,before);
    assert.equal(reverse,preimage);
    for(const flag of ["codecSettingsChanged","pixelAlgorithmsChanged","memoryLimitsRaised","browserValidated","speedGainProven","publicAcceptance"])assert.equal(result[flag],false);
    assert.equal(result.actualMemorySavedBytes,null);
  }
  assert.ok(results.allocation.generated.includes("!cpi->use_svc"));
  assert.ok(results.motion.generated.includes("get_frame_new_buffer(&cpi->common)->y_stride"));
  assert.ok(results.scale.generated.includes("vpx_realloc_frame_buffer(scaled, cm->width, cm->height"));
});
test("changed function, encoder or filter parents fail closed before generation",()=>{
  assert.throws(()=>makeVp9LazyUtilityFunctions({...original,motion:original.motion+" "}));
  assert.throws(()=>makeVp9LazyUtilityFilter(filter.exactSource+" "));
  assert.throws(()=>makeVp9LazyUtilityEncoder(original.allocation));
});
test("compiled original/candidate controls preserve SVC/nonrealtime/failure behavior and exercise lazy use plus geometry transitions",{timeout:120000},async()=>{
  const result=await runVp9LazyUtilityCUnit();
  assert.deepEqual(result.variants.map(v=>v.allocationPairs),[40,80]);
  assert.deepEqual(result.variants.map(v=>v.scalingCases),[12,24]);
  assert.deepEqual(result.variants.map(v=>v.motionCases),[24,48]);
  assert.deepEqual(result.variants.map(v=>v.filterCases),[4,8]);
  assert.deepEqual(result.variants.map(v=>v.transitionCalls),[3,6]);
  assert.equal(result.actualMemorySavedBytes,null);assert.equal(result.nativeCodecConversion,false);assert.equal(result.publicAcceptance,false);
});

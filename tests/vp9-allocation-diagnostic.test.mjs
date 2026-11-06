import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { makeVp9FrameAllocationDiagnostic, makeVp9EncoderAllocationDiagnostic, VP9_ALLOCATION_DIAGNOSTIC_PINS } from "../media/ffmpeg/vp9-allocation-diagnostic-recipe.mjs";
import { runVp9AllocationCUnit } from "../media/ffmpeg/vp9-allocation-c-unit.mjs";
const audit = JSON.parse(await readFile(new URL("../evidence/2026-11-06-vp9-allocation-source-audit.json", import.meta.url))), base = audit.sources.frameAllocator.exactSource;
test("diagnostic source/header preimages match pinned SDK and archive hashes", () => {
  for (const [name,pin] of Object.entries(VP9_ALLOCATION_DIAGNOSTIC_PINS)) if (name !== "encoder") assert.equal(audit.sources[name].sha256,pin);
  assert.equal(audit.userMediaReadOrConverted,false); assert.equal(audit.publicAcceptance,false);
});
test("allocation instrumentation is exact/reversible and only reads stats after failed allocation", () => {
  const result = makeVp9FrameAllocationDiagnostic(base); let reverse=result.generated;
  for(const [before,after] of result.edits.toReversed()) reverse=reverse.replace(after,before);
  assert.equal(reverse,base); assert.equal(result.edits.length,2);
  assert.ok(result.generated.includes("if (!ybf->buffer_alloc) {\n        /* Sample only AFTER"));
  for(const flag of ["allocatorAlgorithmChanged","codecSettingsChanged","memoryLimitsRaised","publicAcceptance","speedGainProven"]) assert.equal(result[flag],false);
  assert.throws(()=>makeVp9FrameAllocationDiagnostic(base+" "),/Exact diagnostic/);
  assert.throws(()=>makeVp9EncoderAllocationDiagnostic(base));
});
test("real compiled allocator controls preserve success/reuse/callback/invalid/failure behavior and never sample successful paths",{timeout:120000},async()=>{
  const result=await runVp9AllocationCUnit(); assert.equal(result.totalFunctionCalls,24); assert.equal(result.variants.length,2);
  assert.equal(result.actualBrowserHeapMeasurements,null);assert.equal(result.nativeCodecConversion,false);assert.equal(result.publicAcceptance,false);
});

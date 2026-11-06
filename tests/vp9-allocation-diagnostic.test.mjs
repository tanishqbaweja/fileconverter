import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { makeVp9FrameAllocationDiagnostic, makeVp9EncoderAllocationDiagnostic, makeVp9AllocationConfigureProbe, VP9_ALLOCATION_DIAGNOSTIC_PINS } from "../media/ffmpeg/vp9-allocation-diagnostic-recipe.mjs";
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
test("private configure probes use unchanged production allocator without changing canonical scripts or final link flags",async()=>{
  const source=await readFile(new URL("../media/ffmpeg/build-libraries.sh",import.meta.url),"utf8"),
    result=makeVp9AllocationConfigureProbe(source);
  assert.equal(result.edits.length,2);assert.equal(result.configureProbeAllocatorAlignedToFinal,true);assert.equal(result.productionFinalLinkFlagsChanged,false);
  let reverse=result.generated;for(const [before,after] of result.edits.toReversed())reverse=reverse.replace(after,before);
  assert.equal(reverse,source);
  assert.ok(result.generated.includes('-sMALLOC=emmalloc -L${PREFIX}/lib'));
  const parsed=spawnSync(process.platform==="win32"?"D:/Program Files/Git/bin/bash.exe":"/bin/bash",["--noprofile","--norc","-n"],
    {input:result.generated,encoding:"utf8",windowsHide:true,timeout:10000,maxBuffer:65536});
  assert.equal(parsed.status,0,parsed.stderr||String(parsed.error));
  assert.equal(await readFile(new URL("../media/ffmpeg/build-libraries.sh",import.meta.url),"utf8"),source);
});

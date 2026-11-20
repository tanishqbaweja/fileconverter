// Source/configuration proof only, never a claimed native/browser memory saving.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { makeVp9CpuSpecialistLibraries,makeVp9CpuSpecialistWrapper,VP9_CPU_SPECIALIST_INPUTS } from "../media/ffmpeg/vp9-cpu-specialist-recipe.mjs";
import { makeVp9AllocationConfigureProbe } from "../media/ffmpeg/vp9-allocation-diagnostic-recipe.mjs";
import { makeVp9OriginalWidthSource } from "../media/ffmpeg/vp9-original-width-recipe.mjs";
import { makeVp9DurationBuildRecipe } from "../media/ffmpeg/vp9-duration-build-recipe.mjs";
const read=f=>readFile(f,"utf8"),sha=s=>createHash("sha256").update(s).digest("hex");
const libraries=await read("media/ffmpeg/build-libraries.sh"),diagnostic=makeVp9AllocationConfigureProbe(libraries),
  source=await read("media/ffmpeg/within_remux.c"),width=makeVp9OriginalWidthSource(source),base=await read("media/ffmpeg/reproduce-nondocker.sh"),
  options={temporalFilterGuard:true,allocationDiagnostics:true,lazyUtility:true,tokenContext:true,tokenPacked:true};
const reverse=r=>{let s=r.generated;for(const [before,after]of r.edits.toReversed()){assert.equal(s.split(after).length,2);s=s.replace(after,before);}return s;};
test("specialist configuration changes only output selection and explicitly retains all input-side components",()=>{
  const r=makeVp9CpuSpecialistLibraries(diagnostic.generated);assert.equal(r.edits.length,1);assert.equal(reverse(r),diagnostic.generated);
  assert.equal(r.generatedSha256,sha(r.generated));assert.deepEqual(r.outputEncoders,["libvpx_vp9"]);assert.deepEqual(r.outputMuxers,["webm"]);
  assert.ok(r.generated.includes('ENCODER_CONFIGURE_FLAGS=(--enable-encoder=libvpx_vp9)'));
  for(const line of diagnostic.generated.split("\n").filter(line=>/DECODER_CONFIGURE_FLAGS=|ENABLED_DEMUXERS=|ENABLED_PARSERS=|extra-cflags=|extra-ldflags=/.test(line)))assert.ok(r.generated.includes(line),line);
  assert.ok(r.generated.includes("ENABLED_BSFS="+VP9_CPU_SPECIALIST_INPUTS.BSF.join(",")));
  assert.equal(r.inputCodecAndContainerSupportChanged,false);assert.equal(r.actualMemorySavedBytes,null);
  assert.equal(r.codecSettingsChanged,false);assert.equal(r.ioChanged,false);assert.equal(r.memoryLimitsRaised,false);
  assert.equal(r.nativeBuildExecuted,false);assert.equal(r.browserValidated,false);assert.equal(r.publicAcceptance,false);
});
test("native profile restriction leaves every byte of approved width/clock/quality/I/O source unchanged for10/11",()=>{
  const r=makeVp9CpuSpecialistWrapper(width.generated);assert.equal(r.edits.length,1);assert.equal(reverse(r),width.generated);
  assert.deepEqual(r.allowedProfiles,[10,11]);assert.equal(r.unrelatedProfileRejectedBeforeIo,true);
  assert.ok(r.edits[0][1].endsWith('if (profile != 10 && profile != 11) return AVERROR(EINVAL);\n'));
  for(const k of ["codecSettingsChanged","ioChanged","memoryLimitsRaised","nativeBuildExecuted","browserValidated","speedGainProven","publicAcceptance"])assert.equal(r[k],false);
});
test("complete configured input sets equal the actual retained packed-core contract, not a smaller input profile",async()=>{
  const prior=JSON.parse(await read("evidence/2026-11-06-vp9-original-width-native-42244170876.json"));
  for(const [category,key]of [["DECODER","enabledDecoders"],["DEMUXER","enabledDemuxers"],["PARSER","enabledParsers"],["BSF","enabledBitstreamFilters"]])
    assert.deepEqual([...VP9_CPU_SPECIALIST_INPUTS[category]].sort(),prior.nativeContract[key].toSorted());
  assert.equal(VP9_CPU_SPECIALIST_INPUTS.DECODER.length,19);assert.equal(VP9_CPU_SPECIALIST_INPUTS.DEMUXER.length,18);
});
test("unknown, duplicate and already-specialized source cannot silently widen the candidate edit",()=>{
  for(const input of [diagnostic.generated+"\n",libraries,makeVp9CpuSpecialistLibraries(diagnostic.generated).generated])assert.throws(()=>makeVp9CpuSpecialistLibraries(input));
  for(const input of [source,width.generated+"\n",makeVp9CpuSpecialistWrapper(width.generated).generated])assert.throws(()=>makeVp9CpuSpecialistWrapper(input));
});
test("build derivation requires all prior guards, specializes before compilation and keeps complete reversible artifact provenance",()=>{
  const r=makeVp9DurationBuildRecipe(base,{...options,cpuSpecialist:true});assert.equal(reverse(r),base);assert.equal(r.cpuSpecialist,true);assert.equal(r.memoryLimitsRaised,false);
  assert.ok(r.generated.includes('make-vp9-cpu-specialist-source.mjs" configure\n./build-libraries.sh\n'));
  assert.ok(r.generated.includes('make-vp9-duration-source.mjs"\n  node "${SCRIPT_DIR}/make-vp9-cpu-specialist-source.mjs" wrapper\n'));
  for(const stem of ["build-libraries.vp9-specialist","within_remux.vp9-specialist"])for(const ext of ["base","generated","json"])assert.ok(r.generated.includes('"${OUTPUT_ROOT}/'+stem+'.'+ext+'"'));
  assert.throws(()=>makeVp9DurationBuildRecipe(base,{cpuSpecialist:true}));
  assert.throws(()=>makeVp9DurationBuildRecipe(base,{...options,cpuSpecialist:1}));
  const parsed=spawnSync(process.platform==="win32"?"D:/Program Files/Git/bin/bash.exe":"/bin/bash",["--noprofile","--norc","-n"],{input:r.generated,windowsHide:true,encoding:"utf8",timeout:10000,maxBuffer:65536});
  assert.equal(parsed.status,0,parsed.stderr||String(parsed.error));
});
test("default packed recipe remains byte-identical to the actual previous build; no published source/linker is changed",async()=>{
  const prior=JSON.parse(await read("evidence/2026-11-06-vp9-original-width-native-42244170876.json"));
  assert.equal(makeVp9DurationBuildRecipe(base,options).generatedSha256,prior.nativeContract.candidate.generatedBuildRecipeSha256);
  assert.equal(sha(libraries),"6414ea37233cf82ebb4cbac2352061ed830befbdf7eb395988b7c1e2d187f6cf");
  assert.equal(sha(source),"ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068");
  assert.equal(sha(await read("media/ffmpeg/build-remux.sh")),"904f06e36b2a3ee4509a7cb8faeda3a375314ffd5d1fd119017eb90ad0bb3a9e");
});
test("builder and dispatch fail closed on actual component inventories, limits and distinct private identity",async()=>{
  const builder=await read("media/ffmpeg/build-vp9-duration-candidate.mjs"),workflow=await read(".github/workflows/vp9-duration-nondocker.yml");
  assert.ok(builder.includes('cpuSpecialist?"private-vp9-cpu-specialist"'));
  assert.ok(builder.includes('assert.deepEqual(enabled("ENCODER"),["libvpx_vp9"])'));assert.ok(builder.includes('assert.deepEqual(enabled("MUXER"),["webm"])'));
  assert.ok(builder.includes('No narrowing of baseline input support: '));assert.ok(builder.includes('wasmPthreadPoolSize, 0'));assert.ok(builder.includes('videoCodecThreads, 1'));
  assert.ok(builder.includes('Never raise the published core\'s limits'));assert.ok(builder.includes('ancestorDurationProofIsNotCompiledSource:true'));
  assert.match(workflow,/cpu_specialist:[\s\S]*type: boolean\s*default: false/);assert.ok(workflow.includes("WITHIN_VP9_CPU_SPECIALIST:"));
  assert.doesNotMatch(workflow,/docker\s+(?:run|build)|npm\s+install/i);
  const control=await read("scripts/vp9-duration-build-control.mjs");
  for(const s of ['Number(attempt) >= 14','codex/vp9-cpu-specialist-source-20261120','WITHIN_VP9_CPU_SPECIALIST: "1"',
    'GIT_INDEX_FILE: path.join(runtime.directory, "isolated.index")','refs/heads/main','mainUnchanged: true'])assert.ok(control.includes(s),s);
});

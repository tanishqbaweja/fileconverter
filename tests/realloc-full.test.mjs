// Offline candidate/harness/source closure; never stand in for full conversion.
import assert from "node:assert/strict";
import { access,lstat,readFile,unlink } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { createAttemptPlaneCandidate,verifyAttemptPlaneCandidate,loadQualifiedReallocMedia,makeReallocFullCaller,makeReallocFullDriver,makeReallocFullStager } from "../scripts/lib/realloc-full-recipe.mjs";
import { makeLargestIdleFullCaller,makeLargestIdleFullDriver } from "../scripts/lib/packet-largest-idle-full-recipe.mjs";
import { captureLayeredFullSourcePins,writeLayeredFullSourceArchive,materializeLayeredFullSourceArchive,loadPreviousLargestIdleFullSources,SUPPLEMENTAL_LIMITS } from "../scripts/lib/realloc-full-sources.mjs";
import { makeReallocSupervisorRecipe } from "../scripts/lib/realloc-supervisor-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),reverse=recipe=>{let text=recipe.generated;for(const [before,after] of recipe.reallocEdits.toReversed())text=text.replaceAll(after,before);return text;};
function syntax(text){const result=spawnSync(process.execPath,["--check","--input-type=module"],{input:text,encoding:"utf8",windowsHide:true,timeout:5000});assert.equal(result.status,0,result.stderr);}
test("new full caller reverses exactly, retains ALL439 previous sources and full input/three runs/250MiB/quality/native sampler/cleanup gates",async()=>{
  const previous=await makeLargestIdleFullCaller(root),caller=await makeReallocFullCaller(root),legacy=await loadPreviousLargestIdleFullSources(root);
  assert.equal(reverse(caller),previous.generated);syntax(caller.generated);
  for(const file of Object.keys(legacy.proof.sourcePins))assert.ok(caller.extraFiles.includes(file),file);
  assert.equal(SUPPLEMENTAL_LIMITS.legacyFiles,380);assert.equal(SUPPLEMENTAL_LIMITS.supplementalFiles,128);assert.equal(SUPPLEMENTAL_LIMITS.supplementalRestoredBytes,2097152);
  for(const token of ["requestedRuns: 3","21600000","primaryLimitMiB: 250","nativeBitRate: 4000000","32 * 1024 ** 3","protectedSource()","finishOwnedCleanup(actions)","raw.forbiddenRequests, []","inputReadFailureSamples.length <= 6","realloc)-full-live"])
    assert.ok(caller.generated.includes(token),token);
});
test("actual249 qualification composition/new original glue/full driver/380+128 source envelope reverses and round-trips with finally scratch/report removal",async()=>{
  const runtime=await createOwnedRuntimeScratch("allocation-attempt-full-wrapper-"),candidate=await createOwnedRuntimeScratch("allocation-attempt-media-");let record;
  try {
    const qualified=await loadQualifiedReallocMedia(root),previous=await loadPreviousLargestIdleFullSources(root),caller=await makeReallocFullCaller(root);
    const composition=await createAttemptPlaneCandidate(root,candidate.directory);assert.deepEqual(composition.manifest,qualified.report.manifest);
    assert.equal(composition.manifest.artifacts["within-mpeg2-split.wasm"],"eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c");
    assert.equal(composition.manifest.artifacts["split-encoder.wasm"],"a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
    assert.deepEqual(await verifyAttemptPlaneCandidate(root,candidate.directory),qualified.report.manifest);
    const files=[...new Set([...caller.extraFiles,...Object.keys(qualified.proof.sourcePins),qualified.reference.path,qualified.proof.generatedArchive.path,qualified.proof.report.archive.path])];
    const snapshot=await captureLayeredFullSourcePins(root,files);assert.equal(snapshot.legacyFilesRetained,380);assert.equal(snapshot.omittedLegacyFiles,0);
    assert.ok(snapshot.supplementalFiles.length<=128);assert.ok(snapshot.supplementalRestoredBytes<=2097152);
    for(const file of [...Object.keys(previous.proof.sourcePins),...Object.keys(qualified.proof.sourcePins)])assert.ok(snapshot.files.includes(file),file);
    const name=path.basename(candidate.directory),driver=await makeReallocFullDriver(root,runtime.directory,name,snapshot.files),parentDriver=await makeLargestIdleFullDriver(root,runtime.directory,name,snapshot.files);
    assert.equal(reverse(driver),parentDriver.generated);syntax(driver.generated);assert.deepEqual(driver.adapter,qualified.adapter);
    for(const token of ["inputReadFailureSamples","WITHIN_INPUT_READ_FAILURE","suspension.frees,1","ssim >= 0.98","blankBaseline","native-checkpoint.json","windowsHide: true","realloc-full-failure-record.mjs","supplementalSourceFiles","limitMiB: 250"])
      assert.ok(driver.generated.includes(token),token);
    assert.ok(!driver.generated.includes("__WITHIN_INPUT_READ_CONTROL__"));
    const stager=await makeReallocFullStager(root,name);syntax(stager.generated);assert.equal(reverse(stager),qualified.archive.generated.stage);
    const stamp=new Date().toISOString().replaceAll(/[:.]/g,"-");record=await writeLayeredFullSourceArchive(root,stamp,snapshot,{...driver,traceHelper:previous.archive.traceHelper,generatedCaller:caller.generated});
    const restored=await materializeLayeredFullSourceArchive(root,record);assert.deepEqual(restored.sourcePins,snapshot.pins);assert.equal(restored.generated,driver.generated);
    assert.equal(restored.allPreimagesRecovered,true);assert.equal(restored.legacyBytesRewritten,false);
    for(const [file,hash] of Object.entries(snapshot.pins))assert.equal(sha(Buffer.from(restored.sourcePreimages[file].data,"base64")),hash,file);
    await assert.rejects(materializeLayeredFullSourceArchive(root,{...record,sha256:"0".repeat(64)}));
    console.log(JSON.stringify({sources:snapshot.files.length,supplementalFiles:snapshot.supplementalFiles.length,supplementalRestoredBytes:snapshot.supplementalRestoredBytes}));
  }finally {
    if(record){const target=path.join(root,record.path);assert.equal(path.dirname(target),path.join(root,"outputs/reports"));const info=await lstat(target);assert.ok(info.isFile()&&!info.isSymbolicLink());assert.equal(sha(await readFile(target)),record.sha256);await unlink(target);}
    await Promise.all([runtime.close(),candidate.close()]);await assert.rejects(access(runtime.directory),{code:"ENOENT"});await assert.rejects(access(candidate.directory),{code:"ENOENT"});
  }
});
test("fresh supervisor preserves audited hidden births/no restart/one-minute journal/bounded tails/owned finally behavior",async()=>{
  const source=(await read("scripts/launch-packet-largest-idle-supervisor.mjs")).toString(),recipe=makeReallocSupervisorRecipe(source,root);syntax(recipe.generated);
  for(const token of ["windowsHide: true","detached: true","heartbeatSeconds: 60","runtime.close()","noAutomaticRestart: true","scripts/run-realloc-original-full.mjs","Observation timeout does not authorize"])
    assert.ok(recipe.generated.toLowerCase().includes(token.toLowerCase()),token);
});

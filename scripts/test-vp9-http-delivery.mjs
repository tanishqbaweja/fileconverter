// One distinct local HTTP transport control, same browser conversion/native bytes.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {gunzipSync,gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import path from "node:path";
import {spawn} from "node:child_process";
import {transform} from "esbuild";
import {createOwnedRuntimeScratch} from "./lib/owned-runtime-scratch.mjs";
import {makeVp9HttpSource} from "./lib/vp9-http-recipe.mjs";
import {makeVp9TemporalQualificationSource} from "./lib/vp9-temporal-qualification-recipe.mjs";
import {makeVp9OriginalStartupSource} from "./lib/vp9-original-startup-recipe.mjs";
const args=process.argv.slice(2);assert.ok(args.length<=3&&new Set(args).size===args.length&&args.every(x=>["--original","--check-only","--bounded-trace"].includes(x)));
const checkOnly=args.includes("--check-only"),boundedTrace=args.includes("--bounded-trace"),kind=args.includes("--original")?"original":"qualification",root=path.resolve(import.meta.dirname,".."),
  runId=process.env.WITHIN_VP9_ORIGINAL_NATIVE_RUN_ID??"42244170876",sha=b=>createHash("sha256").update(b).digest("hex"),
  parentFile=kind==="original"?"evidence/2026-11-06-vp9-original-cpu-startup-attempt8-recipe.json":
    "evidence/2026-11-06-vp9-token-packed-qualification-"+runId+"-recipe.json",parentBytes=await readFile(path.join(root,parentFile)),parent=JSON.parse(parentBytes),
  source=gunzipSync(Buffer.from(parent.generatedSourceGzipBase64,"base64"),{maxOutputLength:1048576}).toString();
assert.equal(sha(source),parent.generatedSha256);
const ancestorFile=kind==="original"?"evidence/2026-11-05-webcodecs-vp9-stream-duration-fidelity-42020605269-recipe.json":
  "evidence/2026-11-05-webcodecs-vp9-recovery-qualification-42020605269-recipe.json",ancestor=JSON.parse(await readFile(path.join(root,ancestorFile))),
  ancestorSource=gunzipSync(Buffer.from(ancestor.generatedSourceGzipBase64,"base64"),{maxOutputLength:1048576}).toString();
assert.equal(sha(ancestorSource),ancestor.generatedSha256);
let reconstructed=await readFile(path.join(root,"scripts/test-webcodecs-vp9-smoke.mjs"),"utf8");assert.equal(sha(reconstructed),ancestor.parentSha256);
for(const [before,after]of ancestor.edits){assert.equal(reconstructed.split(before).length,2);reconstructed=reconstructed.replace(before,after);}assert.equal(reconstructed,ancestorSource);
assert.equal(source,kind==="original"?makeVp9OriginalStartupSource(ancestorSource,root,8,runId).generated:
  makeVp9TemporalQualificationSource(ancestorSource,runId,{allocationDiagnostics:true,lazyUtility:true,tokenContext:true,tokenPacked:true}).generated);
const recipe=makeVp9HttpSource(source,root,runId,kind,{boundedTrace});await transform(recipe.generated,{loader:"js",format:"esm"});
if(checkOnly)console.log(JSON.stringify({reversible:true,kind,generatedSha256:recipe.generatedSha256,browserLaunched:false,recipeWritten:false}));
else {
  const native=JSON.parse(await readFile(path.join(root,"evidence/2026-11-06-vp9-original-width-native-"+runId+".json")));
  assert.equal(native.nativeContract.engine,"private-vp9-token-packed");assert.equal(native.nativeContract.candidate.tokenPacked.layout.packedRecordBytes,4);
  assert.equal(native.nativeContract.candidate.memoryLimitsRaised,false);assert.equal(native.publicAcceptance,false);
  const controlFile="evidence/2026-11-06-vp9-token-packed-"+(kind==="original"?"http-":"")+"qualification-"+runId+(kind==="original"&&boundedTrace?"-attempt2":"")+".json",
    controlBytes=await readFile(path.join(root,controlFile)),control=JSON.parse(controlBytes);
  assert.equal(control.status,"passed-private-vp9-recovery-sequence-not-large-or-public-acceptance");assert.deepEqual(control.failures,[]);
  assert.equal(control.privateCpuOverride.runId,Number(runId));assert.equal(control.independentFidelity.passed,true);assert.equal(control.recovery.passed,true);
  assert.equal(control.outputSha256,"82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b");
  assert.ok(Number.isFinite(control.memory.incrementalPrivateMiB)&&control.memory.incrementalPrivateMiB<=250&&control.memory.validSamples>0);
  assert.equal(control.memory.unavailableSamples,0);assert.equal(control.ownedRuntimeRemoved,true);assert.equal(control.ownedStaticStageRemoved,true);
  let priorHttpFailure=null;
  if(boundedTrace) {
    const file="evidence/2026-11-06-vp9-token-packed-http-qualification-"+runId+".json",bytes=await readFile(path.join(root,file)),old=JSON.parse(bytes);
    assert.equal(old.status,"failed-private-vp9-browser-smoke");assert.equal(old.memory.incrementalPrivateMiB,264.25390625);
    assert.equal(old.independentFidelity.passed,true);assert.equal(old.privateCpuOverride.stageRemoved,true);assert.equal(old.ownedRuntimeRemoved,true);
    assert.deepEqual(old.forbiddenRequests,[]);assert.ok(old.processCleanup.every(x=>x.status==="owned-identity-absent"));
    priorHttpFailure={file,sha256:sha(bytes),failedResultPreserved:true,reasonForDistinctControl:"Trace captured full static Wasm response bodies; bounded metadata/API/screenshots retain all conversion/OS-memory gates"};
  }
  if(kind==="original") {
    assert.equal(control.normalHttpEngineDelivery,true);assert.equal(control.privateCpuOverride.stageRemoved,true);
    assert.equal(control.privateCpuOverride.securityCacheAndMimeHeadersPreserved,true);assert.equal(control.privateCpuOverride.devtoolsResponseBodyUsed,false);
    assert.deepEqual(control.privateCpuOverride.served,{javascript:6,wasm:6});assert.deepEqual(control.privateCpuOverride.errors,[]);
    const old=JSON.parse(await readFile(path.join(root,"evidence/2026-11-06-vp9-original-cpu-startup-attempt8.json")));
    assert.equal(old.status,"failed-private-vp9-browser-smoke");assert.equal(old.originalStartup.stop.kind,"memory-budget-exceeded");
    assert.equal(old.originalStartup.partialOutputRemoved,true);assert.deepEqual(old.originalBefore,old.originalAfter);
  }
  const prefix=kind==="original"?"evidence/2026-11-06-vp9-original-cpu-startup-attempt9":"evidence/2026-11-06-vp9-token-packed-http-qualification-"+runId+(boundedTrace?"-attempt2":""),
    {generated,...compact}=recipe;
  await writeFile(path.join(root,prefix+"-recipe.json"),JSON.stringify({...compact,parentRecipe:parentFile,parentRecipeSha256:sha(parentBytes),
    qualificationGate:{file:controlFile,sha256:sha(controlBytes)},priorHttpFailure,generatedSourceGzipBase64:gzipSync(generated,{level:9}).toString("base64")},null,2)+"\n",{flag:"wx"});
  const runtime=await createOwnedRuntimeScratch("vp9-http-control-");
  try {
    const file=path.join(runtime.directory,"http-control.mjs");await writeFile(file,generated,{flag:"wx"});
    const child=spawn(process.execPath,[file],{cwd:root,env:runtime.env,windowsHide:true,stdio:"inherit"});
    process.exitCode=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>
      signal?reject(new Error("HTTP control interrupted: "+signal)):resolve(code??1));});
  }finally{await runtime.close();}
}

// One untouched-original safety gate, never a full original transcode claim.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { transform } from "esbuild";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { loadVp9DurationCpuAssets } from "./lib/vp9-duration-browser-assets.mjs";
import { makeVp9CpuSpecialistOriginalSource } from "./lib/vp9-cpu-specialist-original-recipe.mjs";
const args=process.argv.slice(2);assert.ok(args.length<=1&&args.every(x=>x==="--check-only"));
const checkOnly=args.includes("--check-only"),root=path.resolve(import.meta.dirname,".."),runId=process.env.WITHIN_VP9_ORIGINAL_NATIVE_RUN_ID??(checkOnly?"12345678":""),
  parentFile="evidence/2026-11-06-vp9-token-packed-http-qualification-42244170876-attempt2-recipe.json",parentBytes=await readFile(path.join(root,parentFile)),parent=JSON.parse(parentBytes),
  source=gunzipSync(Buffer.from(parent.generatedSourceGzipBase64,"base64"),{maxOutputLength:1048576}).toString(),sha=b=>createHash("sha256").update(b).digest("hex");
assert.equal(sha(source),parent.generatedSha256);
const recipe=makeVp9CpuSpecialistOriginalSource(source,root,runId);await transform(recipe.generated,{loader:"js",format:"esm"});
if(checkOnly)console.log(JSON.stringify({generatedSha256:recipe.generatedSha256,reversible:true,browserLaunched:false,recipeWritten:false}));
else{
  assert.equal(process.platform,"win32");await loadVp9DurationCpuAssets(root,runId,"cpu-specialist");
  const controlFile="evidence/2026-11-20-vp9-cpu-specialist-qualification-"+runId+".json",controlBytes=await readFile(path.join(root,controlFile)),control=JSON.parse(controlBytes);
  assert.equal(control.status,"passed-private-vp9-recovery-sequence-not-large-or-public-acceptance");assert.deepEqual(control.failures,[]);
  assert.equal(control.recovery.passed,true);assert.equal(control.independentFidelity.passed,true);assert.equal(control.memory.unavailableSamples,0);
  assert.ok(control.memory.validSamples>0&&control.memory.incrementalPrivateMiB<=250);assert.equal(control.browserCleanup.status,"owned-observed-pids-absent");
  assert.equal(control.outputSha256,"82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b");
  assert.equal(control.ownedRuntimeRemoved,true);assert.deepEqual(control.originalBefore,control.originalAfter);
  const {generated,...compact}=recipe;
  await writeFile(path.join(root,"evidence/2026-11-20-vp9-cpu-specialist-original-startup-"+runId+"-recipe.json"),
    JSON.stringify({...compact,parentRecipe:parentFile,parentRecipeSha256:sha(parentBytes),smallGate:controlFile,smallGateSha256:sha(controlBytes),
      generatedSourceGzipBase64:gzipSync(generated,{level:9}).toString("base64")},null,2)+"\n",{flag:"wx"});
  const runtime=await createOwnedRuntimeScratch("vp9-specialist-original-");
  try{
    const file=path.join(runtime.directory,"original.mjs");await writeFile(file,generated,{flag:"wx"});
    const child=spawn(process.execPath,[file],{cwd:root,env:runtime.env,windowsHide:true,stdio:"inherit"});
    process.exitCode=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>signal?reject(new Error("Original specialist gate interrupted: "+signal)):resolve(code??1));});
  }finally{await runtime.close();}
}

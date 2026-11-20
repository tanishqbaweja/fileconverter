// One strict small automatic-fallback qualification, not original-file acceptance.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { transform } from "esbuild";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeVp9CpuSpecialistQualificationSource } from "./lib/vp9-cpu-specialist-qualification-recipe.mjs";
import { loadVp9DurationCpuAssets } from "./lib/vp9-duration-browser-assets.mjs";
const args=process.argv.slice(2);assert.ok(args.length<=1&&args.every(x=>x==="--check-only"));
const checkOnly=args.includes("--check-only"),root=path.resolve(import.meta.dirname,".."),
  runId=process.env.WITHIN_VP9_ORIGINAL_NATIVE_RUN_ID??(checkOnly?"12345678":""),
  parentFile="evidence/2026-11-06-vp9-token-packed-http-qualification-42244170876-attempt2-recipe.json",
  bytes=await readFile(path.join(root,parentFile)),parent=JSON.parse(bytes),
  source=gunzipSync(Buffer.from(parent.generatedSourceGzipBase64,"base64"),{maxOutputLength:1048576}).toString(),
  sha=value=>createHash("sha256").update(value).digest("hex");
assert.equal(sha(source),parent.generatedSha256);
const recipe=makeVp9CpuSpecialistQualificationSource(source,root,runId);
await transform(recipe.generated,{loader:"js",format:"esm"});
if(checkOnly)console.log(JSON.stringify({generatedSha256:recipe.generatedSha256,reversible:true,browserLaunched:false,recipeWritten:false}));
else{
  assert.equal(process.platform,"win32");
  const assets=await loadVp9DurationCpuAssets(root,runId,"cpu-specialist");
  const nativeFile="evidence/2026-11-20-vp9-cpu-specialist-native-"+runId+".json",nativeBytes=await readFile(path.join(root,nativeFile)),native=JSON.parse(nativeBytes);
  assert.equal(native.nativeContract.engine,"private-vp9-cpu-specialist");
  assert.equal(native.nativeContract.candidate.tokenPacked.layout.packedRecordBytes,4);
  assert.equal(native.nativeContract.candidate.cpuSpecialist.inputSupportChanged,false);
  const {generated,...compact}=recipe;
  await writeFile(path.join(root,"evidence/2026-11-20-vp9-cpu-specialist-qualification-"+runId+"-recipe.json"),
    JSON.stringify({...compact,parentRecipe:parentFile,parentRecipeSha256:sha(bytes),nativeReceipt:nativeFile,
      nativeReceiptSha256:sha(nativeBytes),authenticatedStaticAssets:assets,
      generatedSourceGzipBase64:gzipSync(generated,{level:9}).toString("base64")},null,2)+"\n",{flag:"wx"});
  const runtime=await createOwnedRuntimeScratch("vp9-cpu-specialist-control-");
  try{
    const file=path.join(runtime.directory,"qualification.mjs");await writeFile(file,generated,{flag:"wx"});
    const child=spawn(process.execPath,[file],{cwd:root,env:runtime.env,windowsHide:true,stdio:"inherit"});
    process.exitCode=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>
      signal?reject(new Error("Specialist qualification interrupted: "+signal)):resolve(code??1));});
  }finally{await runtime.close();}
}

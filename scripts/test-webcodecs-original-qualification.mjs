// One genuine headless platform-only control; no original/scaling acceptance.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {gunzipSync,gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import path from "node:path";
import {spawn} from "node:child_process";
import {transform} from "esbuild";
import {createOwnedRuntimeScratch} from "./lib/owned-runtime-scratch.mjs";
import {makeWebCodecsOriginalQualification} from "./lib/webcodecs-original-qualification-recipe.mjs";
assert.ok(process.argv.length===2||(process.argv.length===3&&process.argv[2]==="--check-only"));
const checkOnly=process.argv[2]==="--check-only",root=path.resolve(import.meta.dirname,".."),
  runId=process.env.WITHIN_WEBCODECS_ORIGINAL_RUN_ID??(checkOnly?"12345678":""),
  sha=s=>createHash("sha256").update(s).digest("hex"),parentFile="evidence/2026-11-01-webcodecs-vp9-rebuilt-native-recipe.json",
  parentBytes=await readFile(path.join(root,parentFile)),parent=JSON.parse(parentBytes),
  source=gunzipSync(Buffer.from(parent.generatedSourceGzipBase64,"base64"),{maxOutputLength:1048576}).toString();
assert.equal(sha(source),parent.generatedSha256);
let ancestry=await readFile(path.join(root,"scripts/test-webcodecs-vp9-smoke.mjs"),"utf8");assert.equal(sha(ancestry),parent.parentSha256);
for(const [before,after]of parent.edits){assert.equal(ancestry.split(before).length,2);ancestry=ancestry.replace(before,after);}assert.equal(ancestry,source);
const recipe=makeWebCodecsOriginalQualification(source,root,runId);await transform(recipe.generated,{loader:"js",format:"esm"});
if(checkOnly)console.log(JSON.stringify({reversible:true,generatedSha256:recipe.generatedSha256,browserLaunched:false,recipeWritten:false}));
else {
  const native=JSON.parse(await readFile(path.join(root,"evidence/2026-11-06-webcodecs-vp9-original-native-"+runId+".json")));
  assert.equal(native.nativeContract.originalWidthCandidate.privateVp9ExplicitWidth,1920);
  assert.equal(native.nativeContract.originalWidthCandidate.memoryLimitsRaised,false);assert.equal(native.publicAcceptance,false);
  assert.deepEqual(native.nativeContract.memoryLimits,[{imported:false,initialPages:512,maximumPages:512,shared:false}]);
  const {generated,...compact}=recipe;
  await writeFile(path.join(root,"evidence/2026-11-06-webcodecs-vp9-original-qualification-"+runId+"-recipe.json"),
    JSON.stringify({...compact,parentRecipe:parentFile,parentRecipeSha256:sha(parentBytes),generatedSourceGzipBase64:gzipSync(generated,{level:9}).toString("base64")},null,2)+"\n",{flag:"wx"});
  const runtime=await createOwnedRuntimeScratch("webcodecs-original-qualification-");
  try {
    const file=path.join(runtime.directory,"qualification.mjs");await writeFile(file,generated,{flag:"wx"});
    const child=spawn(process.execPath,[file],{cwd:root,env:runtime.env,windowsHide:true,stdio:"inherit"});
    process.exitCode=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>
      signal?reject(new Error("Platform qualification interrupted: "+signal)):resolve(code??1));});
  } finally {await runtime.close();}
}

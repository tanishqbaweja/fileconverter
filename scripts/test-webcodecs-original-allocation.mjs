// One distinct headless allocation diagnostic; never a passing stress replay.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {gunzipSync,gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import path from "node:path";
import {spawn} from "node:child_process";
import {transform} from "esbuild";
import {createOwnedRuntimeScratch} from "./lib/owned-runtime-scratch.mjs";
import {makeWebCodecsOriginalStartup} from "./lib/webcodecs-original-startup-recipe.mjs";
import {makeWebCodecsOriginalAllocation} from "./lib/webcodecs-original-allocation-recipe.mjs";
import {assertReviewedVp9RecipeParent} from "./lib/reviewed-vp9-recipe-root.mjs";
assert.ok(process.argv.length===2||(process.argv.length===3&&process.argv[2]==="--check-only"));
const checkOnly=process.argv[2]==="--check-only",root=path.resolve(import.meta.dirname,".."),
  runId=process.env.WITHIN_WEBCODECS_ORIGINAL_RUN_ID??"42231818045",sha=s=>createHash("sha256").update(s).digest("hex"),
  nativeParent=JSON.parse(await readFile(path.join(root,"evidence/2026-11-01-webcodecs-vp9-rebuilt-native-recipe.json"))),
  nativeSource=gunzipSync(Buffer.from(nativeParent.generatedSourceGzipBase64,"base64"),{maxOutputLength:1048576}).toString();
assert.equal(sha(nativeSource),nativeParent.generatedSha256);
let ancestry=await readFile(path.join(root,"scripts/test-webcodecs-vp9-smoke.mjs"),"utf8");assert.equal(sha(ancestry),nativeParent.parentSha256);
for(const [before,after]of nativeParent.edits){assert.equal(ancestry.split(before).length,2);ancestry=ancestry.replace(before,after);}assert.equal(ancestry,nativeSource);
const parentFile="evidence/2026-11-06-webcodecs-vp9-original-startup-"+runId+"-recipe.json",
  parentBytes=await readFile(path.join(root,parentFile)),parent=JSON.parse(parentBytes),
  source=gunzipSync(Buffer.from(parent.generatedSourceGzipBase64,"base64"),{maxOutputLength:1048576}).toString();
assert.equal(sha(source),parent.generatedSha256);
assertReviewedVp9RecipeParent(makeWebCodecsOriginalStartup(nativeSource,root,runId).generated,source,root,"allocation",checkOnly);
const recipe=makeWebCodecsOriginalAllocation(source,root,runId);await transform(recipe.generated,{loader:"js",format:"esm"});
if(checkOnly)console.log(JSON.stringify({reversible:true,generatedSha256:recipe.generatedSha256,browserLaunched:false,recipeWritten:false}));
else {
  const prior=JSON.parse(await readFile(path.join(root,"evidence/2026-11-06-webcodecs-vp9-original-startup-"+runId+".json"))),
    native=JSON.parse(await readFile(path.join(root,"evidence/2026-11-06-webcodecs-vp9-original-native-"+runId+".json")));
  assert.equal(prior.status,"failed-private-vp9-browser-smoke");assert.equal(prior.originalStartup.stop.kind,"memory-budget-exceeded");
  assert.ok(prior.memory.incrementalPrivateMiB>250);assert.equal(prior.originalStartup.partialOutputRemoved,true);
  assert.equal(prior.ownedRuntimeRemoved,true);assert.equal(prior.ownedStaticStageRemoved,true);
  assert.deepEqual(prior.originalBefore,prior.originalAfter);assert.deepEqual(prior.forbiddenRequests,[]);
  assert.ok(prior.processCleanup.every(x=>x.status==="owned-identity-absent"));
  assert.equal(native.nativeContract.originalWidthCandidate.privateVp9ExplicitWidth,1920);
  assert.equal(native.nativeContract.originalWidthCandidate.memoryLimitsRaised,false);
  assert.deepEqual(native.nativeContract.memoryLimits,[{imported:false,initialPages:512,maximumPages:512,shared:false}]);
  const {generated,...compact}=recipe;
  await writeFile(path.join(root,"evidence/2026-11-06-webcodecs-vp9-original-allocation-"+runId+"-recipe.json"),JSON.stringify({...compact,
    parentRecipe:parentFile,parentRecipeSha256:sha(parentBytes),generatedSourceGzipBase64:gzipSync(generated,{level:9}).toString("base64")},null,2)+"\n",{flag:"wx"});
  const runtime=await createOwnedRuntimeScratch("webcodecs-original-allocation-");
  try {
    const file=path.join(runtime.directory,"allocation.mjs");await writeFile(file,generated,{flag:"wx"});
    const child=spawn(process.execPath,[file],{cwd:root,env:runtime.env,windowsHide:true,stdio:"inherit"});
    process.exitCode=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>
      signal?reject(new Error("Allocation diagnostic interrupted: "+signal)):resolve(code??1));});
  }finally{await runtime.close();}
}

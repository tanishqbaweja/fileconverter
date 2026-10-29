// Two pinned bindgen/cap passes for the verified filter source artifact only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access,mkdir,readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makeFilterPostprocessRecipe } from "./filter-postprocess-recipe.mjs";
import { makeContextPostprocessRecipe } from "./context-postprocess-recipe.mjs";
import { makeLivenessPostprocessRecipe } from "./liveness-postprocess-recipe.mjs";
import { filterRegionPatch } from "./filter-region-patch.mjs";
import { renderContextPatch } from "./render-context-patch.mjs";
import { filterLivenessPatch } from "./filter-liveness-patch.mjs";
import { filterPrecisionPatch } from "./filter-precision-patch.mjs";
import { makePrecisionPostprocessRecipe } from "./precision-postprocess-recipe.mjs";
import { premultipliedTransferPatch } from "./premultiplied-transfer-patch.mjs";
import { makePremultipliedPostprocessRecipe } from "./premultiplied-postprocess-recipe.mjs";
import { sha } from "./source-pins.mjs";
assert.equal(process.platform,"linux");const premultiplied=process.argv[2]==="--premultiplied",precision=process.argv[2]==="--precision",liveness=premultiplied||precision||process.argv[2]==="--liveness",contextVariant=liveness||process.argv[2]==="--context";
assert.ok(process.argv.length===2||(process.argv.length===3&&contextVariant));assert.match(process.env.GITHUB_RUN_ID??"",/^[0-9]+$/);
const root=path.resolve(import.meta.dirname,"../.."),runId=process.env.GITHUB_RUN_ID,output=path.join(root,"outputs/reports");
const report={schemaVersion:1,runId,contextVariant,liveness,precision,premultiplied,startedAt:new Date().toISOString(),sourcePins:{},failures:[],
  scope:"Verified region-patched source artifact plus two exact pinned bindgen/cap passes; no browser/fidelity/250MiB acceptance",
  publicEngineReplacement:false,rendererExecuted:false,wholeGoalComplete:false};
let runtime,child,log="";
try{
  await mkdir(output,{recursive:true});
  for(const file of ["images/resvg-source/postprocess-repeated-source.mjs","images/resvg-source/postprocess-filter-region-source.mjs","images/resvg-source/filter-postprocess-recipe.mjs",
    "images/resvg-source/filter-region-raw-input.json","images/resvg-source/filter-region-patch.mjs",".github/workflows/svg-source-filter-postprocess.yml"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  for(const file of ["images/resvg-source/context-postprocess-recipe.mjs","images/resvg-source/render-context-patch.mjs"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(contextVariant)for(const file of ["images/resvg-source/filter-context-raw-input.json",".github/workflows/svg-context-postprocess.yml"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(liveness)for(const file of ["images/resvg-source/filter-liveness-raw-input.json","images/resvg-source/liveness-postprocess-recipe.mjs","images/resvg-source/filter-liveness-patch.mjs",".github/workflows/svg-liveness-postprocess.yml"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(precision)for(const file of ["images/resvg-source/filter-precision-raw-input.json","images/resvg-source/precision-postprocess-recipe.mjs","images/resvg-source/filter-precision-patch.mjs","images/resvg-source/filter-precision-kernel.rs",".github/workflows/svg-precision-postprocess.yml"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(premultiplied)for(const file of ["images/resvg-source/filter-premultiplied-raw-input.json","images/resvg-source/premultiplied-postprocess-recipe.mjs","images/resvg-source/premultiplied-transfer-patch.mjs","images/resvg-source/premultiplied-transfer-kernel.rs",".github/workflows/svg-premultiplied-postprocess.yml"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  runtime=await createOwnedRuntimeScratch("resvg-filter-process-owner-");
  const recipe=(premultiplied?makePremultipliedPostprocessRecipe:precision?makePrecisionPostprocessRecipe:liveness?makeLivenessPostprocessRecipe:contextVariant?makeContextPostprocessRecipe:makeFilterPostprocessRecipe)({root,sourceBytes:await readFile(path.join(root,"images/resvg-source/postprocess-repeated-source.mjs"))});
  report.recipe=recipe.proof;report.generatedSourceArchive={bytes:Buffer.byteLength(recipe.source),sha256:sha(recipe.source),gzipBase64:gzipSync(recipe.source,{level:9}).toString("base64")};
  const file=path.join(runtime.directory,"processor.mjs");await writeFile(file,recipe.source,{flag:"wx"});
  child=spawn(process.execPath,[file],{cwd:root,env:{...runtime.env,GH_PROMPT_DISABLED:"true"},windowsHide:true,stdio:["ignore","pipe","pipe"]});
  for(const pipe of [child.stdout,child.stderr])pipe.on("data",bytes=>{log=(log+bytes).slice(-32768);});
  report.childExit=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>{report.childSignal=signal;resolve(code);});});
  assert.equal(report.childSignal,null);assert.equal(report.childExit,0,log);
  const receiptPath=`outputs/reports/resvg-source-processed-repeat-${runId}.json`,bytes=await readFile(path.join(root,receiptPath)),receipt=JSON.parse(bytes);
  assert.equal(receipt.status,"repeated-source-and-processed-private-candidate-byte-identical-before-browser-acceptance");
  assert.equal(receipt.filterRegionPatch.patchedSha256,filterRegionPatch.patchedSha256);
  if(contextVariant)assert.equal(receipt.renderContextPatch.patchedSha256,renderContextPatch.patchedSha256);
  if(liveness)assert.equal(receipt.filterLivenessPatch.patchedSha256,filterLivenessPatch.patchedSha256);
  if(precision){assert.equal(receipt.filterPrecisionPatch.patchedSha256,filterPrecisionPatch.patchedSha256);assert.equal(receipt.sourceFinalMergePrecisionChanged,true);}
  if(premultiplied){assert.equal(receipt.premultipliedTransferPatch.patchedSha256,premultipliedTransferPatch.patchedSha256);assert.equal(receipt.sourcePremultipliedTransferChanged,true);}
  assert.equal(receipt.processedWasmAndGlueByteIdentical,true);assert.equal(receipt.twoSourceBuildReceiptsAndRawEqualityVerified,true);
  assert.equal(receipt.ownedScratchRemoved,true);assert.equal(receipt.publicEngineUnchanged,true);assert.deepEqual(receipt.failures,[]);
  report.processedReceipt={path:receiptPath,bytes:bytes.length,sha256:sha(bytes)};report.candidate=receipt.candidate;
  report.status=premultiplied?"two-pinned-premultiplied-source-postprocessing-passes-byte-identical-not-browser-acceptance":precision?"two-pinned-precision-source-postprocessing-passes-byte-identical-not-browser-acceptance":liveness?"two-pinned-liveness-source-postprocessing-passes-byte-identical-not-browser-acceptance":contextVariant?"two-pinned-context-source-postprocessing-passes-byte-identical-not-browser-acceptance":"two-pinned-filter-source-postprocessing-passes-byte-identical-not-browser-acceptance";
}catch(error){report.status="failed-private-filter-source-postprocessing";report.failures.push(String(error.stack??error));process.exitCode=1;}
finally{
  try{
    assert.ok(!child||child.pid===undefined||(child.exitCode!==null&&child.signalCode===null),"Do not delete a live postprocessor owner");
    await runtime?.close();report.ownedOwnerScratchRemoved=Boolean(runtime);
    if(runtime)await assert.rejects(access(runtime.directory),{code:"ENOENT"});
    for(const [file,digest]of Object.entries(report.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),digest,file);
  }catch(error){report.status="failed-private-filter-source-postprocessing";report.failures.push("Owned cleanup/source verification: "+error);process.exitCode=1;}
  report.logTail=log;report.finishedAt=new Date().toISOString();
  const file=path.join(output,`resvg-filter-${premultiplied?"premultiplied-":precision?"precision-":liveness?"liveness-":contextVariant?"context-":""}processed-owner-${runId}.json`);await writeFile(file,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({file,status:report.status,candidate:report.candidate,failures:report.failures}));
}

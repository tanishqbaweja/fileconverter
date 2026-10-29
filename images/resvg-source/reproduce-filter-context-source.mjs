// Two fresh private source builds; no image rendering or user-file access.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access,mkdir,readFile,statfs,writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makeContextBuildRecipes } from "./context-build-recipe.mjs";
import { makeLivenessBuildRecipes } from "./liveness-build-recipe.mjs";
import { makePrecisionBuildRecipes } from "./precision-build-recipe.mjs";
import { makePremultipliedBuildRecipes } from "./premultiplied-build-recipe.mjs";
import { sha } from "./source-pins.mjs";
const premultiplied=process.argv[2]==="--premultiplied",precision=process.argv[2]==="--precision",liveness=premultiplied||precision||process.argv[2]==="--liveness";
assert.equal(process.platform,"linux");assert.ok(process.argv.length===2||(process.argv.length===3&&liveness));assert.match(process.env.GITHUB_RUN_ID??"",/^[0-9]{1,14}$/);
const variant=premultiplied?"premultiplied":precision?"precision":liveness?"liveness":"context";
const root=path.resolve(import.meta.dirname,"../.."),runId=process.env.GITHUB_RUN_ID,output=path.join(root,"outputs/reports");
const report={schemaVersion:1,runId,variant,startedAt:new Date().toISOString(),sourcePins:{},failures:[],
  scope:premultiplied?"Two fresh locked compilations with fixed-size premultiplied transfer tables and8-bit compositing; no browser acceptance":precision?"Two fresh locked compilations plus pinned-compiler numeric tests with high-precision final linearRGB merge; no browser acceptance":liveness?"Two fresh locked compilations with region/context fixes and last-use intermediate ownership release; no browser acceptance":"Two fresh locked compilations with original region patch plus child/mask context-coordinate correction; no browser acceptance",
  publicEngineReplacement:false,rendererExecuted:false,wholeGoalComplete:false};
let runtime,child,log="";
try{
  await mkdir(output,{recursive:true});const disk=await statfs(root);assert.ok(disk.bavail*disk.bsize>=8*1024**3);
  const files=["images/resvg-source/compile-candidate.mjs","images/resvg-source/reproduce-raw-source.mjs","images/resvg-source/filter-build-recipe.mjs",
    "images/resvg-source/filter-region-patch.mjs","images/resvg-source/context-build-recipe.mjs","images/resvg-source/render-context-patch.mjs",
    "images/resvg-source/reproduce-filter-context-source.mjs","fixtures/source/resvg-render-3495d870-preimage.json",".github/workflows/svg-source-render-context.yml"];
  if(liveness)files.push("images/resvg-source/filter-liveness-patch.mjs","images/resvg-source/liveness-build-recipe.mjs",".github/workflows/svg-source-filter-liveness.yml");
  if(precision)files.push("images/resvg-source/filter-precision-patch.mjs","images/resvg-source/filter-precision-kernel.rs","images/resvg-source/precision-build-recipe.mjs",".github/workflows/svg-source-filter-precision.yml");
  if(premultiplied)files.push("images/resvg-source/premultiplied-transfer-patch.mjs","images/resvg-source/premultiplied-transfer-kernel.rs","images/resvg-source/premultiplied-build-recipe.mjs",".github/workflows/svg-source-premultiplied-transfer.yml");
  for(const file of files)report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  runtime=await createOwnedRuntimeScratch("resvg-filter-owner-");
  const generated=(premultiplied?makePremultipliedBuildRecipes:precision?makePrecisionBuildRecipes:liveness?makeLivenessBuildRecipes:makeContextBuildRecipes)({root,runtime:runtime.directory,compilerBytes:await readFile(path.join(root,files[0])),reproducerBytes:await readFile(path.join(root,files[1]))});
  report.recipe=generated.proof;report.generatedSourceArchives={};
  for(const [name,file,source]of [["compiler",generated.compilerPath,generated.compiler],["reproducer",generated.reproducerPath,generated.reproducer]]){
    report.generatedSourceArchives[name]={bytes:Buffer.byteLength(source),sha256:sha(source),gzipBase64:gzipSync(source,{level:9}).toString("base64")};
    await writeFile(file,source,{flag:"wx"});
  }
  child=spawn(process.execPath,[generated.reproducerPath],{cwd:root,env:runtime.env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  for(const pipe of [child.stdout,child.stderr])pipe.on("data",bytes=>{log=(log+bytes).slice(-32768);});
  report.childExit=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>{report.childSignal=signal;resolve(code);});});
  assert.equal(report.childSignal,null);assert.equal(report.childExit,0,log);
  const receiptPath=`outputs/reports/resvg-source-repeat-${runId}.json`,bytes=await readFile(path.join(root,receiptPath)),receipt=JSON.parse(bytes);
  assert.equal(receipt.status,`two-fresh-private-filter-${variant}-source-builds-byte-identical-not-browser-acceptance`);
  assert.equal(receipt.rawBytesEqual,true);assert.equal(receipt.ownedDriverScratchRemoved,true);assert.deepEqual(receipt.failures,[]);
  report.rawRepeatReceipt={path:receiptPath,bytes:bytes.length,sha256:sha(bytes)};report.rawByteEquality=true;
  report.status=`two-fresh-filter-${variant}-source-builds-verified-not-browser-acceptance`;
}catch(error){report.status=`failed-private-filter-${variant}-source-build`;report.failures.push(String(error.stack??error));process.exitCode=1;}
finally{
  try{
    assert.ok(!child||child.pid===undefined||(child.exitCode!==null&&child.signalCode===null),"Do not delete a live compiler owner");
    await runtime?.close();report.ownedOwnerScratchRemoved=Boolean(runtime);
    if(runtime)await assert.rejects(access(runtime.directory),{code:"ENOENT"});
    for(const [file,digest]of Object.entries(report.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),digest,file);
  }catch(error){report.failures.push("Owned cleanup/source verification: "+error);report.status=`failed-private-filter-${variant}-source-build`;process.exitCode=1;}
  report.compilerTail=log;report.finishedAt=new Date().toISOString();
  const file=path.join(output,`resvg-filter-${variant}-owner-${runId}.json`);await writeFile(file,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({file,status:report.status,failures:report.failures}));
}

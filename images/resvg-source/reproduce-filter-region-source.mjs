// Isolated Linux Actions build only; never converts or accesses a user file.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access,mkdir,readFile,statfs,writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makeFilterBuildRecipes } from "./filter-build-recipe.mjs";
import { sha } from "./source-pins.mjs";
assert.equal(process.platform,"linux");assert.equal(process.argv.length,2);assert.match(process.env.GITHUB_RUN_ID??"",/^[0-9]{1,14}$/);
const root=path.resolve(import.meta.dirname,"../.."),runId=process.env.GITHUB_RUN_ID;
const report={schemaVersion:1,runId,startedAt:new Date().toISOString(),sourcePins:{},failures:[],
  scope:"Two fresh locked compiler builds of source filter-region intersection; no bindgen/browser/fidelity/memory acceptance",
  publicEngineReplacement:false,rendererExecuted:false,wholeGoalComplete:false};
let runtime,child,log="";
try{
  await mkdir(path.join(root,"outputs/reports"),{recursive:true});
  const disk=await statfs(root);assert.ok(disk.bavail*disk.bsize>=8*1024**3);
  runtime=await createOwnedRuntimeScratch("resvg-filter-owner-");
  const files=["images/resvg-source/compile-candidate.mjs","images/resvg-source/reproduce-raw-source.mjs","images/resvg-source/filter-build-recipe.mjs",
    "images/resvg-source/filter-region-patch.mjs","images/resvg-source/reproduce-filter-region-source.mjs","fixtures/source/resvg-filter-3495d870-preimage.json",
    ".github/workflows/svg-source-filter-region.yml"];
  for(const file of files)report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  const generated=makeFilterBuildRecipes({root,runtime:runtime.directory,compilerBytes:await readFile(path.join(root,files[0])),reproducerBytes:await readFile(path.join(root,files[1]))});
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
  assert.equal(receipt.status,"two-fresh-private-filter-region-source-builds-byte-identical-not-browser-acceptance");
  assert.equal(receipt.rawBytesEqual,true);assert.equal(receipt.ownedDriverScratchRemoved,true);assert.deepEqual(receipt.failures,[]);
  report.rawRepeatReceipt={path:receiptPath,bytes:bytes.length,sha256:sha(bytes)};report.rawByteEquality=true;
  report.status="two-fresh-filter-region-source-builds-verified-not-browser-acceptance";
}catch(error){report.status="failed-private-filter-region-source-build";report.failures.push(String(error.stack??error));process.exitCode=1;}
finally{
  try{
    assert.ok(!child||child.pid===undefined||(child.exitCode!==null&&child.signalCode===null),"Do not delete a live compiler owner");
    await runtime?.close();report.ownedOwnerScratchRemoved=Boolean(runtime);
    if(runtime)await assert.rejects(access(runtime.directory),{code:"ENOENT"});
    for(const [file,digest]of Object.entries(report.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),digest,file);
  }catch(error){report.failures.push("Owned cleanup/source verification: "+error);report.status="failed-private-filter-region-source-build";process.exitCode=1;}
  report.compilerTail=log;report.finishedAt=new Date().toISOString();
  const file=path.join(root,`outputs/reports/resvg-filter-region-owner-${runId}.json`);
  await writeFile(file,JSON.stringify(report,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({file,status:report.status,failures:report.failures}));
}

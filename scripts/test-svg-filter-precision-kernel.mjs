// Host Rust arithmetic tests only. No image renderer, user files or media conversion.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile,writeFile,lstat,access } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { filterPrecisionPatch } from "../images/resvg-source/filter-precision-patch.mjs";
import { premultipliedTransferPatch } from "../images/resvg-source/premultiplied-transfer-patch.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
const root=path.resolve(import.meta.dirname,".."),stamp=new Date().toISOString().replaceAll(/[:.]/g,"-");
const premultiplied=process.argv[2]==="--premultiplied";
const report={schemaVersion:1,startedAt:new Date().toISOString(),premultiplied,scope:"Compiled host Rust scalar arithmetic only; not renderer/browser/stress acceptance",commands:[],sourcePins:{},failures:[],
  productionConversionTested:false,publicPromotion:false,wholeGoalComplete:false};
let runtime,child;
const run=async(executable,args)=>{
  const row={executable,args,log:"",pid:null,birth:null,exitCode:null,signal:null};report.commands.push(row);
  child=spawn(executable,args,{cwd:root,env:runtime.env,windowsHide:true,stdio:["ignore","pipe","pipe"]});row.pid=child.pid;
  const completed=new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>{row.exitCode=code;row.signal=signal;resolve();});});
  for(const pipe of [child.stdout,child.stderr])pipe.on("data",bytes=>{row.log=(row.log+bytes).slice(-32768);});
  row.birth=await queryReliableProcessIdentity(child.pid);await completed;
  assert.equal(row.signal,null);assert.equal(row.exitCode,0,row.log);
  if(row.birth){row.cleanup=await observeOwnedProcessExit(row.birth);assert.equal(row.cleanup.status,"owned-identity-absent");}
  else row.cleanup={status:"launch-exit-observed-before-birth-query-no-process-killed",exitCode:row.exitCode};
  return row;
};
try{
  assert.ok(process.argv.length===2||(process.argv.length===3&&premultiplied));
  const compiler=process.env.WITHIN_RUSTC_EXECUTABLE;assert.ok(compiler&&path.isAbsolute(compiler),"Set WITHIN_RUSTC_EXECUTABLE to an existing rustc binary, not a downloader");
  assert.match(path.basename(compiler),/^rustc(?:\.exe)?$/);assert.ok((await lstat(compiler)).isFile());
  const sourceRelative=premultiplied?"images/resvg-source/premultiplied-transfer-kernel.rs":"images/resvg-source/filter-precision-kernel.rs",source=path.join(root,sourceRelative);
  report.sourcePins[sourceRelative]=sha(await readFile(source));
  assert.equal(report.sourcePins[sourceRelative],(premultiplied?premultipliedTransferPatch:filterPrecisionPatch).kernelSha256);
  runtime=await createOwnedRuntimeScratch("svg-precision-kernel-");
  const binary=path.join(runtime.directory,process.platform==="win32"?"precision-kernel-tests.exe":"precision-kernel-tests");
  const compiled=await run(compiler,["--edition=2021","--test",source,"-O","-o",binary]);
  report.compilationSucceeded=compiled.exitCode===0;
  const tested=await run(binary,["--test-threads=1"]);
  assert.match(tested.log,/test result: ok\. 4 passed; 0 failed; 0 ignored/);
  report.status="four-compiled-Rust-numeric-tests-passed-not-browser-acceptance";
}catch(error){report.status="failed-compiled-Rust-kernel-control";report.failures.push(String(error.stack??error));process.exitCode=1;}
finally{
  try{
    assert.ok(!child||child.pid===undefined||child.exitCode!==null||child.signalCode!==null,"Never remove a live owned command runtime");
    await runtime?.close();report.ownedRuntimeRemoved=Boolean(runtime);
    if(runtime)await assert.rejects(access(runtime.directory),{code:"ENOENT"});
    for(const [file,digest]of Object.entries(report.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),digest,file);
  }catch(error){report.failures.push("Cleanup/source verification: "+error);report.status="failed-compiled-Rust-kernel-control";process.exitCode=1;}
  report.finishedAt=new Date().toISOString();const file=path.join(root,"evidence",stamp+(premultiplied?"-svg-premultiplied-kernel.json":"-svg-precision-kernel.json"));
  await writeFile(file,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({file:path.relative(root,file),status:report.status,ownedRuntimeRemoved:report.ownedRuntimeRemoved,failures:report.failures}));
}

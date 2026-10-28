import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile,readdir,writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { buildSvgStripWorker } from "./lib/svg-strip-worker-recipe.mjs";
import { makeSvgSmallFidelityControl } from "./lib/svg-small-fidelity-control.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
const listOnly=process.argv[2]==="--list-only";
assert.ok(process.argv.length===2||(process.argv.length===3&&listOnly));
const root=path.resolve(import.meta.dirname,".."),stamp=new Date().toISOString().replaceAll(/[:.]/g,"-");
const report={schemaVersion:1,startedAt:new Date().toISOString(),diagnosticOnly:true,sourceWidth:960,sourceHeight:540,
  sourcePins:{},failures:[],fullOriginal6MStressReplacement:false,publicPromotion:false,memoryAcceptance:false,wholeGoalComplete:false};
let runtime,child,birth,log="";
try{
  for(const file of ["scripts/test-svg-small-fidelity-control.mjs","scripts/lib/svg-small-fidelity-control.mjs","scripts/lib/svg-small-fidelity-test.txt",
    "scripts/lib/svg-strip-worker-recipe.mjs","scripts/lib/svg-filter-liveness-qualification.mjs","scripts/test-source-built-svg-candidate.mjs",
    "tests/browser/image-conversions.spec.ts","images/resvg-source/filter-liveness-raw-input.json","images/resvg-source/filter-liveness-processed-input.json",
    "fixtures/images/test-pattern-effects.svg","fixtures/images/test-pattern-effects.svg.json"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  const workers=(await readdir(path.join(root,"dist/client/assets"))).filter(name=>/^conversion.worker-[\w-]+\.js$/.test(name));assert.equal(workers.length,1);
  const fullWorkerFile="dist/client/assets/"+workers[0],fullWorker=await readFile(path.join(root,fullWorkerFile));
  report.fullProductionWorker={file:fullWorkerFile,bytes:fullWorker.length,sha256:sha(fullWorker)};
  report.sourcePins[fullWorkerFile]=sha(fullWorker);
  runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  report.privateWorker=await buildSvgStripWorker({root,runtime,centralRows:128});
  const generated=makeSvgSmallFidelityControl({root,runtime:runtime.directory,workerPin:report.privateWorker,
    driverBytes:await readFile(path.join(root,"scripts/test-source-built-svg-candidate.mjs")),
    suiteBytes:await readFile(path.join(root,"tests/browser/image-conversions.spec.ts")),
    generatorBytes:await readFile(path.join(root,"scripts/generate-svg-stress-fixture.py")),
    controlTestBytes:await readFile(path.join(root,"scripts/lib/svg-small-fidelity-test.txt"))});
  report.recipe=generated.proof;report.generatedSourceArchives={};
  for(const [name,file,source]of [["driver",generated.driverPath,generated.driver],["suite",generated.suitePath,generated.suite],["config",generated.configPath,generated.config]]){
    report.generatedSourceArchives[name]={bytes:Buffer.byteLength(source),sha256:sha(source),gzipBase64:gzipSync(source,{level:9}).toString("base64")};
    await writeFile(file,source,{flag:"wx"});
  }
  const args=listOnly?["node_modules/@playwright/test/cli.js","test","--config="+generated.configPath,"--grep","paired-svg-fidelity-control","--list"]:[generated.driverPath];
  child=spawn(process.execPath,args,{cwd:root,env:runtime.env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  for(const pipe of [child.stdout,child.stderr])pipe.on("data",bytes=>{log=(log+bytes).slice(-65536);});
  const completed=new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>{report.childSignal=signal;resolve(code);});});
  birth=await queryReliableProcessIdentity(child.pid);assert.ok(birth);report.childBirth=birth;report.childExit=await completed;
  assert.equal(report.childSignal,null);
  if(listOnly){
    assert.equal(report.childExit,0,log);assert.match(log,/Total: 1 test in 1 file/);
    report.status="listed-one-paired-small-control-no-browser";
  }else{
    const summaries=log.split(/\r?\n/).filter(line=>line.startsWith('{"path":'));assert.equal(summaries.length,1,log);
    const relative=JSON.parse(summaries[0]).path.replaceAll("\\","/");assert.match(relative,/^evidence\/[\w-]+-source-svg-browser\.json$/);
    const bytes=await readFile(path.join(root,relative));assert.ok(bytes.length<=4194304);const actual=JSON.parse(bytes);
    report.browserReceipt={path:relative,bytes:bytes.length,sha256:sha(bytes)};
    report.stats=actual.stats;report.diagnostic=actual.stressRuns?.[0]?.result??null;
    report.incrementalPrivateMiB=actual.memory?.incrementalPrivateMiB??null;
    report.processCleanup=actual.processCleanup;report.protectedOriginalBefore=actual.protectedOriginalBefore;report.protectedOriginalAfter=actual.protectedOriginalAfter;
    report.browserVersion=actual.browserBefore?.version;report.ownedBrowserRuntimeRemoved=actual.ownedRuntimeRemoved;
    assert.equal(actual.smallFidelityControl.diagnosticOnly,true);assert.equal(actual.smallFidelityControl.original6MStressReplaced,false);
    assert.ok(actual.processCleanup.every(row=>row.status==="owned-identity-absent"));assert.equal(actual.ownedRuntimeRemoved,true);
    assert.deepEqual(actual.protectedOriginalBefore,actual.protectedOriginalAfter);
    report.status=report.childExit===0?"collected-small-fidelity-control-not-profile-acceptance":"collected-small-fidelity-control-with-gate-failures";
    if(report.childExit!==0)process.exitCode=1;
  }
}catch(error){report.status="failed-small-fidelity-control";report.failures.push(String(error.stack??error));process.exitCode=1;}
finally{
  try{
    assert.ok(!child||child.pid===undefined||(child.exitCode!==null&&child.signalCode===null));
    if(birth){report.ownerProcessCleanup=await observeOwnedProcessExit(birth);assert.equal(report.ownerProcessCleanup.status,"owned-identity-absent");}
    await runtime?.close();report.ownedRuntimeRemoved=Boolean(runtime);
    for(const [file,digest]of Object.entries(report.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),digest,file);
  }catch(error){report.failures.push("Owned cleanup/source verification: "+error);report.status="failed-small-fidelity-control";process.exitCode=1;}
  report.logTail=log.slice(-8192);report.finishedAt=new Date().toISOString();
  const file=path.join(root,"evidence",stamp+"-svg-small-fidelity-control.json");await writeFile(file,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({path:path.relative(root,file),status:report.status,diagnostic:report.diagnostic??null,ownedRuntimeRemoved:report.ownedRuntimeRemoved,failures:report.failures}));
}

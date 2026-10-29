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
import { makeSvgNativeWorkerCapabilityControl } from "./lib/svg-native-worker-capability-control.mjs";
import { makeSvgComponentFidelityControl,svgComponentVariants,assertSvgComponentControlNotCompleted } from "./lib/svg-component-fidelity-control.mjs";
import { svgFilterPrecisionVariants } from "./lib/svg-filter-precision-variants.mjs";
import { makeSvgSmallPrecisionFidelityControl,makeSvgPrecisionIntegrationControl } from "./lib/svg-filter-precision-qualification.mjs";
import { svgFilterIntegrationVariants } from "./lib/svg-filter-integration-variants.mjs";
import { makeSvgPrecisionOpacityControl,svgFilterOpacityVariants } from "./lib/svg-filter-opacity-control.mjs";
import { makeSvgSmallPremultipliedControl } from "./lib/svg-premultiplied-qualification.mjs";
import { makeSvgStripTransparentControl } from "./lib/svg-strip-transparent-control.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
const args=process.argv.slice(2),listOnly=args.includes("--list-only"),nativeCapability=args.includes("--native-capability"),components=args.includes("--components"),filterPrecision=args.includes("--filter-precision"),integrationDiagnostics=args.includes("--precision-integration"),opacityDiagnostics=args.includes("--precision-opacity"),nativePrecisionCandidate=args.includes("--precision-candidate")||integrationDiagnostics||opacityDiagnostics,transparentControl=args.includes("--premultiplied-transparent"),nativePremultipliedCandidate=args.includes("--premultiplied-candidate")||transparentControl;
assert.equal(new Set(args).size,args.length);assert.ok(args.length<=2&&args.every(arg=>["--list-only","--native-capability","--components","--filter-precision","--precision-candidate","--precision-integration","--precision-opacity","--premultiplied-candidate","--premultiplied-transparent"].includes(arg)));
assert.ok(args.filter(arg=>arg!=="--list-only").length<=1,"Diagnostic modes are mutually exclusive");
assert.ok([nativeCapability,components,filterPrecision,nativePrecisionCandidate,nativePremultipliedCandidate].filter(Boolean).length<=1,"Choose exactly one diagnostic kind");
const componentControl=components||filterPrecision||integrationDiagnostics||opacityDiagnostics,testName=transparentControl?"svg-transparent-fidelity-control":opacityDiagnostics?"svg-filter-opacity-control":integrationDiagnostics?"svg-filter-integration-control":filterPrecision?"svg-filter-precision-control":components?"svg-component-fidelity-control":nativeCapability?"svg-native-worker-capability-control":"paired-svg-fidelity-control";
const root=path.resolve(import.meta.dirname,".."),stamp=new Date().toISOString().replaceAll(/[:.]/g,"-");
const report={schemaVersion:1,startedAt:new Date().toISOString(),diagnosticOnly:true,nativeCapability,components,filterPrecision,nativePrecisionCandidate,nativePremultipliedCandidate,transparentControl,integrationDiagnostics,opacityDiagnostics,sourceWidth:nativeCapability?2:960,sourceHeight:nativeCapability?2:540,
  sourcePins:{},failures:[],fullOriginal6MStressReplacement:false,publicPromotion:false,memoryAcceptance:false,wholeGoalComplete:false};
let runtime,child,birth,log="";
try{
  for(const file of ["scripts/test-svg-small-fidelity-control.mjs","scripts/lib/svg-small-fidelity-control.mjs","scripts/lib/svg-small-fidelity-test.txt",
    "scripts/lib/svg-strip-worker-recipe.mjs","scripts/lib/svg-filter-liveness-qualification.mjs","scripts/test-source-built-svg-candidate.mjs",
    "tests/browser/image-conversions.spec.ts","images/resvg-source/filter-liveness-raw-input.json","images/resvg-source/filter-liveness-processed-input.json",
    "fixtures/images/test-pattern-effects.svg","fixtures/images/test-pattern-effects.svg.json",
    "scripts/lib/svg-native-worker-capability-control.mjs","scripts/lib/svg-native-worker-test.txt","scripts/lib/svg-native-worker-probe.txt","scripts/lib/svg-component-fidelity-control.mjs","scripts/lib/svg-filter-precision-variants.mjs"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(integrationDiagnostics||opacityDiagnostics)report.sourcePins["scripts/lib/svg-filter-integration-variants.mjs"]=sha(await readFile(path.join(root,"scripts/lib/svg-filter-integration-variants.mjs")));
  if(opacityDiagnostics)report.sourcePins["scripts/lib/svg-filter-opacity-control.mjs"]=sha(await readFile(path.join(root,"scripts/lib/svg-filter-opacity-control.mjs")));
  if(nativePrecisionCandidate)for(const file of ["scripts/lib/svg-filter-precision-qualification.mjs","images/resvg-source/filter-precision-patch.mjs","images/resvg-source/filter-precision-kernel.rs","images/resvg-source/filter-precision-raw-input.json","images/resvg-source/filter-precision-processed-input.json"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(nativePremultipliedCandidate)for(const file of ["scripts/lib/svg-premultiplied-qualification.mjs","images/resvg-source/premultiplied-transfer-patch.mjs","images/resvg-source/premultiplied-transfer-kernel.rs","images/resvg-source/filter-premultiplied-raw-input.json","images/resvg-source/filter-premultiplied-processed-input.json"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(transparentControl)for(const file of ["scripts/lib/svg-strip-transparent-control.mjs","fixtures/images/svg-strip-transparent.svg"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(!listOnly&&!nativeCapability){
    const pin=JSON.parse(await readFile(path.join(root,nativePremultipliedCandidate?"images/resvg-source/filter-premultiplied-processed-input.json":nativePrecisionCandidate?"images/resvg-source/filter-precision-processed-input.json":"images/resvg-source/filter-liveness-processed-input.json")));
    const ledger=JSON.parse(await readFile(path.join(root,"images/resvg-source/rejected-strip-experiments.json")));
    if(componentControl)assertSvgComponentControlNotCompleted(ledger,{nativeWasmSha256:pin.wasmSha256,filterPrecision,integrationDiagnostics,opacityDiagnostics,
      variants:(opacityDiagnostics?svgFilterOpacityVariants:integrationDiagnostics?svgFilterIntegrationVariants:filterPrecision?svgFilterPrecisionVariants:svgComponentVariants)(await readFile(path.join(root,"fixtures/images/test-pattern-effects.svg")))});
    else{const done=transparentControl?ledger.completedPremultipliedTransparentControl:nativePremultipliedCandidate?ledger.completedPremultipliedPairedSmallControl:nativePrecisionCandidate?ledger.completedPrecisionPairedSmallControl:ledger.completedPairedSmallControl;
    assert.ok(!(done?.nativeWasmSha256===pin.wasmSha256&&done?.sourceSha256===report.sourcePins[transparentControl?"fixtures/images/svg-strip-transparent.svg":"fixtures/images/test-pattern-effects.svg"]),
      "This exact paired small control is already complete; inspect "+done?.evidence+" instead of replaying it.");}
  }
  const workers=(await readdir(path.join(root,"dist/client/assets"))).filter(name=>/^conversion.worker-[\w-]+\.js$/.test(name));assert.equal(workers.length,1);
  const fullWorkerFile="dist/client/assets/"+workers[0],fullWorker=await readFile(path.join(root,fullWorkerFile));
  report.fullProductionWorker={file:fullWorkerFile,bytes:fullWorker.length,sha256:sha(fullWorker)};
  report.sourcePins[fullWorkerFile]=sha(fullWorker);
  runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  report.privateWorker=await buildSvgStripWorker({root,runtime,centralRows:128});
  const generated=(transparentControl?makeSvgStripTransparentControl:nativePremultipliedCandidate?makeSvgSmallPremultipliedControl:opacityDiagnostics?makeSvgPrecisionOpacityControl:integrationDiagnostics?makeSvgPrecisionIntegrationControl:nativePrecisionCandidate?makeSvgSmallPrecisionFidelityControl:componentControl?makeSvgComponentFidelityControl:nativeCapability?makeSvgNativeWorkerCapabilityControl:makeSvgSmallFidelityControl)({root,runtime:runtime.directory,workerPin:report.privateWorker,filterPrecision,integrationDiagnostics,
    ...(transparentControl?{transparentSourceBytes:await readFile(path.join(root,"fixtures/images/svg-strip-transparent.svg"))}:{}),
    driverBytes:await readFile(path.join(root,"scripts/test-source-built-svg-candidate.mjs")),
    suiteBytes:await readFile(path.join(root,"tests/browser/image-conversions.spec.ts")),
    generatorBytes:await readFile(path.join(root,"scripts/generate-svg-stress-fixture.py")),
    controlTestBytes:await readFile(path.join(root,"scripts/lib/svg-small-fidelity-test.txt")),
    capabilityTestBytes:await readFile(path.join(root,"scripts/lib/svg-native-worker-test.txt")),
    componentSourceBytes:await readFile(path.join(root,"fixtures/images/test-pattern-effects.svg"))});
  report.recipe=generated.proof;report.generatedSourceArchives={};
  for(const [name,file,source]of [["driver",generated.driverPath,generated.driver],["suite",generated.suitePath,generated.suite],["config",generated.configPath,generated.config]]){
    report.generatedSourceArchives[name]={bytes:Buffer.byteLength(source),sha256:sha(source),gzipBase64:gzipSync(source,{level:9}).toString("base64")};
    await writeFile(file,source,{flag:"wx"});
  }
  const childArgs=listOnly?["node_modules/@playwright/test/cli.js","test","--config="+generated.configPath,"--grep",testName,"--list"]:[generated.driverPath];
  child=spawn(process.execPath,childArgs,{cwd:root,env:runtime.env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  for(const pipe of [child.stdout,child.stderr])pipe.on("data",bytes=>{log=(log+bytes).slice(-65536);});
  const completed=new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>{report.childSignal=signal;resolve(code);});});
  birth=await queryReliableProcessIdentity(child.pid);assert.ok(birth);report.childBirth=birth;report.childExit=await completed;
  assert.equal(report.childSignal,null);
  if(listOnly){
    assert.equal(report.childExit,0,log);assert.match(log,/Total: 1 test in 1 file/);
    report.status=opacityDiagnostics?"listed-one-three-fixed-opacity-controls-no-browser":integrationDiagnostics?"listed-one-three-precision-integration-controls-no-browser":filterPrecision?"listed-one-three-filter-precision-control-no-browser":components?"listed-one-three-component-control-no-browser":nativeCapability?"listed-one-native-worker-api-probe-no-browser":"listed-one-paired-small-control-no-browser";
  }else{
    const summaries=log.split(/\r?\n/).filter(line=>line.startsWith('{"path":'));assert.equal(summaries.length,1,log);
    const relative=JSON.parse(summaries[0]).path.replaceAll("\\","/");assert.match(relative,/^evidence\/[\w-]+-source-svg-browser\.json$/);
    const bytes=await readFile(path.join(root,relative));assert.ok(bytes.length<=4194304);const actual=JSON.parse(bytes);
    report.browserReceipt={path:relative,bytes:bytes.length,sha256:sha(bytes)};
    report.stats=actual.stats;report.diagnostic=actual.stressRuns?.[0]?.result??null;
    report.incrementalPrivateMiB=actual.memory?.incrementalPrivateMiB??null;
    report.processCleanup=actual.processCleanup;report.protectedOriginalBefore=actual.protectedOriginalBefore;report.protectedOriginalAfter=actual.protectedOriginalAfter;
    report.browserVersion=actual.browserBefore?.version;report.ownedBrowserRuntimeRemoved=actual.ownedRuntimeRemoved;
    if(componentControl){assert.equal(actual.componentFidelityControl.diagnosticOnly,true);assert.equal(actual.componentFidelityControl.original6MStressReplaced,false);if(filterPrecision)assert.equal(actual.componentFidelityControl.filterPrecision,true);if(integrationDiagnostics||opacityDiagnostics){assert.equal(actual.componentFidelityControl.integrationDiagnostics,true);assert.equal(actual.sourceFilterPrecisionCandidate,true);}if(opacityDiagnostics)assert.equal(actual.componentFidelityControl.opacityDiagnostics,true);}
    else if(nativeCapability){assert.equal(actual.nativeWorkerCapabilityControl.diagnosticOnly,true);assert.equal(actual.nativeWorkerCapabilityControl.conversionProfileTested,false);}
    else{assert.equal(actual.smallFidelityControl.diagnosticOnly,true);assert.equal(actual.smallFidelityControl.original6MStressReplaced,false);if(nativePrecisionCandidate)assert.equal(actual.sourceFilterPrecisionCandidate,true);if(nativePremultipliedCandidate)assert.equal(actual.sourcePremultipliedTransferCandidate,true);if(transparentControl)assert.equal(actual.transparentFidelityControl.sha256,report.sourcePins["fixtures/images/svg-strip-transparent.svg"]);}
    assert.ok(actual.processCleanup.every(row=>row.status==="owned-identity-absent"));assert.equal(actual.ownedRuntimeRemoved,true);
    assert.deepEqual(actual.protectedOriginalBefore,actual.protectedOriginalAfter);
    report.status=componentControl?(report.childExit===0?"collected-components-not-profile-acceptance":"collected-components-with-gate-failures"):nativeCapability?(report.childExit===0?"collected-worker-api-capability-not-conversion-acceptance":"collected-worker-api-capability-with-gate-failures"):(report.childExit===0?"collected-small-fidelity-control-not-profile-acceptance":"collected-small-fidelity-control-with-gate-failures");
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
  const file=path.join(root,"evidence",stamp+(transparentControl?"-svg-transparent-control.json":nativePremultipliedCandidate?"-svg-small-premultiplied-control.json":opacityDiagnostics?"-svg-precision-opacity-control.json":integrationDiagnostics?"-svg-precision-integration-control.json":nativePrecisionCandidate?"-svg-small-precision-fidelity-control.json":filterPrecision?"-svg-filter-precision-control.json":components?"-svg-component-control.json":nativeCapability?"-svg-native-worker-capability.json":"-svg-small-fidelity-control.json"));await writeFile(file,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({path:path.relative(root,file),status:report.status,diagnostic:report.diagnostic??null,ownedRuntimeRemoved:report.ownedRuntimeRemoved,failures:report.failures}));
}

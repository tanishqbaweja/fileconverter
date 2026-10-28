// One private browser worker candidate. Reuses the frozen original6M owner.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access,readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { assertSvgStripExperimentNotRejected } from "./lib/svg-strip-rejections.mjs";
const root=path.resolve(import.meta.dirname,".."),args=process.argv.slice(2);
assert.equal(new Set(args).size,args.length);assert.ok(args.length<=3&&args.every(arg=>["--list-only","--filter-region","--filter-context","--rows80"].includes(arg)));
const filterContext=args.includes("--filter-context"),filterRegion=args.includes("--filter-region"),listOnly=args.includes("--list-only");
assert.ok(!(filterContext&&filterRegion),"Select one immutable native candidate");
const centralRows=args.includes("--rows80")?80:64;
assert.ok(centralRows===64||filterContext,"80-row experiment requires the context-corrected source");
const candidatePin=filterContext?"images/resvg-source/filter-context-processed-input.json":"images/resvg-source/filter-region-processed-input.json";
const stamp=new Date().toISOString().replaceAll(/[:.]/g,"-"),baseOwner="scripts/test-reproduced-svg-stress.mjs";
const report={schemaVersion:1,startedAt:new Date().toISOString(),scope:"Private viewport/streaming PNG worker with original6M effects fixture and unchanged final baseline/250 threshold; not general SVG/release acceptance",
  sourcePins:{},failures:[],centralRows,sourceFilterRegionCandidate:filterRegion||filterContext,sourceRenderContextCandidate:filterContext,publicSourceEdited:false,publicEngineReplacement:false,memoryAcceptance:false,wholeGoalComplete:false};
let runtime,child,birth,log="";
const replace=(text,before,after,count=1)=>{assert.equal(text.split(before).length-1,count,"Exact strip owner anchor: "+before);return text.split(before).join(after);};
try{
  const original=await readFile(path.join(root,baseOwner));assert.equal(sha(original),"5a5ec0af3ef4a7b6f0c0743974cee04fafb970bb50aeb47e024a05c58f4cc30c");
  if(!listOnly){
    const pinFile=filterRegion||filterContext?candidatePin:"images/resvg-source/repeated-processed-input.json";
    const pin=JSON.parse(await readFile(path.join(root,pinFile)));
    const ledger=JSON.parse(await readFile(path.join(root,"images/resvg-source/rejected-strip-experiments.json")));
    assertSvgStripExperimentNotRejected(ledger,{wasmSha256:pin.wasmSha256,centralRows,fixtureSha256:"af4df880bee340b34ec1102a78a78cce8d04915635ea2ee5a7aa0ffe04e4ca78"});
  }
  for(const file of [baseOwner,"scripts/test-svg-strip-pilot.mjs","scripts/lib/svg-strip-rejections.mjs","images/resvg-source/rejected-strip-experiments.json","scripts/lib/svg-strip-worker-recipe.mjs","scripts/lib/svg-strip-qualification-recipe.mjs","scripts/lib/svg-strip-validator.mjs","lib/private-svg-strip-pilot.ts","workers/rgba-png-stream.ts"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  report.sourcePins["scripts/lib/svg-filter-region-qualification.mjs"]=sha(await readFile(path.join(root,"scripts/lib/svg-filter-region-qualification.mjs")));
  report.sourcePins["scripts/lib/svg-filter-context-qualification.mjs"]=sha(await readFile(path.join(root,"scripts/lib/svg-filter-context-qualification.mjs")));
  if(filterRegion||filterContext) report.sourcePins[candidatePin]=sha(await readFile(path.join(root,candidatePin)));
  runtime=await createOwnedRuntimeScratch("svg-strip-owner-");
  let source=original.toString().replace(/((?:from\s+|import\s*)["'])(\.\.?\/[^"']+)(["'])/g,(_all,start,name,end)=>start+pathToFileURL(path.resolve(root,"scripts",name)).href+end);
  source=replace(source,'const root = path.resolve(import.meta.dirname, ".."), stamp',`const root = ${JSON.stringify(root)}, stamp`);
  source=replace(source,'  runtime = await createOwnedRuntimeScratch("svg-reproduced-qualification-");',
    '  runtime = await createOwnedRuntimeScratch("svg-reproduced-qualification-");\n  report.privateWorker = await buildSvgStripWorker({root,runtime,centralRows:'+centralRows+'});');
  const selector='  const recipe = allocationProbeDiagnostic ? makeSvgAllocationDiagnostic : effectsDiagnostic ? makeSvgEffectsDiagnostic : executionDiagnostic ? makeSvgExecutionDiagnostic : directHandle ? makeReproducedSvgDirectStressQualification : makeReproducedSvgStressQualification;';
  source=replace(source,selector,'  const recipe = options => '+(filterContext?'makeFilterContextSvgQualification':filterRegion?'makeFilterRegionSvgQualification':'makeSvgStripQualification')+'({...options,workerPin:report.privateWorker});');
  source=replace(source,'    await generateOwnedSvgEffectsFixture({ runtime, fixtureRoot: generated.fixtureRoot, receipt: report.fixture });',
    '    await generateOwnedSvgEffectsFixture({ runtime, fixtureRoot: generated.fixtureRoot, receipt: report.fixture });\n'+
    '    const reference = path.join(generated.fixtureRoot,"svg-effects-6m-reference.png");\n'+
    '    report.validatorControl = await validateSvgStripSeams({outputPath:reference,referencePath:reference,width:3000,height:2000,centralRows:'+centralRows+',additionalCentralRows:[64],execute:promisify(execFile),cwd:root});\n'+
    '    assert.equal(report.validatorControl.passed,true); assert.equal(report.validatorControl.minimumSsim,1);');
  source=replace(source,'  for (const file of ["scripts/test-reproduced-svg-stress.mjs",',
    '  for (const file of ["scripts/test-svg-strip-pilot.mjs", "scripts/lib/svg-filter-region-qualification.mjs", "scripts/lib/svg-strip-worker-recipe.mjs", "scripts/lib/svg-strip-qualification-recipe.mjs", "scripts/lib/svg-strip-validator.mjs", "lib/private-svg-strip-pilot.ts", "workers/rgba-png-stream.ts", "scripts/test-reproduced-svg-stress.mjs",');
  if(filterRegion||filterContext) source=replace(source,"images/resvg-source/repeated-processed-input.json",candidatePin,2);
  source=replace(source,'assert.equal(observation.observations, 6);','assert.equal(observation.observations, 6 + run.result.metrics.svgStripPilot.renderedViewports);');
  if(filterContext) source=replace(source,'"scripts/lib/svg-filter-region-qualification.mjs",','"scripts/lib/svg-filter-region-qualification.mjs", "scripts/lib/svg-filter-context-qualification.mjs",');
  source=`import {buildSvgStripWorker} from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/svg-strip-worker-recipe.mjs")).href)};\n`+
    `import {makeSvgStripQualification} from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/svg-strip-qualification-recipe.mjs")).href)};\n`+
    `import {makeFilterRegionSvgQualification} from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/svg-filter-region-qualification.mjs")).href)};\n`+
    `import {makeFilterContextSvgQualification} from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/svg-filter-context-qualification.mjs")).href)};\n`+
    `import {validateSvgStripSeams} from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/svg-strip-validator.mjs")).href)};\n`+
    'import {execFile} from "node:child_process";\nimport {promisify} from "node:util";\n'+source;
  report.generatedOwner={bytes:Buffer.byteLength(source),sha256:sha(source),gzipBase64:gzipSync(source,{level:9}).toString("base64"),baseSha256:sha(original)};
  const file=path.join(runtime.directory,"owner.mjs");await writeFile(file,source,{flag:"wx"});
  child=spawn(process.execPath,[file,"--effects-diagnostic",...(listOnly?["--list-only"]:[])],{cwd:root,env:runtime.env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  for(const pipe of [child.stdout,child.stderr])pipe.on("data",bytes=>{log=(log+bytes).slice(-65536);});
  const completed=new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>{report.childSignal=signal;resolve(code);});});
  birth=await queryReliableProcessIdentity(child.pid);assert.ok(birth);report.childBirth=birth;report.childExit=await completed;
  const summaries=log.split(/\r?\n/).filter(line=>line.startsWith('{"path":'));assert.equal(summaries.length,1,log);
  const summary=JSON.parse(summaries[0]),relative=summary.path.replaceAll("\\","/");assert.match(relative,/^evidence\/[\w-]+-reproduced-svg-grid-stress\.json$/);
  const bytes=await readFile(path.join(root,relative));assert.ok(bytes.length<=4194304);const actual=JSON.parse(bytes);
  report.browserOwnerReceipt={path:relative,bytes:bytes.length,sha256:sha(bytes)};
  report.stats=actual.stats??null;report.memory=actual.memory??null;
  report.privateWorker={bytes:actual.privateWorker?.bytes,sha256:actual.privateWorker?.sha256};
  report.validatorControl=actual.validatorControl??null;
  assert.equal(report.childSignal,null);assert.equal(report.childExit,0,log);
  report.status=listOnly?"listed-private-strip-browser-cases-no-conversion":"completed-private-strip-effects-checks-not-general-support";
}catch(error){report.status="failed-private-strip-pilot";report.failures.push(String(error.stack??error));process.exitCode=1;}
finally{
  try{
    assert.ok(!child||child.pid===undefined||(child.exitCode!==null&&child.signalCode===null),"Do not delete a live owner runtime");
    if(birth){report.processCleanup=await observeOwnedProcessExit(birth);assert.equal(report.processCleanup.status,"owned-identity-absent");}
    await runtime?.close();report.ownedRuntimeRemoved=Boolean(runtime);
    if(runtime)await assert.rejects(access(runtime.directory),{code:"ENOENT"});
    for(const [file,digest]of Object.entries(report.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),digest,file);
  }catch(error){report.failures.push("Owned cleanup/source verification: "+error);report.status="failed-private-strip-pilot";process.exitCode=1;}
  report.logTail=log.slice(-16384);report.finishedAt=new Date().toISOString();
  const file=path.join(root,"evidence",stamp+"-svg-strip-pilot.json");await writeFile(file,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({path:path.relative(root,file),status:report.status,stats:report.stats??null,incrementalPrivateMiB:report.memory?.incrementalPrivateMiB??null,ownedRuntimeRemoved:report.ownedRuntimeRemoved,failures:report.failures}));
}

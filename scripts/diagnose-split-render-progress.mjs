// One new matched candidate pair; timed cancellation is NOT full conversion acceptance.
import assert from "node:assert/strict";
import { execFile,spawn,spawnSync } from "node:child_process";
import { access,lstat,readFile,readdir,realpath,statfs,unlink,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { gzipSync,gunzipSync } from "node:zlib";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { baselineBinding,sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeSplitRenderProgressDriver,makeSplitRenderProgressTraceHelper } from "./lib/split-render-progress-recipe.mjs";
import { compareOutputWorkWindows } from "./lib/output-work-checkpoints.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),exec=promisify(execFile),reports=path.join(root,"outputs/reports");
assert.ok(process.argv.length===2||(process.argv.length===3&&process.argv[2]==="--prepare-only"));
const prepareOnly=process.argv[2]==="--prepare-only",stamp=new Date().toISOString().replaceAll(/[:.]/g,"-");
const archivePath="outputs/reports/2026-10-08T22-04-15-944Z-ui-progress-baseline-executed-sources.json.gz",archive=await read(archivePath);
assert.equal(sha(archive),"5111278bc1b5bbe47585679fda04a351e6885aa6974def53663800a81b8bc695");const executed=JSON.parse(gunzipSync(archive,{maxOutputLength:1048576}));
const goldenPath="evidence/2026-10-08T23-16-24-605Z-split-render-ui-golden-validation.json",golden=JSON.parse(await read(goldenPath));
assert.equal(golden.status,"independently-verified-and-losslessly-compacted");assert.equal(golden.maximumGeometryDeltaCssPixels,0);assert.equal(golden.conversions.length,3);
const build=JSON.parse(await read("evidence/2026-10-08T23-16-24-605Z-split-render-ui-build.json")),candidateBinding=build.asset;
assert.equal(candidateBinding.sha256,"52c6af6f8e49ddd0b2787d00bb29b9baab6075bf7e1f1fe490b78ea326441121");
const prior=JSON.parse(await read("evidence/2026-10-08T22-04-15-944Z-stable-ui-real-progress.json")),sourcePins={...prior.sourcePins};
for(const file of ["scripts/diagnose-split-render-progress.mjs","scripts/lib/split-render-progress-recipe.mjs","scripts/lib/output-work-checkpoints.mjs",
  "tests/split-render-progress.test.mjs","scripts/build-split-render-ui-candidate.mjs","scripts/lib/split-render-ui-recipe.mjs",goldenPath,
  "evidence/2026-10-08T23-16-24-605Z-split-render-ui-build.json"])sourcePins[file]=sha(await read(file));
for(const [file,hash] of Object.entries(sourcePins))assert.equal(sha(await read(file)),hash,file);
const check=source=>{const result=spawnSync(process.execPath,["--check","--input-type=module"],{input:source,encoding:"utf8",windowsHide:true});assert.equal(result.status,0,result.stderr);};
const verifyBinding=async binding=>{const bytes=await read("dist/client"+binding.url);assert.equal(bytes.length,binding.bytes);assert.equal(sha(bytes),binding.sha256);};
const executions=[],templates={};let host,diskBytes,failure=null,productionRestored=false;
if(prepareOnly){
  check(makeSplitRenderProgressTraceHelper(executed.traceHelper,path.join(reports,`${stamp}-PREPARED-NOT-EXECUTED.json.gz`)));
  for(const [mode,binding] of [["baseline",baselineBinding],["candidate",candidateBinding]]){
    const recipe=makeSplitRenderProgressDriver(executed.generated,root,"file:///UNIT_ONLY-NOT-EXECUTED/helper.mjs",binding,mode);check(recipe.generated);
    templates[mode]={bytes:Buffer.byteLength(recipe.generated),sha256:sha(recipe.generated),patchCount:recipe.patches.length,expectedAsset:binding};
  }
}else{
  try{
    host=await inspectStressHostMemory();console.log(JSON.stringify({host,stamp}));assert.equal(host.safeToStart,true);
    const disk=await statfs(root);diskBytes=disk.bavail*disk.bsize;assert.ok(diskBytes>=32*1024**3);await verifyBinding(baselineBinding);
    for(const [mode,binding] of [["baseline",baselineBinding],["candidate",candidateBinding]]){
      const fresh=await inspectStressHostMemory();console.log(JSON.stringify({mode,host:fresh}));assert.equal(fresh.safeToStart,true);
      const runtime=await createOwnedRuntimeScratch(`split-render-progress-${mode}-`);
      try{
        if(mode==="candidate"){
          await exec(process.execPath,["scripts/build-split-render-ui-candidate.mjs",stamp,"--for-browser"],
            {cwd:root,env:runtime.env,windowsHide:true,timeout:180000,maxBuffer:2097152});await verifyBinding(binding);
        }
        const traceFile=path.join(runtime.directory,"trace-helper.mjs"),driverFile=path.join(runtime.directory,"probe.mjs");
        const traceHelper=makeSplitRenderProgressTraceHelper(executed.traceHelper,path.join(reports,`${stamp}-split-render-${mode}-post-cancel-partial-blink.json.gz`));
        const recipe=makeSplitRenderProgressDriver(executed.generated,root,pathToFileURL(traceFile).href,binding,mode);check(recipe.generated);check(traceHelper);
        const rawSource=Buffer.from(JSON.stringify({...recipe,traceHelper})),compressedSource=gzipSync(rawSource,{level:9});assert.ok(compressedSource.length<=65536);
        const sourceRecord={path:`outputs/reports/${stamp}-split-render-progress-${mode}-executed-sources.json.gz`,bytes:compressedSource.length,
          sha256:sha(compressedSource),driverSha256:sha(recipe.generated),traceHelperSha256:sha(traceHelper),restoredSha256:sha(rawSource)};
        await writeFile(path.join(root,sourceRecord.path),compressedSource,{flag:"wx"});assert.deepEqual(gunzipSync(await read(sourceRecord.path)),rawSource);
        await writeFile(traceFile,traceHelper,{flag:"wx"});await writeFile(driverFile,recipe.generated,{flag:"wx"});
        const before=new Set(await readdir(reports));
        const child=spawn(process.execPath,[driverFile],{cwd:root,env:{...runtime.env,WITHIN_MPEG2_SPLIT_CANDIDATE_DIR:"mpeg2-split-pipeline-37739125738"},windowsHide:true,stdio:"inherit"});
        console.log(JSON.stringify({mode,driverPid:child.pid,wrapper:runtime.directory,sourceArchive:sourceRecord.path}));
        const code=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",(exitCode,signal)=>signal?reject(new Error(`Diagnostic signalled ${signal}`)):resolve(exitCode));});
        const names=(await readdir(reports)).filter(name=>!before.has(name)&&name.endsWith(`-private-mpeg2-split-render-${mode}-native-100ms.json`));
        assert.equal(names.length,1,"No fabricated missing report or automatic restart");
        const file=path.join(reports,names[0]),identity=await lstat(file,{bigint:true});assert.ok(identity.isFile()&&!identity.isSymbolicLink());assert.equal(await realpath(file),file);
        const raw=await readFile(file);assert.ok(raw.length<=32*1024**2);const report=JSON.parse(raw),compressed=gzipSync(raw,{level:9});
        assert.deepEqual(gunzipSync(compressed),raw);const compressedPath=`outputs/reports/${stamp}-split-render-progress-${mode}-raw.json.gz`;
        await writeFile(path.join(root,compressedPath),compressed,{flag:"wx"});assert.deepEqual(gunzipSync(await read(compressedPath)),raw);
        const current=await lstat(file,{bigint:true});assert.equal(current.dev,identity.dev);assert.equal(current.ino,identity.ino);assert.equal(current.size,identity.size);
        assert.equal(sha(await readFile(file)),sha(raw));await unlink(file);await assert.rejects(access(file),{code:"ENOENT"});
        const run={mode,actualExitCode:code,status:report.status,failure:report.failure,sourceArchive:sourceRecord,
          rawReport:{path:path.relative(root,file).replaceAll("\\","/"),bytes:raw.length,sha256:sha(raw)},
          compressedReport:{path:compressedPath,bytes:compressed.length,sha256:sha(compressed)},rawRemovedAfterLosslessArchive:true,
          progressProbe:report.progressProbe,browserVersion:report.browserVersion,blankBaseline:report.blankBaseline,runs:report.runs,
          cleanup:report.cleanup,runtimeDirectory:report.runtimeDirectory,forbiddenRequests:report.forbiddenRequests};
        executions.push(run);console.log(JSON.stringify({mode,actualExitCode:code,checkpoint:report.progressProbe?.checkpointReached,failure:report.failure?.message,
          workCheckpoints:report.progressProbe?.workCheckpoints}));
        assert.equal(code,1,"Timed/failed diagnostic must not claim full protected completion");assert.equal(report.status,"failed");
        assert.equal(report.conversionJsReport,null,"No JS allocation profiling during conversion");assert.equal(report.progressProbe.jsAllocationSamplingEnabled,false);
        assert.deepEqual(report.progressProbe.actualServedAsset,binding);assert.deepEqual(report.forbiddenRequests,[]);
        assert.equal(report.limitMiB,250);assert.equal(report.source.bytes,2958573265);
        assert.equal(report.source.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
        for(const key of ["mediaProfileRuntimeRemoved","generatedDistRestored","protectedFixtureUnchanged","observerStopped","sampledChromeRootStopped"])
          assert.equal(report.cleanup[key],true,key);
        assert.ok(!report.cleanup.errors?.length);await assert.rejects(access(report.runtimeDirectory),{code:"ENOENT"});
        assert.ok(report.progressProbe.checkpointReached||/exceeds 250MiB|deadline reached|cancelled|complete|memory|abort/i.test(report.failure?.message??""),"Unexpected failure requires investigation");
        if(executions.length===2){
          const other=executions[0];assert.equal(run.browserVersion,other.browserVersion);
          for(const key of ["chromeLauncherSha256","chromeLibrarySha256","viewport","checkpointOutputBytes","maximumConversionMs"])
            assert.deepEqual(run.progressProbe[key],other.progressProbe[key],key);
        }
      }finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
    }
  }catch(error){failure=String(error.stack??error).slice(0,8192);process.exitCode=1;console.error(failure);}
  finally{
    const runtime=await createOwnedRuntimeScratch("split-render-progress-restoration-");
    try{
      await exec(process.execPath,["node_modules/vinext/dist/cli.js","build"],{cwd:root,env:runtime.env,windowsHide:true,timeout:180000,maxBuffer:2097152});
      await verifyBinding(baselineBinding);productionRestored=true;
    }catch(error){failure=`${failure??""}\nRestoration: ${error.stack??error}`.slice(0,12288);process.exitCode=1;}
    finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
  }
}
const postSourcePins={};for(const file of Object.keys(sourcePins))postSourcePins[file]=sha(await read(file));assert.deepEqual(postSourcePins,sourcePins);
const workWindows=executions.length===2?compareOutputWorkWindows(executions[0].progressProbe.workCheckpoints,executions[1].progressProbe.workCheckpoints):null;
const proof={recordedAt:new Date().toISOString(),status:prepareOnly?"prepared-not-browser-executed":failure?"failed-or-incomplete":"paired-diagnostic-returned-independent-analysis-pending",failure,
  sourcePins,postSourcePins,templates,executions,workWindows,hostPreflight:host??null,diskPreflightBytes:diskBytes??null,productionRestored,
  browserMode:"headless",subprocessWindowsHidden:true,jsAllocationSamplingEnabled:false,
  publicAcceptance:false,originalFullSourceAcceptance:false,conversionSpeedAcceptance:false,completeChromiumMemoryAcceptance:false};
const proofPath=`evidence/${stamp}-split-render-progress${prepareOnly?"-preparation":""}.json`,proofBytes=JSON.stringify(proof,null,2)+"\n";
assert.ok(Buffer.byteLength(proofBytes)<=2097152);await writeFile(path.join(root,proofPath),proofBytes,{flag:"wx"});
console.log(JSON.stringify({proofPath,status:proof.status,executions:executions.length,productionRestored,workWindows}));assert.equal(failure,null);

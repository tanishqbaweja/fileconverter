// ONE changed, windowless, full-input diagnostic. No public/stress acceptance.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, lstat, readFile, readdir, realpath, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { baselineBinding, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeLiveMemoryProbe } from "./lib/live-memory-probe-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),reports=path.join(root,"outputs/reports"),read=file=>readFile(path.join(root,file));
assert.ok(process.argv.length===2||(process.argv.length===3&&process.argv[2]==="--prepare-only"));
const prepareOnly=process.argv[2]==="--prepare-only",stamp=new Date().toISOString().replaceAll(/[:.]/g,"-");
const prior=JSON.parse(await read("evidence/2026-10-08T22-04-15-944Z-stable-ui-real-progress.json"));
const record=prior.executions[0].sourceArchive,compressed=await read(record.path);assert.equal(sha(compressed),record.sha256);
const executed=JSON.parse(gunzipSync(compressed,{maxOutputLength:1048576})).generated;
assert.equal(sha(executed),record.driverSha256);
const sourcePins={...prior.sourcePins};
for(const file of ["scripts/diagnose-live-memory.mjs","scripts/lib/live-memory-infra.mjs","scripts/lib/live-memory-probe-recipe.mjs",
  "tests/live-memory-infra.test.mjs","tests/live-memory-probe.test.mjs","scripts/lib/memory-infra-attribution.mjs"])
  sourcePins[file]=sha(await read(file));
for(const[file,hash]of Object.entries(sourcePins))assert.equal(sha(await read(file)),hash,file);
const verifyBinding=async()=>{const bytes=await read("dist/client"+baselineBinding.url);assert.equal(bytes.length,baselineBinding.bytes);assert.equal(sha(bytes),baselineBinding.sha256);};
const generated=makeLiveMemoryProbe(executed,root,stamp);
const check=spawnSync(process.execPath,["--check","--input-type=module"],{input:generated,encoding:"utf8",windowsHide:true});assert.equal(check.status,0,check.stderr);
let host=null,diskBytes=null,failure=null,execution=null,runtimeRemoved=false,productionRestored=false;
try{
  if(!prepareOnly){
    host=await inspectStressHostMemory();console.log(JSON.stringify({host}));assert.equal(host.safeToStart,true);
    const disk=await statfs(root);diskBytes=disk.bavail*disk.bsize;assert.ok(diskBytes>=32*1024**3);await verifyBinding();
    const runtime=await createOwnedRuntimeScratch("live-memory-driver-");
    try{
      const archive=gzipSync(Buffer.from(generated),{level:9});assert.deepEqual(gunzipSync(archive).toString(),generated);
      const sourceArchive={path:`outputs/reports/${stamp}-live-memory-executed-source.mjs.gz`,bytes:archive.length,sha256:sha(archive),restoredSha256:sha(generated)};
      await writeFile(path.join(root,sourceArchive.path),archive,{flag:"wx"});
      const driver=path.join(runtime.directory,"probe.mjs");await writeFile(driver,generated,{flag:"wx"});
      const existing=new Set(await readdir(reports));
      const child=spawn(process.execPath,[driver],{cwd:root,env:{...runtime.env,WITHIN_MPEG2_SPLIT_CANDIDATE_DIR:"mpeg2-split-pipeline-37739125738"},windowsHide:true,stdio:"inherit"});
      const actualExitCode=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",(code,signal)=>signal?reject(new Error(`Diagnostic signal ${signal}`)):resolve(code));});
      const names=(await readdir(reports)).filter(name=>!existing.has(name)&&name.endsWith("-private-mpeg2-live-memory-native-100ms.json"));assert.equal(names.length,1);
      const file=path.join(reports,names[0]),identity=await lstat(file,{bigint:true});assert.ok(identity.isFile()&&!identity.isSymbolicLink());assert.equal(await realpath(file),file);
      const raw=await readFile(file);assert.ok(raw.length<=32*1048576);const report=JSON.parse(raw);
      const gzip=gzipSync(raw,{level:9});assert.deepEqual(gunzipSync(gzip),raw);
      const compressedReport={path:`outputs/reports/${stamp}-live-memory-raw.json.gz`,bytes:gzip.length,sha256:sha(gzip)};
      await writeFile(path.join(root,compressedReport.path),gzip,{flag:"wx"});assert.equal(sha(gunzipSync(await read(compressedReport.path))),sha(raw));
      const current=await lstat(file,{bigint:true});assert.equal(current.dev,identity.dev);assert.equal(current.ino,identity.ino);assert.equal(sha(await readFile(file)),sha(raw));await unlink(file);
      execution={actualExitCode,sourceArchive,rawReport:{path:path.relative(root,file).replaceAll("\\","/"),bytes:raw.length,sha256:sha(raw)},
        compressedReport,rawRemovedAfterLosslessArchive:true,rawStatus:report.status,failure:report.failure,
        liveMemoryRecords:report.liveMemoryRecords,progressProbe:report.progressProbe,runs:report.runs,cleanup:report.cleanup,
        nativeFailureCapture:report.nativeFailureCapture,runtimeDirectory:report.runtimeDirectory};
      assert.equal(actualExitCode,1);assert.equal(report.status,"failed");assert.equal(report.failure?.name,"AssertionError");
      assert.match(report.failure.message,/250MiB|cancelled[\s\S]*complete|Conversion deadline/);
      assert.ok(report.liveMemoryRecords.length>=2&&report.liveMemoryRecords.length<=3);
      for(const row of report.liveMemoryRecords){assert.equal(row.error,null);assert.equal(row.result?.status,"captured-live-light-memory-diagnostic");}
      assert.ok(report.liveMemoryRecords.some(row=>row.before?.jobState==="running"&&row.after?.jobState==="running"));
      assert.equal(report.source.bytes,2958573265);assert.equal(report.source.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
      assert.deepEqual(report.forbiddenRequests,[]);
      for(const key of ["mediaProfileRuntimeRemoved","generatedDistRestored","protectedFixtureUnchanged","observerStopped","sampledChromeRootStopped"])assert.equal(report.cleanup[key],true,key);
      await assert.rejects(access(report.runtimeDirectory),{code:"ENOENT"});await verifyBinding();productionRestored=true;
      console.log(JSON.stringify({actualExitCode,livePhases:report.liveMemoryRecords.map(row=>row.phase),failure:report.failure.message}));
    }finally{await runtime.close();runtimeRemoved=true;}
  }
}catch(error){failure=String(error.stack??error).slice(0,8192);process.exitCode=1;console.error(failure);}
const postSourcePins={};for(const file of Object.keys(sourcePins))postSourcePins[file]=sha(await read(file));assert.deepEqual(postSourcePins,sourcePins);
const proof={recordedAt:new Date().toISOString(),status:prepareOnly?"prepared-not-browser-executed":failure?"failed-or-incomplete-diagnostic":"live-memory-diagnostic-returned-independent-analysis-pending",
  sourcePins,postSourcePins,generatedSha256:sha(generated),generatedBytes:Buffer.byteLength(generated),host,diskBytes,execution,runtimeRemoved,productionRestored,failure,
  completeOriginalConversions:0,nativeAllocationCauseProven:false,publicAcceptance:false,originalFullSourceAcceptance:false,conversionSpeedAcceptance:false,completeChromiumMemoryAcceptance:false};
const proofPath=`evidence/${stamp}-live-memory${prepareOnly?"-preparation":""}.json`;
await writeFile(path.join(root,proofPath),JSON.stringify(proof,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({proofPath,status:proof.status}));

// Real changed transport candidate, unchanged production codec/AVIO/validator gates.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access,readFile,readdir,stat,statfs,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { gzipSync,gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { makeStableUiHeadlessBaseline,baselineBinding,sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),exec=promisify(execFile);
const prepareOnly=process.argv[2]==="--prepare-only";assert.ok(process.argv.length===2||(process.argv.length===3&&prepareOnly));
const stamp=new Date().toISOString().replaceAll(/[:.]/g,"-"),prefix=`evidence/${stamp}-split-copy-kernel-goldens`;
const baselinePath="evidence/2026-10-08T21-50-57-923Z-stable-ui-headless-baseline.json",baselineBytes=await read(baselinePath),baseline=JSON.parse(baselineBytes);
assert.equal(baseline.status,"matched-headless-geometry-and-five-goldens-passed");
const gzip=await read(baseline.compressedReport.path);assert.equal(sha(gzip),baseline.compressedReport.sha256);
const baselineRaw=gunzipSync(gzip,{maxOutputLength:2097152});assert.equal(sha(baselineRaw),baseline.rawReport.sha256);const baselineReport=JSON.parse(baselineRaw);
const referenceBytes=await read(baseline.reference.path);assert.equal(sha(referenceBytes),baseline.reference.sha256);
const reference=JSON.parse(referenceBytes),sourceGzip=await read(reference.generatedArchive.path);assert.equal(sha(sourceGzip),reference.generatedArchive.sha256);
const executed=JSON.parse(gunzipSync(sourceGzip,{maxOutputLength:262144}));
const restoration=JSON.parse(await read(baseline.candidateValidation.path));
const sourcePins={...baseline.sourcePins};
for(const[file,hash]of Object.entries(sourcePins))assert.equal(sha(await read(file)),hash,file);
for(const file of ["scripts/validate-split-copy-kernel-goldens.mjs","scripts/stage-split-copy-kernel.mjs","scripts/lib/split-copy-kernel.mjs",
  "scripts/lib/split-copy-kernel-recipe.mjs","media/ffmpeg/mpeg2-split-copy.wat","media/ffmpeg/mpeg2-split-copy.wasm","tests/split-copy-kernel.test.mjs"])
  sourcePins[file]=sha(await read(file));
const original=async()=>{
  const file=path.join(root,"test.mkv");assert.equal((await stat(file)).size,2958573265);const hash=createHash("sha256");
  for await(const chunk of createReadStream(file,{highWaterMark:1048576}))hash.update(chunk);const digest=hash.digest("hex");
  assert.equal(digest,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");return{bytes:2958573265,sha256:digest};
};
const outputRoot=path.join(root,"output/playwright"),before=new Set(await readdir(outputRoot));
let runtime,host,diskBytes,protectedPre,protectedPost,generatedRecord,reportRecord,report,overlay,identities,failure=null,normalRestored=false;
let executions=0;
const previousState=process.env.WITHIN_SPLIT_COPY_STATE_DIR;
try{
  if(!prepareOnly){host=await inspectStressHostMemory();assert.equal(host.safeToStart,true);const disk=await statfs(root);diskBytes=disk.bavail*disk.bsize;assert.ok(diskBytes>=2147483648);protectedPre=await original();}
  runtime=await createOwnedRuntimeScratch("split-copy-goldens-");
  const generated=makeStableUiHeadlessBaseline(executed,root,runtime.directory,stamp);
  const oldStager="scripts/stage-mpeg2-late-allocator-abort.mjs",newStager="scripts/stage-split-copy-kernel.mjs";
  assert.equal(generated.driver.split(oldStager).length,4);
  const originalDriver=generated.driver;generated.driver=generated.driver.replaceAll(oldStager,newStager);
  assert.equal(generated.driver.replaceAll(newStager,oldStager),originalDriver);
  assert.equal((generated.driver.match(/windowsHide: true/g)??[]).length,6);
  assert.ok(generated.spec.includes("headless: true")&&!generated.spec.includes("headless: false"));
  generated.copyOverlayPatch={before:oldStager,after:newStager,originalDriverSha256:sha(originalDriver)};
  const bytes=Buffer.from(JSON.stringify(generated)),archive=gzipSync(bytes,{level:9});assert.deepEqual(gunzipSync(archive),bytes);
  const archivePath=`outputs/reports/${stamp}-split-copy-kernel-golden-executed-sources.json.gz`;await writeFile(path.join(root,archivePath),archive,{flag:"wx"});
  assert.deepEqual(gunzipSync(await read(archivePath)),bytes);generatedRecord={path:archivePath,bytes:archive.length,sha256:sha(archive),restoredBytes:bytes.length,restoredSha256:sha(bytes)};
  for(const[name,file]of[["spec","candidate.spec.ts"],["driver","run.mjs"],["config","playwright.config.mjs"]])await writeFile(path.join(runtime.directory,file),generated[name],{flag:"wx"});
  if(!prepareOnly){
    process.env.WITHIN_SPLIT_COPY_STATE_DIR=runtime.directory;
    const launchHost=await inspectStressHostMemory();assert.equal(launchHost.safeToStart,true);
    executions=1;await import(pathToFileURL(path.join(runtime.directory,"run.mjs")).href);assert.ok(!process.exitCode,"Actual suite failure remains failure; no retry");
    overlay=JSON.parse(await readFile(path.join(runtime.directory,"copy-overlay.json")));
  }
}catch(error){failure=String(error.stack??error).slice(0,8192);process.exitCode=1;console.error(failure);}
finally{
  if(previousState===undefined)delete process.env.WITHIN_SPLIT_COPY_STATE_DIR;else process.env.WITHIN_SPLIT_COPY_STATE_DIR=previousState;
  try{
    if(!prepareOnly){
      const normal=await read("dist/client"+baselineBinding.url);assert.equal(normal.length,baselineBinding.bytes);assert.equal(sha(normal),baselineBinding.sha256);
      for(const[file,hash]of Object.entries(restoration.cleanup.restoredAssetHashes))assert.equal(sha(await read("dist/client/engines/remux/"+file)),hash);
      for(const file of ["_private_split_decoder.mjs","_private_split_decoder.wasm","_private_split_encoder.mjs","_private_split_encoder.wasm",
        "mpeg2-split-session.mjs","mpeg2-split-frame-bridge.mjs","mpeg2-split-frame-layout.mjs","mpeg2-split-frame-properties.mjs","mpeg2-split-packet-bridge.mjs",
        "split-copy-kernel.mjs","_private_split_copy.wasm"])await assert.rejects(access(path.join(root,"dist/client/engines/remux",file)),{code:"ENOENT"});
      normalRestored=true;if(protectedPre)protectedPost=await original();
    }
  }catch(error){failure=`${failure??""}\nRestoration: ${error.stack??error}`.slice(0,12288);process.exitCode=1;}
  finally{if(runtime){await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}}
}
try{
  if(executions===1){
    const reports=(await readdir(outputRoot)).filter(file=>!before.has(file)&&file.endsWith("-mpeg2-split-pipeline-37739125738-direct-artwork.json"));
    if(!failure)assert.equal(reports.length,1);
    if(reports.length===1){
      const rawPath="output/playwright/"+reports[0],bytes=await read(rawPath);assert.ok(bytes.length<2097152);report=JSON.parse(bytes);
      const archive=gzipSync(bytes,{level:9});assert.deepEqual(gunzipSync(archive),bytes);const archivePath=`outputs/reports/${stamp}-split-copy-kernel-golden-report.json.gz`;
      await writeFile(path.join(root,archivePath),archive,{flag:"wx"});assert.deepEqual(gunzipSync(await read(archivePath)),bytes);
      reportRecord={rawPath,rawBytes:bytes.length,rawSha256:sha(bytes),archivePath,archiveBytes:archive.length,archiveSha256:sha(archive)};
      if(!failure){
        const conversions=report.rows.filter(row=>!row.kind&&row.status==="passed"),expected=baselineReport.rows.filter(row=>!row.kind&&row.status==="passed");assert.equal(conversions.length,3);
        for(let i=0;i<3;i++)for(const field of ["sourceBytes","outputBytes","outputCodec","frames","audioTracks","ssim","outputSha256","destination","sourceCodec"])
          assert.deepEqual(conversions[i][field],expected[i][field],field);
        const records=report.rows.filter(row=>row.kind==="actual-split-native-ownership");assert.equal(records.length,5);
        for(const record of records){
          assert.equal(record.samples.length,1);const value=record.samples[0];assert.equal(value.copyKernel.closed,true);
          assert.ok(value.copyKernel.nativePlaneCalls>0);assert.equal(value.copyKernel.copiedBytes,value.copiedPixelBytes);
          assert.equal(value.copyKernel.additionalWasmMemoryBytes,0);assert.equal(value.copyKernel.additionalPixelBufferBytes,0);
          assert.equal(value.copyKernel.queuedFrames,0);assert.equal(value.aggregateWasmMemoryBytes,50331648);
        }
        for(const kind of["direct-write-failure","cancel-after-direct-output"]){const row=report.rows.filter(r=>r.kind===kind);assert.equal(row.length,1);assert.equal(row[0].status,"passed");assert.deepEqual(row[0].partialBytes,[]);}
        const inventories=report.rows.filter(row=>"cleanupRemovedEntries"in row);assert.equal(inventories.length,5);assert.ok(inventories.every(row=>row.cleanupRemovedEntries.length===0));
      }
      const pids=[...new Set(report.rows.flatMap(row=>row.samples??[]).flatMap(sample=>sample.processes??[]).map(row=>row.pid))];assert.ok(pids.length>0&&pids.length<=128);
      const query=pids.map(pid=>{assert.ok(Number.isSafeInteger(pid)&&pid>0);return`ProcessId = ${pid}`;}).join(" or ");
      const{stdout}=await exec("powershell.exe",["-NoProfile","-NonInteractive","-Command",`$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${query}' | Select-Object ProcessId,ParentProcessId) -Compress`],{windowsHide:true,timeout:15000,maxBuffer:131072});
      identities={observedCount:pids.length,current:JSON.parse(stdout),nativeBirthsUnavailable:true,noProcessesKilled:true};assert.deepEqual(identities.current,[],"Inspect reuse; never kill unrelated processes");
    }
  }
}catch(error){failure=`${failure??""}\nValidation: ${error.stack??error}`.slice(0,16384);process.exitCode=1;console.error(failure);}
const postSourcePins={};for(const file of Object.keys(sourcePins))postSourcePins[file]=sha(await read(file));assert.deepEqual(postSourcePins,sourcePins);
const proof={recordedAt:new Date().toISOString(),status:failure?"failed-or-incomplete":prepareOnly?"prepared-not-browser-executed":"headless-changed-copy-kernel-five-goldens-passed",failure,
  executions,sourcePins,postSourcePins,baseline:{path:baselinePath,sha256:sha(baselineBytes)},hostPreflight:host??null,diskBytes:diskBytes??null,
  generatedArchive:generatedRecord??null,report:reportRecord??null,overlay:overlay??null,protectedPre:protectedPre??null,protectedPost:protectedPost??null,
  cleanup:{normalProductionRestored:normalRestored,ownedRuntime:runtime?.directory??null,ownedRuntimeAbsent:!!runtime,numericIdentities:identities??null},
  browserMode:"headless",subprocessWindowsHidden:true,headedManualValidation:false,originalFullSourceAcceptance:false,
  conversionSpeedAcceptance:false,completeChromiumMemoryAcceptance:false,publicAcceptance:false};
await writeFile(path.join(root,prefix+".json"),JSON.stringify(proof,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({proofPath:prefix+".json",status:proof.status,executions,failure,cleanup:proof.cleanup}));

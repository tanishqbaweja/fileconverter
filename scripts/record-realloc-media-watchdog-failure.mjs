// One terminal inspection, NEVER a conversion retry or substitute acceptance.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access,lstat,readFile,readdir,realpath,rm,stat,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
assert.equal(process.argv.length,2);
const root=path.resolve(import.meta.dirname,".."),read=name=>readFile(path.join(root,name)),stamp="2026-10-14T08-57-06-152Z";
const archivePath=`outputs/reports/${stamp}-realloc-media-executed-sources.json.gz`,zip=await read(archivePath),raw=gunzipSync(zip,{maxOutputLength:8388608}),archive=JSON.parse(raw);
assert.equal(Object.keys(archive.sourcePins).length,243);
const postSourcePins={};for(const [file,hash] of Object.entries(archive.sourcePins)){assert.equal(sha(archive.sources[file]),hash);postSourcePins[file]=sha(await read(file));assert.equal(postSourcePins[file],hash,file);}
const launchesPath=`outputs/reports/${stamp}-single-idle-golden-launch-identities.json`,launchBytes=await read(launchesPath),launches=JSON.parse(launchBytes);
assert.equal(launches.launchRecords.length,2);assert.equal(launches.runtimeAbsent,true);await assert.rejects(access(launches.runtime),{code:"ENOENT"});
const processAbsence=await Promise.all(launches.launchRecords.map(row=>observeOwnedProcessExit(row.identity)));
for(const row of processAbsence)assert.equal(row.status,"owned-identity-absent");
const ownedWrapper=path.join(root,"work/packet-cache-media-JLqBXT"),ownedCaller=path.join(root,"work/realloc-media-caller-h6Kvtb");
for(const directory of [ownedWrapper,ownedCaller])await assert.rejects(access(directory),{code:"ENOENT"});
const restored={};for(const name of ["within-remux.mjs","within-remux.wasm","within-mpeg4.mjs","within-mpeg4.wasm","within-direct.mjs","within-direct.wasm"]){
  restored[name]=sha(await read("public/engines/remux/"+name));assert.equal(sha(await read("dist/client/engines/remux/"+name)),restored[name]);
}
for(const name of ["_private_split_decoder.mjs","_private_split_decoder.wasm","_private_split_encoder.mjs","_private_split_encoder.wasm"])
  await assert.rejects(access(path.join(root,"dist/client/engines/remux",name)),{code:"ENOENT"});
const originalFile=path.join(root,"test.mkv");assert.equal((await stat(originalFile)).size,2958573265);
const originalHash=createHash("sha256");for await(const chunk of createReadStream(originalFile,{highWaterMark:1048576}))originalHash.update(chunk);
const originalSha256=originalHash.digest("hex");assert.equal(originalSha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const fixture=path.join(root,"work/mpeg2-artwork-validation-oV5OPS"),identity=await lstat(fixture,{bigint:true});
assert.equal(path.dirname(fixture),path.join(root,"work"));assert.equal(identity.isDirectory(),true);assert.equal(identity.isSymbolicLink(),false);assert.equal(await realpath(fixture),fixture);
// Historical launcher lacks a durable fixture journal. Join this unique child
// to exact generated mkdtemp recipe, launch window, expected names/input bytes.
assert.ok(archive.generated.spec.includes('work = await mkdtemp(path.join(root, "work/mpeg2-artwork-validation-"))'));
assert.ok(Number(identity.birthtimeMs)>=Date.parse("2026-10-14T08:57:22Z")&&Number(identity.birthtimeMs)<=Date.parse("2026-10-14T08:57:28Z"));
const names=await readdir(fixture);assert.deepEqual(names.sort(),["artwork.png","cancel.mkv","chapters.ffmetadata","hevc.mkv","result.mp4","source.mkv"].sort());
const files=[];for(const name of names){const bytes=await readFile(path.join(fixture,name)),info=await lstat(path.join(fixture,name));assert.equal(info.isFile(),true);assert.equal(info.isSymbolicLink(),false);assert.ok(bytes.length<=16777216);files.push({name,bytes:bytes.length,sha256:sha(bytes)});}
assert.equal(files.find(x=>x.name==="hevc.mkv").sha256,"6de34df2f96e8cce3318f21893d07a395b31a6968d680bd40484f6e8771a5dcb");
assert.equal(files.find(x=>x.name==="result.mp4").bytes,2245558);assert.equal(files.find(x=>x.name==="result.mp4").sha256,"554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27");
const runtime=await createOwnedRuntimeScratch("realloc-failure-inspection-"),exec=promisify(execFile);let probe=null,validationFailure=null,removedBytes=0;
try {
  const output=path.join(fixture,"result.mp4");const result=await exec("C:/ffmpeg/bin/ffprobe.exe",["-v","error","-count_frames","-show_streams","-show_format","-show_chapters","-of","json",output],{cwd:root,env:runtime.env,windowsHide:true,timeout:30000,maxBuffer:1048576});
  probe=JSON.parse(result.stdout);const video=probe.streams.find(x=>x.codec_type==="video"&&!x.disposition?.attached_pic);
  assert.equal(video.codec_name,"mpeg2video");assert.equal(video.nb_read_frames,"96");assert.equal(video.width,1920);assert.equal(video.height,804);
  await exec("C:/ffmpeg/bin/ffmpeg.exe",["-v","error","-xerror","-threads","1","-i",output,"-map","0:v:0","-map","0:a","-f","null","-"],{cwd:root,env:runtime.env,windowsHide:true,timeout:30000,maxBuffer:1048576});
}catch(error){validationFailure=String(error.stack??error).slice(0,4096);process.exitCode=1;}
finally {
  await runtime.close();const current=await lstat(fixture,{bigint:true});assert.equal(current.dev,identity.dev);assert.equal(current.ino,identity.ino);assert.equal(await realpath(fixture),fixture);
  await rm(fixture,{recursive:true,force:false,maxRetries:5,retryDelay:100});await assert.rejects(access(fixture),{code:"ENOENT"});removedBytes=files.reduce((sum,row)=>sum+row.bytes,0);
}
const ownFile="scripts/record-realloc-media-watchdog-failure.mjs",ownBytes=await read(ownFile),proofPath=`evidence/${stamp}-realloc-media-watchdog-failure.json`;
const proof={recordedAt:new Date().toISOString(),status:"failed-suite-watchdog-not-four-conversion-acceptance",failure:"Private correctness test timeout; no automatic retry. Disposable fixture/output directory remained after forced runner stop.",
  originalSuiteGlobalWatchdogMs:180000,individualTestTimeoutMs:60000,terminalParentExitCode:1,fullTerminalBrowserReportRetained:false,
  failedFourthCaseReachedFromRunnerOutput:true,fourConversionsIndependentlyQualified:false,primaryIncrementalPrivateMiB:null,publicAcceptance:false,
  archive:{path:archivePath,bytes:zip.length,sha256:sha(zip),restoredBytes:raw.length,restoredSha256:sha(raw)},sourcePins:archive.sourcePins,postSourcePins,
  sourceCount:243,allExecutedPreimagesVerified:true,unchanged256Source8MiBCaps:true,launches:{path:launchesPath,sha256:sha(launchBytes)},processAbsence,
  completeBrowserBirthInventoryAvailable:false,ownedCallerAbsent:true,ownedWrapperAbsent:true,stockAssetsRestored:restored,
  protectedPost:{bytes:2958573265,sha256:originalSha256},preWholeHashAssertedByExecutedDriver:true,preWholeHashSeparateReceiptUnavailable:true,
  leftoverOutputOnly:{files,probe,nativeFullDecodePassed:validationFailure===null,validationFailure,byteExactPriorGolden:true,notFourCaseAcceptance:true},
  cleanup:{path:fixture,identity:{dev:String(identity.dev),ino:String(identity.ino),birthtimeMs:String(identity.birthtimeMs)},removedBytes,ownedDisposableDirectoryRemoved:true,originalPreserved:true,noProcessesKilled:true},
  ownSource:{path:ownFile,sha256:sha(ownBytes),preimage:ownBytes.toString("base64")},noDocker:true,browserMode:"headless",headedCoverageVerified:false};
await writeFile(path.join(root,proofPath),JSON.stringify(proof,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({proofPath,status:proof.status,sourceCount:243,removedBytes,nativeFullDecodePassed:proof.leftoverOutputOnly.nativeFullDecodePassed,originalSha256}));

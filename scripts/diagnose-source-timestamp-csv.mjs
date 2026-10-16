// One exact full-source native VALIDATOR command. Never converts the protected source.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {access,lstat,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";
import {gzipSync,gunzipSync} from "node:zlib";
import {createOwnedRuntimeScratch} from "./lib/owned-runtime-scratch.mjs";
import {queryReliableProcessIdentity} from "./lib/reliable-owned-identity.mjs";
import {inspectStressHostMemory} from "./lib/host-memory-preflight.mjs";
import {verifyThreadValidatorQualification} from "./lib/threaded-validator-qualification.mjs";
import {createTimestampCsvDiagnostic,executedFrameTimesBody,replayExecutedFrameTimes} from "./lib/timestamp-csv-diagnostic.mjs";
import {supervisorJournal} from "./lib/bounded-supervisor-journal.mjs";
import {sha} from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),execute=promisify(execFile);
assert.equal(process.argv.length,2);
const stamp=new Date().toISOString().replaceAll(/[:.]/g,"-"),output=`evidence/${stamp}-source-timestamp-csv-diagnostic.json`,live=`evidence/${stamp}-source-timestamp-csv-live.json`;
const original="test.mkv",fullPath="evidence/2026-10-16T17-01-47-260Z-updated-chrome-full-terminal.json",terminal=JSON.parse(await read(fullPath));
const archiveZip=await read(terminal.sourceArchive.path);assert.equal(sha(archiveZip),terminal.sourceArchive.sha256);
const archive=JSON.parse(gunzipSync(archiveZip,{maxOutputLength:8388608})),body=executedFrameTimesBody(archive.driver);
const qualification=await verifyThreadValidatorQualification(root),executable=qualification.record.native.ffprobe.path;
const host=await inspectStressHostMemory();assert.equal(host.safeToStart,true);
const protectedSource=async()=>{
  assert.equal((await lstat(path.join(root,original))).size,2958573265);const hash=createHash("sha256");
  for await(const chunk of createReadStream(path.join(root,original),{highWaterMark:1048576}))hash.update(chunk);
  const sha256=hash.digest("hex");assert.equal(sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");return {bytes:2958573265,sha256};
};
const protectedBefore=await protectedSource(),runtime=await createOwnedRuntimeScratch("source-timestamp-csv-");
const files=["scripts/diagnose-source-timestamp-csv.mjs","scripts/lib/timestamp-csv-diagnostic.mjs","tests/timestamp-csv-diagnostic.test.mjs",
  "scripts/lib/reliable-readonly-preflight.mjs","scripts/lib/owned-runtime-scratch.mjs","scripts/lib/reliable-owned-identity.mjs",
  "scripts/lib/host-memory-preflight.mjs","scripts/lib/threaded-validator-qualification.mjs","scripts/lib/bounded-supervisor-journal.mjs"];
const sourcePins={},preimages={};for(const file of files){const bytes=await read(file);sourcePins[file]=sha(bytes);preimages[file]=bytes.toString("base64");}
const record={status:"starting-read-only-diagnostic",recordedAt:new Date().toISOString(),host,qualification:qualification.reference,
  protectedBefore,protectedAfter:null,runtime:runtime.directory,runtimeRemoved:false,sourcePins,postSourcePins:null,preimages,
  actualFailedDriver:{path:fullPath,sourceArchive:terminal.sourceArchive,frameTimesSha256:sha(body)},
  conversionPerformed:false,fullOriginalAcceptance:false,publicAcceptance:false,acceptanceParserChanged:false,failure:null};
const checkpoint=supervisorJournal(path.join(root,live)),collector=createTimestampCsvDiagnostic();
let operation,settled=false,interval,pending=false,journalFailure=null,streamFailure=null;
try {
  const args=["-v","error","-threads","4","-select_streams","v:0","-show_frames","-show_entries","frame=best_effort_timestamp_time","-of","csv=p=0",path.join(root,original)];
  const started=Date.now();operation=execute(executable,args,{cwd:root,env:runtime.env,windowsHide:true,timeout:1800000,maxBuffer:33554432,encoding:"utf8"});
  operation.then(()=>{settled=true;},()=>{settled=true;});
  operation.child.stdout.on("data",chunk=>{try{collector.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));}catch(error){streamFailure??=error;}});
  record.launch={identity:await queryReliableProcessIdentity(operation.child.pid),executable,args,maximumMs:1800000,maximumStdoutBytes:33554432,windowsHidden:true};
  assert.ok(record.launch.identity&&record.launch.identity.parentPid===process.pid);
  record.status="reading-full-source-timestamps";await checkpoint({...record,progress:collector.snapshot(),updatedAt:new Date().toISOString()});
  console.log(JSON.stringify({live,output,launch:record.launch,estimatedMinutes:12}));
  interval=setInterval(()=>{if(pending)return;pending=true;checkpoint({...record,progress:collector.snapshot(),updatedAt:new Date().toISOString()})
    .catch(error=>{journalFailure??=error;}).finally(()=>{pending=false;});},60000);
  const result=await operation;clearInterval(interval);record.elapsedMs=Date.now()-started;
  if(journalFailure)throw journalFailure;if(streamFailure)throw streamFailure;
  record.stream=collector.finish();record.captured={bytes:Buffer.byteLength(result.stdout),sha256:sha(result.stdout)};
  record.stderr={bytes:Buffer.byteLength(result.stderr),sha256:sha(result.stderr),tail:result.stderr.slice(-8192)};
  assert.equal(record.stream.stdoutSha256,record.captured.sha256,"Data-event stream must equal exact execFile captured stdout");
  record.executedParser=await replayExecutedFrameTimes(body,result.stdout);
  const compressed=gzipSync(result.stdout,{level:9});assert.equal(gunzipSync(compressed,{maxOutputLength:33554432}).toString(),result.stdout);
  const file=`outputs/reports/${stamp}-source-timestamp-csv-diagnostic.csv.gz`;await writeFile(path.join(root,file),compressed,{flag:"wx"});
  record.localRawCsv={path:file,bytes:compressed.length,sha256:sha(compressed),restoredBytes:record.captured.bytes,restoredSha256:record.captured.sha256,
    localDiagnosticOnlyNotConversionOutput:true};
  record.matchesPriorQualifiedCount=record.executedParser.frames===qualification.analysis.qualifiedFrames;
  record.matchesPriorQualifiedTimingDigest=record.executedParser.orderedTimestampSha256===qualification.record.sourceResult.orderedTimestampSha256;
  record.status="full-source-diagnostic-completed-not-browser-acceptance";
}catch(error){record.failure={name:error.name,message:String(error.message).slice(0,8192),code:error.code??null,signal:error.signal??null,killed:error.killed??null};record.status="diagnostic-failed";process.exitCode=1;}
finally {
  clearInterval(interval);if(operation&&!settled)await operation.catch(()=>{});
  record.protectedAfter=await protectedSource();assert.deepEqual(record.protectedAfter,protectedBefore);
  await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});record.runtimeRemoved=true;
  const post={};for(const [file,hash]of Object.entries(sourcePins)){post[file]=sha(await read(file));assert.equal(post[file],hash);}record.postSourcePins=post;
  assert.deepEqual((await verifyThreadValidatorQualification(root)).reference,qualification.reference);
  record.finishedAt=new Date().toISOString();await writeFile(path.join(root,output),JSON.stringify(record,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({output,status:record.status,failure:record.failure,stream:record.stream,parser:record.executedParser,stderr:record.stderr}));
}

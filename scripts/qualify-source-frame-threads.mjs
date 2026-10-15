// Native INDEPENDENT VALIDATOR qualification only. Never converts the protected source.
import assert from "node:assert/strict";
import { execFile,spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access,readFile,stat,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { createFrameTimingCollector } from "./lib/frame-timing-stream.mjs";
import { supervisorJournal } from "./lib/bounded-supervisor-journal.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),stamp=new Date().toISOString().replaceAll(/[:.]/g,"-"),execute=promisify(execFile);
const source=path.join(root,"test.mkv"),ffprobe="C:/ffmpeg/bin/ffprobe.exe",ffmpeg="C:/ffmpeg/bin/ffmpeg.exe";
const output=`evidence/${stamp}-source-frame-threads.json`,live=`evidence/${stamp}-source-frame-threads-live.json`;
const hashFile=async file=>{const digest=createHash("sha256");for await(const chunk of createReadStream(file,{highWaterMark:1048576}))digest.update(chunk);return digest.digest("hex");};
const protectedSource=async()=>{assert.equal((await stat(source)).size,2958573265);const hash=await hashFile(source);assert.equal(hash,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");return{bytes:2958573265,sha256:hash};};
const runtime=await createOwnedRuntimeScratch("source-frame-threads-");
const files=["scripts/qualify-source-frame-threads.mjs","scripts/lib/frame-timing-stream.mjs","tests/frame-timing-stream.test.mjs",
  "scripts/lib/reliable-owned-identity.mjs","scripts/lib/owned-runtime-scratch.mjs","scripts/lib/host-memory-preflight.mjs","scripts/lib/bounded-supervisor-journal.mjs"];
const pins={},preimages={};for(const file of files){const bytes=await readFile(path.join(root,file));pins[file]=sha(bytes);preimages[file]=bytes.toString("base64");}
const record={recordedAt:null,status:"starting",failure:null,conversionPerformed:false,scope:"Independent native decoder threading/timestamps only, not browser conversion or profile acceptance",
  sourcePins:pins,postSourcePins:{},sourcePreimages:preimages,host:null,protectedBefore:null,protectedAfter:null,native:null,
  control:null,sourceResult:null,launch:null,exit:null,runtime:runtime.directory,runtimeRemoved:false,fullOriginalAcceptance:false,publicAcceptance:false,speedGainProven:false};
const writeLive=supervisorJournal(path.join(root,live));
const native=async(executable,args,maximum=1048576)=>execute(executable,args,{cwd:root,env:runtime.env,windowsHide:true,timeout:120000,maxBuffer:maximum});
try {
  record.host=await inspectStressHostMemory();assert.equal(record.host.safeToStart,true);record.protectedBefore=await protectedSource();
  const help=await native(ffprobe,["-hide_banner","-h","full"]);assert.match(help.stdout+help.stderr,/-threads\s+<int>[^\r\n]+\(default 1\)/);
  record.native={ffprobe:{path:ffprobe,sha256:await hashFile(ffprobe)},ffmpeg:{path:ffmpeg,sha256:await hashFile(ffmpeg)},defaultProbeThreads:1,candidateThreads:4,
    helpSha256:sha(help.stdout+help.stderr)};
  const fixture=path.join(runtime.directory,"thread-control.mkv");
  await native(ffmpeg,["-v","error","-f","lavfi","-i","testsrc2=size=1920x804:rate=24:duration=4","-c:v","libx265","-preset","fast","-threads","1",
    "-x265-params","pools=none:frame-threads=1:log-level=error","-an",fixture]);
  const timings=[],pixelHashes=[];
  for(const threads of [1,4]) {
    const start=performance.now(),result=await native(ffprobe,["-v","error","-threads",String(threads),"-select_streams","v:0","-show_frames","-show_entries","frame=best_effort_timestamp_time","-of","csv=p=0",fixture]);
    assert.equal(result.stderr,"");const collector=createFrameTimingCollector();collector.push(Buffer.from(result.stdout));
    timings.push({threads,elapsedMs:performance.now()-start,...collector.finish(96)});
    const decoded=await native(ffmpeg,["-v","error","-threads",String(threads),"-i",fixture,"-map","0:v:0","-an","-f","framemd5","pipe:1"]);
    assert.equal(decoded.stderr,"");pixelHashes.push({threads,framemd5Sha256:sha(decoded.stdout)});
  }
  assert.equal(timings[0].orderedTimestampSha256,timings[1].orderedTimestampSha256);assert.equal(pixelHashes[0].framemd5Sha256,pixelHashes[1].framemd5Sha256);
  record.control={fixtureBytes:(await stat(fixture)).size,fixtureSha256:await hashFile(fixture),timings,pixelHashes,
    all96FixtureDecodedPixelsAndTimingsEqual:true,notControlledProductionSpeedBenchmark:true};
  console.log(JSON.stringify({live,output,status:"full-source-4-thread-frame-timing-starting",control:record.control}));
  const args=["-v","error","-threads","4","-select_streams","v:0","-show_frames","-show_entries","frame=best_effort_timestamp_time","-of","csv=p=0",source];
  const collector=createFrameTimingCollector(),started=Date.now();let stderr=Buffer.alloc(0),parseFailure=null,ended=false;
  const child=spawn(ffprobe,args,{cwd:root,env:runtime.env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  const closed=new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>{ended=true;resolve({code,signal,elapsedMs:Date.now()-started});});});
  child.stdout.on("data",chunk=>{if(parseFailure)return;try{collector.push(chunk);}catch(error){parseFailure=error;}});
  child.stderr.on("data",chunk=>{stderr=Buffer.concat([stderr,chunk]).subarray(-8192);});
  let identity,timer,interval,checkpointPending=false,timeoutFailure=null;
  try {
    identity=await queryReliableProcessIdentity(child.pid);assert.ok(identity&&identity.parentPid===process.pid);
    record.launch={identity,executable:ffprobe,args,windowsHidden:true,maximumMs:1800000};record.status="extracting-full-protected-source-frame-timing";
    await writeLive({...record,updatedAt:new Date().toISOString(),progress:collector.snapshot()});
    interval=setInterval(()=>{if(checkpointPending)return;checkpointPending=true;
      writeLive({...record,updatedAt:new Date().toISOString(),progress:collector.snapshot(),elapsedMs:Date.now()-started})
        .catch(error=>{timeoutFailure??=error;}).finally(()=>{checkpointPending=false;});},60000);
    timer=setTimeout(()=>{void(async()=>{
      timeoutFailure=new Error("Original30-minute native-validator deadline reached; no threshold relaxation");
      if(ended)return;const current=await queryReliableProcessIdentity(child.pid);
      if(!current)return;assert.equal(current.parentPid,identity.parentPid);assert.equal(Date.parse(current.createdAt),Date.parse(identity.createdAt));
      child.kill();
    })().catch(error=>{timeoutFailure=error;});},1800000);
    record.exit=await closed;
  }finally {clearTimeout(timer);clearInterval(interval);if(!ended)record.exit=await closed;}
  record.sourceResult={...collector.snapshot(),stderrTail:stderr.toString(),elapsedMs:record.exit.elapsedMs};
  if(timeoutFailure)throw timeoutFailure;if(parseFailure)throw parseFailure;
  assert.equal(record.exit.code,0);assert.equal(record.exit.signal,null);assert.equal(stderr.length,0);
  record.sourceResult={...record.sourceResult,...collector.finish(296160)};
  record.status="full-source-frame-timing-4-threads-passed-not-browser-acceptance";
}catch(error){record.failure={message:String(error.message??error).slice(0,8192),code:error.code??null,signal:error.signal??null,killed:error.killed??null};record.status="failed-not-accepted";process.exitCode=1;}
finally {
  if(record.protectedBefore){record.protectedAfter=await protectedSource();assert.deepEqual(record.protectedBefore,record.protectedAfter);}
  await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});record.runtimeRemoved=true;
  for(const [file,hash]of Object.entries(pins)){record.postSourcePins[file]=sha(await readFile(path.join(root,file)));assert.equal(record.postSourcePins[file],hash,file);}
  record.recordedAt=new Date().toISOString();await writeFile(path.join(root,output),JSON.stringify(record,null,2)+"\n",{flag:"wx"});
}
console.log(JSON.stringify({output,status:record.status,failure:record.failure,sourceResult:record.sourceResult,runtimeRemoved:true}));

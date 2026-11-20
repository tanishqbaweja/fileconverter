// Offline retained failure analysis. Never reruns conversion or changes its result.
import assert from "node:assert/strict";
import { readFile, open, lstat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createHash } from "node:crypto";
import path from "node:path";
import { replayLosslessNativeMemoryJournal } from "./lib/lossless-native-memory-journal.mjs";
import { stableWindow } from "./lib/chromium-private-memory.mjs";
import { queryObservedPidCensus } from "./lib/owned-chromium-cleanup.mjs";
import { reconcileChromiumBirths } from "./lib/reconcile-chromium-births.mjs";
const root=path.resolve(import.meta.dirname,".."),prefix="evidence/2026-11-20-vp9-cpu-specialist-original-startup-44735542199",
  bytes=await readFile(path.join(root,prefix+".json")),r=JSON.parse(bytes),sha=b=>createHash("sha256").update(b).digest("hex"),
  hashFile=async file=>{const hash=createHash("sha256");for await(const b of createReadStream(file,{highWaterMark:262144}))hash.update(b);return hash.digest("hex");};
assert.equal(r.status,"failed-private-vp9-browser-smoke");assert.equal(r.originalStartup.stop.kind,"memory-budget-exceeded");
assert.deepEqual(stableWindow(r.blankSamples),r.blankBaseline);
const replay=await replayLosslessNativeMemoryJournal(r.nativeJournal),native=replay.summary.native,
  active=native.phases.find(p=>p.phase==="conversion"),peak=active.peak,baseline=r.blankBaseline.privateBytes;
assert.equal(replay.records,r.nativeMemory.sequence);assert.equal(replay.records,r.nativeJournal.records);
assert.equal(peak[3],r.memory.peak.privateBytes);assert.equal(peak[0],r.memory.peak.sequence);
assert.equal(active.validSamples,r.memory.validSamples);assert.equal(active.unavailableSamples,r.memory.unavailableSamples);
assert.equal(peak[7].reduce((n,p)=>n+p[1],0),peak[3]);assert.equal(peak[7].reduce((n,p)=>n+p[2],0),peak[4]);
assert.equal((peak[3]-baseline)/1048576,r.memory.incrementalPrivateMiB);assert.ok(r.memory.incrementalPrivateMiB>250);
const late=r.memory.peak.processes.filter(p=>!r.loadedIdle.processes.some(q=>q.pid===p.pid&&q.creationFileTime===p.creationFileTime))
  .sort((a,b)=>b.privateBytes-a.privateBytes)[0];assert.ok(late);
const roles=r.nativeOwnership.birthTypeCapture,role=roles.records.find(p=>p.pid===late.pid&&p.parentPid===late.parentPid&&p.creationFileTime===late.creationFileTime);
assert.equal(role.status,"classified");assert.equal(role.type,"utility");assert.equal(role.utilitySubtype,"on_device_model.mojom.OnDeviceModelService");
assert.equal(roles.processesExcluded,false);assert.equal(roles.primarySamplesMutated,false);
const pids=r.browserCleanup.observedPids,current=await queryObservedPidCensus(pids),fresh=reconcileChromiumBirths({identity:r.browserCleanup.identity,
  observedPids:pids,samples:[{processes:r.nativeMemory.identities}],current});assert.equal(fresh.allObservedBirthsAbsent,true);
assert.ok(r.browserCleanup.status==="owned-observed-pids-absent"||r.browserBirthReconciliation?.allObservedBirthsAbsent);
assert.ok(r.processCleanup.every(p=>p.status==="owned-identity-absent"));assert.equal(r.browserResult.partialOutputBytes,0);
assert.ok(r.originalStartup.partialOutputRemoved&&r.ownedRuntimeRemoved&&r.ownedStaticStageRemoved&&r.privateCpuOverride.stageRemoved);
assert.deepEqual(r.originalBefore,r.originalAfter);assert.equal(r.originalAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const profile=r.chromeArguments.find(a=>a.startsWith("--user-data-dir=")).slice(16),runtime=path.dirname(profile);
assert.ok(runtime.startsWith(path.join(root,"work")+path.sep));
for(const dir of [runtime,path.resolve(root,r.privateCpuOverride.stage),path.join(root,"dist/client/engines/webcodecs-vp9"),r.nativeJournal.rawFile])
  await assert.rejects(lstat(dir),{code:"ENOENT"});
for(const [file,digest]of Object.entries(r.sourcePins))assert.equal(await hashFile(path.join(root,file)),digest,file);
assert.equal(await hashFile(path.join(root,r.failureTrace.path)),r.failureTrace.sha256);
assert.deepEqual(r.forbiddenRequests,[]);assert.deepEqual(r.privateCpuOverride.served,{javascript:1,wasm:1});assert.deepEqual(r.privateCpuOverride.errors,[]);
let beforeLatePeak=null,csvRows=0,pending="",handle;
const csvFile=prefix+"-native.csv",input=createReadStream(r.nativeJournal.file,{highWaterMark:65536}),gunzip=createGunzip({chunkSize:65536}),decoder=new TextDecoder("utf8",{fatal:true});
const fail=e=>gunzip.destroy(e);input.on("error",fail);
try{
  handle=await open(path.join(root,csvFile),"wx");await handle.writeFile("sequence,timestamp,phase,privateBytes,rssBytes,incrementalPrivateMiB,processCount,matchedLateChildPrivateBytes,availability\n");
  for await(const chunk of input.pipe(gunzip)){
    pending+=decoder.decode(chunk,{stream:true});let newline;
    while((newline=pending.indexOf("\n"))>=0){
      const line=pending.slice(0,newline);pending=pending.slice(newline+1);assert.ok(Buffer.byteLength(line)<=262144);
      const s=JSON.parse(line).sample,child=s.processes?.find(p=>p.pid===late.pid&&p.creationFileTime===late.creationFileTime),valid=s.privateBytes!==null;
      if(s.phase==="conversion"&&valid&&Date.parse(s.timestamp)<Date.parse(late.createdAt)&&(!beforeLatePeak||s.privateBytes>beforeLatePeak.privateBytes))beforeLatePeak=s;
      await handle.writeFile([s.sequence,s.timestamp,s.phase,s.privateBytes??"",s.rssBytes??"",valid?(s.privateBytes-baseline)/1048576:"",
        s.processes?.length??"",child?.privateBytes??"",valid?"available":"unavailable"].join(",")+"\n");csvRows++;
    }assert.ok(Buffer.byteLength(pending)<262144);
  }pending+=decoder.decode();assert.equal(pending,"");assert.equal(csvRows,replay.records);await handle.sync();
}finally{input.off("error",fail);input.destroy();gunzip.destroy();await handle?.close();}
assert.ok(beforeLatePeak);
const summary={schemaVersion:1,status:"failed-unchanged250MiB-original-startup",sourceReport:prefix+".json",sourceReportSha256:sha(bytes),executedHead:r.executedHead,
  scope:"Full original supplied, bounded startup only; no completed output/fidelity/scaling/public or matched speed acceptance",
  primary:{blankPrivateBytes:baseline,peakPrivateBytes:peak[3],incrementalPrivateMiB:(peak[3]-baseline)/1048576,
    validSamples:active.validSamples,unavailableSamples:active.unavailableSamples,allPeakProcessesIncluded:true},
  nativeJournal:{file:path.relative(root,r.nativeJournal.file),rawBytes:r.nativeJournal.bytes,rawSha256:r.nativeJournal.sha256,
    archiveBytes:r.nativeJournal.archiveBytes,archiveSha256:r.nativeJournal.archiveSha256,records:replay.records,completeStreamingReplayVerified:true,rawRemoved:r.nativeJournal.rawRemoved},
  lateChild:{...late,role:{status:role.status,type:role.type,utilitySubtype:role.utilitySubtype,sandboxType:role.sandboxType},
    privateMiBAtWholeTreePeak:late.privateBytes/1048576,exactBirthMatched:true,excludedFromAcceptance:false,appCausationProven:false},
  beforeLateBirth:{wholeTreePrivateBytes:beforeLatePeak.privateBytes,incrementalPrivateMiB:(beforeLatePeak.privateBytes-baseline)/1048576,
    timestamp:beforeLatePeak.timestamp,diagnosticOnly:true,notAnAlternateAcceptanceWindow:true},
  safetyStop:r.originalStartup.stop,elapsedMs:r.browserResult.elapsedMs,inputFileBytes:r.browserResult.sourceFileBytes,
  actualInputBytesRead:r.browserResult.metrics.inputBytes,actualOutputBytesWrittenBeforeAbort:r.browserResult.metrics.outputBytes,
  actualWriteAttempts:r.browserResult.writeAttempts,partialOutputBytesAfterAbort:0,encodedFrames:null,
  sourcePinsVerified:Object.keys(r.sourcePins).length,freshBrowserBirthReconciliation:fresh,allOwnedDataRemoved:true,originalBeforeAfterFullShaAndSizeUnchanged:true,
  publicAssetsOrRoutesChanged:false,servicesDisabled:false,speedGainProven:false,fullOriginalConverted:false,independentFullFidelityPassed:false,wholeGoalComplete:false,
  nextAction:"Do not replay this configuration or disable/exclude the model service. Preserve measured default-Chrome failure and continue other original requirements; any further video run needs a distinct implementation or browser hypothesis.",
  reports:{csv:csvFile,csvRows,html:prefix+"-analysis.html"}};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]),
  graph=native.graphBuckets.filter(b=>b.peak),start=Date.parse(graph[0].peak[1]),span=Math.max(1,Date.parse(graph.at(-1).peak[1])-start),
  points=graph.map(b=>{const s=b.peak;return `${40+720*(Date.parse(s[1])-start)/span},${220-0.45*(s[3]-baseline)/1048576}`;}).join(" ");
await writeFile(path.join(root,prefix+"-analysis.json"),JSON.stringify(summary,null,2)+"\n",{flag:"wx"});
await writeFile(path.join(root,prefix+"-analysis.html"),'<!doctype html><meta charset="utf-8"><title>VP9 original startup: FAIL</title><style>body{font:16px system-ui;max-width:960px;margin:32px auto;padding:16px}th,td{text-align:left;padding:6px;border-bottom:1px solid #ddd}svg{width:100%;background:#f6f7f9}.fail{color:#b42318}</style>'+ 
  '<h1 class="fail">Original VP9 startup: FAIL</h1><p>'+escape(summary.scope)+'</p><p>Complete browser increment: '+summary.primary.incrementalPrivateMiB.toFixed(2)+' MiB; limit unchanged at 250 MiB. '+
  escape(summary.lateChild.role.utilitySubtype)+' contributed '+summary.lateChild.privateMiBAtWholeTreePeak.toFixed(2)+' MiB and is INCLUDED. Application causation is unproven.</p>'+
  '<svg viewBox="0 0 800 250" role="img" aria-label="Complete browser incremental private memory over time, one-second peak graph"><line x1="40" x2="760" y1="107.5" y2="107.5" stroke="#b42318" stroke-dasharray="6 4"/><polyline fill="none" stroke="#2454c5" stroke-width="2" points="'+points+'"/><text x="45" y="103">250 MiB limit</text><text x="40" y="244">0</text><text x="650" y="244">'+(span/1000).toFixed(1)+' seconds</text></svg>'+
  '<p>Graph uses retained one-second peaks; CSV and authenticated gzip preserve all '+replay.records+' native 100 ms observations, including unavailable samples.</p><table><tr><th>Peak process</th><th>Private MiB</th><th>Role from matching birth</th></tr>'+
  r.memory.peak.processes.map(p=>{const role=roles.records.find(q=>q.pid===p.pid&&q.creationFileTime===p.creationFileTime);return '<tr><td>'+p.pid+'</td><td>'+(p.privateBytes/1048576).toFixed(2)+'</td><td>'+escape(role?.utilitySubtype??role?.type??"unavailable")+'</td></tr>';}).join("")+
  '</table><p>Abort removed partial output. Original SHA/size unchanged; owned processes/runtime/stages reconciled. No completed conversion, speedup or public acceptance.</p>',{flag:"wx"});
console.log(JSON.stringify({analysis:prefix+"-analysis.json",incrementalPrivateMiB:summary.primary.incrementalPrivateMiB,lateChildMiB:summary.lateChild.privateMiBAtWholeTreePeak,
  preBirthDiagnosticMiB:summary.beforeLateBirth.incrementalPrivateMiB,nativeRecords:replay.records,archiveBytes:r.nativeJournal.archiveBytes,allOwnedDataRemoved:true}));

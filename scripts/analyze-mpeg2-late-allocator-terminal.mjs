// Verify ONE actual terminal failure. No conversion/retry or invented allocation cause.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
import { summarizeMemoryInfraTrace } from "./lib/partial-largest-blink-type-summary.mjs";
const root=path.resolve(import.meta.dirname,".."),MiB=1048576,sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const input="evidence/mpeg2-late-allocator-original-2026-10-08.json",bytes=await readFile(path.join(root,input)),p=JSON.parse(bytes);
assert.ok(bytes.length<4*MiB);assert.equal(p.rawStatus,"failed");assert.equal(p.completeOriginalConversions,0);
assert.match(p.failure.message,/263\.64453125MiB exceeds 250MiB/);
assert.equal(sha(p.generatedSource),p.generatedSourceSha256);assert.equal(sha(p.generatedTraceHelper),p.generatedTraceHelperSha256);
for(const[file,hash]of Object.entries(p.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),hash,file);
const raw=await readFile(path.join(root,p.rawReport.path));assert.equal(raw.length,p.rawReport.bytes);assert.equal(sha(raw),p.rawReport.sha256);
assert.ok(raw.length<=32*MiB);const report=JSON.parse(raw);assert.equal(report.status,"failed");
assert.equal(p.blankBaseline.stable,true);assert.equal(p.blankBaseline.privateBytes,244310016);
assert.equal(p.nativePeak.privateBytes,520761344);
assert.equal(p.nativePeak.processes.reduce((sum,row)=>sum+row.privateBytes,0),p.nativePeak.privateBytes);
assert.equal((p.nativePeak.privateBytes-p.blankBaseline.privateBytes)/MiB,263.64453125);
assert.equal(p.nativePeakIncrementalMiB,263.64453125);assert.equal(p.limitMiB,250);assert.equal(p.requestedRuns,3);
assert.deepEqual(p.abortDiagnostic.records,[]);assert.deepEqual(p.actualStackSymbols,[]);
assert.equal(p.runs.length,1);assert.equal(p.runs[0].state.jobState,"cancelled");assert.equal(p.runs[0].independentValidation,null);
const metrics=p.runs[0].state.metrics;
assert.equal(metrics.inputBytes,32859713);assert.equal(metrics.outputBytes,21072617);assert.equal(metrics.peakPendingOperations,1);
for(const key of["maxReadChunkBytes","maxWriteChunkBytes","peakQueuedBytes"])assert.equal(metrics[key],65536);
assert.equal(metrics.queuedBytes,0);assert.equal(metrics.pendingOperations,0);assert.equal(metrics.wasmMemoryBytes,48*MiB);
assert.equal(p.splitFinalSamples[0].frames,1515);assert.equal(p.splitFinalSamples[0].closed,true);
assert.equal(p.nativeFailureCapture.unavailableSamples,0);const failure=p.nativeFailureCapture.firstFailure;
assert.equal(failure.delta.adjacent,true);assert.equal(failure.delta.treeDeltaPrivateBytes,56823808);
const target=failure.delta.processDeltas.toSorted((a,b)=>b.deltaPrivateBytes-a.deltaPrivateBytes)[0];
assert.equal(target.pid,26280);assert.equal(target.deltaPrivateBytes,56807424);
assert.deepEqual(failure.delta.addedIdentities,[]);assert.deepEqual(failure.delta.removedIdentities,[]);
assert.equal(p.quiescedBudgetCapture.oldWorkerCloseObserved,true);
const attribution=p.rendererAttributionResult,session=attribution.sessions[0].trace,trace=session.trace,dump=session.dumps[0];
assert.equal(attribution.sessions.length,1);assert.equal(attribution.sessions[0].error,null);
assert.equal(dump.memoryDump.success,true);assert.ok(p.quiescedBudgetCapture.workerClosedAt<=Date.parse(dump.timestamp));
assert.equal(trace.parseError,null);assert.equal(trace.dataLossOccurred,false);assert.equal(trace.overflow,false);
const archive=trace.rawArchive;assert.equal(path.dirname(archive.path),path.join(root,"outputs/reports"));
const gzip=await readFile(archive.path);assert.equal(gzip.length,archive.bytes);assert.equal(sha(gzip),archive.sha256);assert.ok(gzip.length<=4*MiB);
const serialized=gunzipSync(gzip,{maxOutputLength:16*MiB});assert.equal(serialized.length,trace.serializedBytes);assert.equal(sha(serialized),trace.sha256);
const reparsed=summarizeMemoryInfraTrace(JSON.parse(serialized),session.dumps);
assert.deepEqual(reparsed,session.allocatorSummary);assert.deepEqual(reparsed,attribution.allocatorSummary);
const delayed=reparsed[0].processes.find(row=>row.pid===target.pid);assert.equal(delayed.traceName,"Renderer");
assert.equal(delayed.tracePrivateFootprintBytes,118423552);assert.equal(delayed.blinkHeapStatistics[0].residentBytes,64356432);
assert.equal(delayed.blinkHeapStatistics[0].allocatedObjectsBytes,11844872);assert.equal(delayed.blinkHeapStatistics[0].pooledBytes,44302336);
assert.equal(delayed.blinkTypeStatistics[0].allocatedObjectsBytes,3794944);
assert.match(delayed.blinkTypeStatistics[0].type,/GridSizingTrackCollection/);
const native=p.sampledNativeIdentities,helpers=[43328,43804,p.ownedPids.server,p.ownedPids.observer];
const ids=[...new Set([...native.map(row=>row.pid),...helpers])];
const filter=ids.map(pid=>{assert.ok(Number.isSafeInteger(pid)&&pid>0);return`ProcessId = ${pid}`;}).join(" or ");
const{stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",
  `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{pid=$_.ProcessId;parentPid=$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) -Compress`],
{windowsHide:true,timeout:15000,maxBuffer:131072});
const current=JSON.parse(stdout);
assert.deepEqual(current.filter(row=>native.some(old=>old.pid===row.pid&&old.parentPid===row.parentPid&&microsecondBirth(old.createdAt)===microsecondBirth(row.createdAt))),[]);
assert.ok(!current.some(row=>helpers.includes(row.pid)));
for(const key of["mediaProfileRuntimeRemoved","generatedDistRestored","protectedFixtureUnchanged","observerStopped","sampledChromeRootStopped"])assert.equal(p.cleanup[key],true);
for(const directory of[p.runtimeDirectory,p.generatedRuntimeDirectory,path.join(root,"work/mpeg2-late-allocator-original-wrapper-KbNYUe")]){
  assert.ok(directory.startsWith(path.join(root,"work")+path.sep));await assert.rejects(access(directory),{code:"ENOENT"});
}
const restoredAssets={};
for(const file of["within-remux.mjs","within-remux.wasm","within-mpeg4.mjs","within-mpeg4.wasm","within-direct.mjs","within-direct.wasm"]){
  const hash=sha(await readFile(path.join(root,"public/engines/remux",file)));assert.equal(sha(await readFile(path.join(root,"dist/client/engines/remux",file))),hash);restoredAssets[file]=hash;
}
for(const file of["_private_split_decoder.mjs","_private_split_decoder.wasm","_private_split_encoder.mjs","_private_split_encoder.wasm","mpeg2-split-session.mjs","mpeg2-split-frame-bridge.mjs","mpeg2-split-frame-layout.mjs","mpeg2-split-frame-properties.mjs","mpeg2-split-packet-bridge.mjs"])
  await assert.rejects(access(path.join(root,"dist/client/engines/remux",file)),{code:"ENOENT"});
assert.equal((await stat(path.join(root,"test.mkv"))).size,2958573265);
const protectedHash=createHash("sha256");for await(const chunk of createReadStream(path.join(root,"test.mkv"),{highWaterMark:MiB}))protectedHash.update(chunk);
assert.equal(protectedHash.digest("hex"),"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.deepEqual(p.forbiddenRequests,[]);
const proof={recordedAt:new Date().toISOString(),status:"verified-terminal-whole-tree-budget-failure-with-delayed-renderer-types-not-cause",
  input:{path:input,bytes:bytes.length,sha256:sha(bytes)},rawReport:p.rawReport,rawReportVerified:true,
  executedSourcesVerified:Object.keys(p.sourcePins).length,generatedSourcesVerified:true,blankBaseline:p.blankBaseline,loadedIdle:p.loadedIdle,
  nativePeak:p.nativePeak,nativePeakIncrementalMiB:263.64453125,nativePhaseCoverage:p.nativePhaseCoverage,
  actualFailure:p.failure,metrics,frames:1515,completedFullOutputs:0,actualDecoderAbortRecords:0,
  individualOriginalFailureAllocationBytes:null,originalFailureFreeHeaders:null,liveHeapBytes:null,allocationCauseProven:false,
  adjacentNativeDelta:failure.delta,globalTraceReconstructionAndReparseVerified:true,globalDumpSucceeded:true,
  rawTraceArchive:{...archive,path:path.relative(root,archive.path).replaceAll("\\","/")},serializedTrace:{bytes:serialized.length,sha256:trace.sha256,events:trace.events},
  actualWorkerClosedBeforeDump:true,delayedDumpGuid:dump.memoryDump.dumpGuid,delayedTarget:{pid:target.pid,traceName:delayed.traceName,privateBytes:delayed.tracePrivateFootprintBytes,
    heaps:delayed.blinkHeapStatistics,largestSixTypes:delayed.blinkTypeStatistics.slice(0,6),selection:delayed.blinkTypeSelection},
  cleanup:{...p.cleanup,protectedFullPostHashVerified:true,allSampledNativeBirthsAbsent:true,nativeBirths:native.length,helperPidsAbsent:true,
    helperBirthsAvailableForAll:false,allThreeOwnedRuntimeDirectoriesAbsent:true,restoredAssets,ninePrivateAdditionsAbsent:true,noProcessesKilledByVerifier:true},
  publicAcceptance:false,originalFullSourceAcceptance:false,conversionSpeedAcceptance:false,
  next:"Investigate the observed renderer delta and delayed Blink layout/pool records with a changed bounded production UI candidate before another full-original attempt. Delayed values are not peak-time liveness or allocation callsite proof; late decoder request/free headers remain unobserved.",
  sourcePins:{"scripts/analyze-mpeg2-late-allocator-terminal.mjs":sha(await readFile(path.join(root,"scripts/analyze-mpeg2-late-allocator-terminal.mjs")))}};
const json=JSON.stringify(proof,null,2)+"\n";assert.ok(Buffer.byteLength(json)<32768);
await writeFile(path.join(root,"evidence/mpeg2-late-allocator-terminal-analysis-2026-10-08.json"),json,{flag:"wx"});
console.log(JSON.stringify({status:proof.status,peakMiB:proof.nativePeakIncrementalMiB,globalDumpSucceeded:true,targetPid:target.pid,postProtectedHashVerified:true,nativeBirths:native.length}));

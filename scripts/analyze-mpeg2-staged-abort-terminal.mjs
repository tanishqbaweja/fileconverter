// Read-only verification of ONE terminal full-original attempt. No retry.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
const root=path.resolve(import.meta.dirname,".."), MiB=1048576;
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const input="evidence/mpeg2-staged-abort-original-2026-10-08.json";
assert.ok((await stat(path.join(root,input))).size<=4*MiB);
const bytes=await readFile(path.join(root,input)), proof=JSON.parse(bytes);
assert.equal(proof.rawStatus,"failed"); assert.equal(proof.completeOriginalConversions,0);
assert.match(proof.failure.message,/Complete Chromium increase 264\.2421875MiB exceeds 250MiB/);
assert.equal(sha(proof.generatedSource),proof.generatedSourceSha256);
for(const[file,hash]of Object.entries(proof.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),hash,file);
const rawPath=path.resolve(root,proof.rawReport.path);
assert.ok(rawPath.startsWith(path.join(root,"outputs/reports")+path.sep));
assert.ok((await stat(rawPath)).size<=32*MiB);
const raw=await readFile(rawPath); assert.equal(raw.length,proof.rawReport.bytes); assert.equal(sha(raw),proof.rawReport.sha256);
const original=JSON.parse(raw), peak=proof.nativePeak, failure=proof.nativeFailureCapture.firstFailure;
assert.equal(peak.processes.reduce((sum,p)=>sum+p.privateBytes,0),peak.privateBytes);
assert.equal((peak.privateBytes-proof.blankBaseline.privateBytes)/MiB,264.2421875);
assert.equal(proof.nativePeakIncrementalMiB,264.2421875); assert.equal(proof.blankBaseline.stable,true);
assert.equal(proof.blankBaseline.privateBytes,239501312); assert.equal(peak.privateBytes,516579328);
assert.equal(failure.after.sequence,peak.sequence); assert.equal(peak.sequence,3458);
assert.deepEqual(proof.nativeFailureCapture.denominator,proof.blankBaseline);
assert.equal(proof.nativeFailureCapture.callback.status,"completed");
assert.equal(proof.nativeFailureCapture.callback.result.causalAllocationClaim,null);
assert.equal(proof.nativeFailureCapture.unavailableSamples,1); // retained, never zeroed
assert.deepEqual(proof.abortDiagnostic.records,[]); assert.deepEqual(proof.actualStackSymbols,[]);
assert.equal(proof.abortDiagnostic.stagedAdapters.length,3); assert.equal(proof.abortDiagnostic.captureError,null);
assert.equal(proof.runs.length,1); assert.equal(proof.runs[0].independentValidation,null);
assert.equal(proof.runs[0].recovery,null); assert.equal(proof.requestedRuns,3);
assert.deepEqual(proof.forbiddenRequests,[]); assert.equal(proof.nativeObserverError,null);
const final=proof.splitFinalSamples[0], metrics=proof.runs[0].state.metrics;
assert.equal(final.frames,1530); assert.equal(final.packets,1530); assert.equal(final.completedPackets,1530);
assert.equal(final.decoderMemoryBytes,32*MiB); assert.equal(final.encoderMemoryBytes,16*MiB);
assert.equal(final.closed,true); assert.equal(final.failed,false);
for(const key of["activePackets","queuedPackets","queuedFrames","additionalPixelBufferBytes","additionalJsPacketBufferBytes"])assert.equal(final[key],0);
for(const key of["maxReadChunkBytes","maxWriteChunkBytes","peakQueuedBytes"])assert.equal(metrics[key],65536);
assert.equal(metrics.peakPendingOperations,1); assert.equal(metrics.wasmMemoryBytes,48*MiB);
assert.equal(metrics.inputBytes,33187393); assert.equal(metrics.outputBytes,21727310);
// Identity/type joins use parent + observed microsecond birth, never PID alone.
const deltas=failure.after.processes.map(after=>{
  const before=failure.before.processes.find(p=>p.pid===after.pid&&p.parentPid===after.parentPid&&p.creationFileTime===after.creationFileTime);
  assert.ok(before);
  const joins=original.samples.flatMap(s=>s.processes??[]).filter(p=>p.pid===after.pid&&p.parentPid===after.parentPid&&
    microsecondBirth(p.createdAt)===microsecondBirth(after.createdAt));
  const types=[...new Set(joins.map(p=>p.type).filter(t=>t&&t!=="unknown"))]; assert.ok(types.length<=1);
  return{pid:after.pid,parentPid:after.parentPid,createdAt:after.createdAt,creationFileTime:after.creationFileTime,
    type:types[0]??null,observedCimTypeJoin:joins.length>0,deltaPrivateBytes:after.privateBytes-before.privateBytes};
});
assert.equal(deltas.reduce((sum,p)=>sum+p.deltaPrivateBytes,0),49987584);
const growing=deltas.filter(p=>p.deltaPrivateBytes!==0); assert.equal(growing.length,1);
assert.equal(growing[0].pid,47084); assert.equal(growing[0].type,"renderer");
const helpers=[
  {pid:46236,parentPid:46472,createdAt:"2026-10-07T19:17:29.0265710Z"},
  {pid:38312,parentPid:46236,createdAt:"2026-10-07T19:17:29.0696490Z"},
  {pid:43968,parentPid:38312,createdAt:"2026-10-07T19:17:31.6534370Z"},
  {pid:18576,parentPid:38312,createdAt:"2026-10-07T19:17:32.9329090Z"},
];
const identities=[...proof.sampledNativeIdentities,...helpers], ids=[...new Set(identities.map(p=>p.pid))];
assert.ok(ids.every(pid=>Number.isSafeInteger(pid)&&pid>0)); assert.ok(identities.every(p=>microsecondBirth(p.createdAt)));
const filter=ids.map(pid=>`ProcessId = ${pid}`).join(" or ");
const{stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",
  `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{pid=$_.ProcessId;parentPid=$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) -Compress`],
{windowsHide:true,timeout:15000,maxBuffer:131072});
const current=JSON.parse(stdout);
assert.deepEqual(current.filter(p=>identities.some(old=>old.pid===p.pid&&old.parentPid===p.parentPid&&
  microsecondBirth(old.createdAt)===microsecondBirth(p.createdAt))),[]);
for(const key of["mediaProfileRuntimeRemoved","generatedDistRestored","protectedFixtureUnchanged","observerStopped","sampledChromeRootStopped"])assert.equal(proof.cleanup[key],true);
assert.equal(proof.cleanup.conversionQuiescence.terminalState,"cancelled");
for(const directory of[proof.runtimeDirectory,proof.generatedRuntimeDirectory]){
  assert.ok(directory.startsWith(path.join(root,"work")+path.sep)); await assert.rejects(access(directory),{code:"ENOENT"});
}
const restoredAssets={};
for(const file of["within-remux.mjs","within-remux.wasm","within-mpeg4.mjs","within-mpeg4.wasm","within-direct.mjs","within-direct.wasm"]){
  const hash=sha(await readFile(path.join(root,"public/engines/remux",file)));
  assert.equal(sha(await readFile(path.join(root,"dist/client/engines/remux",file))),hash); restoredAssets[file]=hash;
}
for(const file of["_private_split_decoder.mjs","_private_split_decoder.wasm","_private_split_encoder.mjs","_private_split_encoder.wasm",
  "mpeg2-split-session.mjs","mpeg2-split-frame-bridge.mjs","mpeg2-split-frame-layout.mjs","mpeg2-split-frame-properties.mjs","mpeg2-split-packet-bridge.mjs"])
  await assert.rejects(access(path.join(root,"dist/client/engines/remux",file)),{code:"ENOENT"});
assert.equal((await stat(path.join(root,"test.mkv"))).size,2958573265);
const sourceHash=createHash("sha256"); for await(const chunk of createReadStream(path.join(root,"test.mkv"),{highWaterMark:MiB}))sourceHash.update(chunk);
assert.equal(sourceHash.digest("hex"),"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const analysis={recordedAt:new Date().toISOString(),status:"verified-terminal-full-tree-memory-failure-not-heap-abort-not-acceptance",
  input:{path:input,bytes:bytes.length,sha256:sha(bytes)},rawReportVerified:true,allExecutedSourcesVerified:true,
  failure:proof.failure,blankBaseline:proof.blankBaseline,nativePeak:peak,nativePeakIncrementalMiB:264.2421875,
  nativePhaseCoverage:proof.nativePhaseCoverage,firstFailure:failure,callback:proof.nativeFailureCapture.callback,
  failureCollectorUnavailableSamples:1,unavailableIsNotZero:true,
  adjacentBurst:{beforeSequence:3457,afterSequence:3458,elapsedMs:Date.parse(failure.after.timestamp)-Date.parse(failure.before.timestamp),
    treeDeltaPrivateBytes:49987584,processDeltas:deltas,allocationObjectOrCallsite:null,
    caveat:"The renderer owns the adjacent 49,987,584-byte private-memory increase. CIM type join retains parent/birth. This does not identify its allocator, object, callsite, or prove the cause of an older failure. No heap dump was taken."},
  actualAbortStacksCaptured:0,heapOomOccurred:false,partialFreshFrames:1530,partialMetrics:metrics,splitFinalSamples:proof.splitFinalSamples,
  cleanup:{allSampledNativeBirthsAbsent:true,nativeIdentities:proof.sampledNativeIdentities.length,helperBirthsAbsent:true,
    checkedPids:ids.length,observedCurrentProcesses:current,reusedPidsAreNotOldProcesses:true,bothRuntimeDirectoriesAbsent:true,
    restoredAssets,ninePrivateAssetsAbsent:true,protectedFullPostHashVerified:true,noProcessesKilled:true},
  sourcePins:{"scripts/analyze-mpeg2-staged-abort-terminal.mjs":sha(await readFile(path.join(root,"scripts/analyze-mpeg2-staged-abort-terminal.mjs")))},
  browserConversionsStarted:1,completeOriginalConversions:0,fullIndependentValidationPerformed:false,
  publicAcceptance:false,originalFullSourceAcceptance:false,conversionSpeedAcceptance:false,noNewConversion:true,
  next:"Do not rerun unchanged. Capture the actual renderer allocator/type/callsite behind the budget burst with a bounded, prerequisite-tested diagnostic. The failure-only Wasm hook cannot capture a heap abort before the full-tree gate cancels. Preserve all gates and the historical decoder OOM separately."};
const json=JSON.stringify(analysis,null,2)+"\n"; assert.ok(Buffer.byteLength(json)<65536);
await writeFile(path.join(root,"evidence/mpeg2-staged-abort-terminal-analysis-2026-10-08.json"),json,{flag:"wx"});
console.log(JSON.stringify({status:analysis.status,peakMiB:analysis.nativePeakIncrementalMiB,burst:analysis.adjacentBurst,cleanup:analysis.cleanup}));

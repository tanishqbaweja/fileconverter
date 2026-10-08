// Post-terminal evidence reconstruction, not another conversion or profiler.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { baselineBinding, sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeLiveMemoryProbe } from "./lib/live-memory-probe-recipe.mjs";
import { summarizeLiveMemory } from "./lib/live-memory-infra.mjs";
import { verifyJsProbeIdentityAbsence } from "./lib/js-probe-identity-cleanup.mjs";
const root=path.resolve(import.meta.dirname,".."),MiB=1048576;
assert.equal(process.argv.length,3);assert.match(process.argv[2],/^evidence\/[0-9TZ-]+-live-memory\.json$/);
async function bounded(file,max=2*MiB){
  const full=path.resolve(root,file);assert.ok(full.startsWith(root+path.sep));
  const identity=await lstat(full);assert.ok(identity.isFile()&&!identity.isSymbolicLink()&&identity.size<=max);assert.equal(await realpath(full),full);return readFile(full);
}
const receiptBytes=await bounded(process.argv[2]),e=JSON.parse(receiptBytes);
assert.equal(e.status,"live-memory-diagnostic-returned-independent-analysis-pending");assert.equal(e.failure,null);
assert.equal(e.productionRestored,true);assert.equal(e.runtimeRemoved,true);assert.deepEqual(e.sourcePins,e.postSourcePins);
for(const[file,hash]of Object.entries(e.sourcePins))assert.equal(sha(await bounded(file)),hash,file);
const run=e.execution;assert.equal(run.actualExitCode,1);assert.equal(run.rawRemovedAfterLosslessArchive,true);
await assert.rejects(access(path.join(root,run.rawReport.path)),{code:"ENOENT"});
const compressed=await bounded(run.compressedReport.path,32*MiB);assert.equal(sha(compressed),run.compressedReport.sha256);
const rawBytes=gunzipSync(compressed,{maxOutputLength:32*MiB});assert.equal(rawBytes.length,run.rawReport.bytes);assert.equal(sha(rawBytes),run.rawReport.sha256);
const raw=JSON.parse(rawBytes);assert.equal(raw.status,"failed");assert.equal(raw.runs.length,1);assert.equal(raw.runs[0].independentValidation,null);
assert.equal(raw.source.bytes,2958573265);assert.equal(raw.source.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.equal(raw.source.probe.streams[0].width,1920);assert.equal(raw.source.probe.streams[0].height,804);
for(const[file,hash]of Object.entries(raw.sourceHashes))assert.equal(e.sourcePins[file],hash,file);
assert.equal(raw.limitMiB,250);assert.equal(raw.requestedRuns,3);assert.equal(raw.startupSettlement.minimumMs,300000);assert.ok(raw.startupSettlement.actualMs>=300000);
assert.ok(raw.blankBaseline.privateBytes<=raw.startupSettlement.earlyWindow.privateBytes);
const sourceGzip=await bounded(run.sourceArchive.path,MiB);assert.equal(sha(sourceGzip),run.sourceArchive.sha256);
const generated=gunzipSync(sourceGzip,{maxOutputLength:MiB}).toString();assert.equal(sha(generated),run.sourceArchive.restoredSha256);assert.equal(sha(generated),e.generatedSha256);
const original=JSON.parse(gunzipSync(await bounded("outputs/reports/2026-10-08T22-04-15-944Z-ui-progress-baseline-executed-sources.json.gz",MiB))).generated;
const stamp=path.basename(process.argv[2]).replace(/-live-memory\.json$/,"");assert.equal(makeLiveMemoryProbe(original,root,stamp),generated);
assert.ok(generated.includes('assert.ok(run.incrementalPrivateMiB <= 250'));assert.ok(generated.includes('assert.equal(run.state.jobState, "complete"'));
assert.match(raw.failure.message,/250MiB|cancelled[\s\S]*complete|Conversion deadline/);
const records=raw.liveMemoryRecords;assert.ok(records.length>=2&&records.length<=3);
const liveFacts=[];
for(const row of records){
  assert.equal(row.error,null);assert.equal(row.result.status,"captured-live-light-memory-diagnostic");
  assert.equal(row.before.jobState,row.phase==="before-conversion"?"idle":"running");
  const archive=row.result.archive,gzip=await bounded(archive.path,8*MiB);assert.equal(sha(gzip),archive.sha256);
  const bytes=gunzipSync(gzip,{maxOutputLength:8*MiB});assert.equal(bytes.length,archive.restoredBytes);assert.equal(sha(bytes),archive.restoredSha256);
  const trace=JSON.parse(bytes);assert.deepEqual(summarizeLiveMemory(trace,[row.result.row]),row.result.summary);
  assert.equal(row.result.acceptanceMetric,false);assert.equal(row.result.allocationStackAttribution,false);
  liveFacts.push({phase:row.phase,beforeJobState:row.before.jobState,afterJobState:row.after.jobState,
    beforeOutputBytes:row.before.metrics?.outputBytes??null,afterOutputBytes:row.after.metrics?.outputBytes??null,
    beforeElapsedMs:row.before.metrics?.elapsedMs??null,afterElapsedMs:row.after.metrics?.elapsedMs??null,
    dumpRequestedAt:row.result.row.timestamp,dumpFinishedAt:row.result.row.finishedAt,archive,
    summary:row.result.summary,summedAllocatorTotal:null,acceptanceMetric:false});
}
assert.ok(liveFacts.some(row=>row.beforeJobState==="running"&&row.afterJobState==="running"));
const m=raw.runs[0].state.metrics;assert.equal(m.wasmMemoryBytes,48*MiB);assert.equal(m.peakWasmMemoryBytes,48*MiB);
assert.ok(m.maxReadChunkBytes<=65536&&m.maxWriteChunkBytes<=65536&&m.peakQueuedBytes<=65536&&m.peakPendingOperations<=1);
assert.deepEqual(raw.forbiddenRequests,[]);assert.equal(raw.nativeMemory.error,null);
const binding=raw.conversionJsReport.servedScripts.find(row=>row.asset===baselineBinding.url);assert.equal(binding.sha256,baselineBinding.sha256);assert.equal(binding.bytes,baselineBinding.bytes);assert.equal(binding.actualServedBytesCaptured,true);
const restored=await bounded("dist/client"+baselineBinding.url,MiB);assert.equal(sha(restored),baselineBinding.sha256);
for(const key of ["mediaProfileRuntimeRemoved","generatedDistRestored","protectedFixtureUnchanged","observerStopped","sampledChromeRootStopped"])assert.equal(raw.cleanup[key],true,key);
assert.ok(!raw.cleanup.errors?.length);await assert.rejects(access(raw.runtimeDirectory),{code:"ENOENT"});
assert.equal(raw.cleanup.conversionQuiescence.terminalState,"cancelled");
const phases=raw.nativeMemory.phases.filter(row=>/^pre-conversion-|^conversion-/.test(row.phase));
const peak=phases.map(row=>row.peak).filter(Boolean).sort((a,b)=>b[3]-a[3])[0];assert.ok(peak);assert.equal(peak[7].reduce((sum,p)=>sum+p[1],0),peak[3]);
const peakPrivateBytes=Math.max(peak[3],raw.runs[0].cimPeakPrivateBytes??-Infinity),blankPrivateBytes=raw.blankBaseline.privateBytes;
const identities=raw.nativeMemory.identities,ids=[...new Set(identities.map(row=>row.pid))];assert.ok(ids.length>0&&ids.length<=128);
const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",
  `$ErrorActionPreference='Stop';$liveProbeIds=@(${ids.join(",")});ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process|Where-Object {$liveProbeIds -contains [int]$_.ProcessId}|ForEach-Object {[pscustomobject]@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=([datetime]$_.CreationDate).ToUniversalTime().ToString('o')}}) -Compress`],
{windowsHide:true,timeout:15000,maxBuffer:262144});
const cleanupIdentities=verifyJsProbeIdentityAbsence(identities,JSON.parse(stdout));
assert.equal((await stat(path.join(root,"test.mkv"))).size,2958573265);
const hash=createHash("sha256");for await(const chunk of createReadStream(path.join(root,"test.mkv"),{highWaterMark:MiB}))hash.update(chunk);
assert.equal(hash.digest("hex"),raw.source.sha256);
const proof={recordedAt:new Date().toISOString(),status:"verified-live-memory-category-diagnostic-not-acceptance",
  receipt:{path:process.argv[2],bytes:receiptBytes.length,sha256:sha(receiptBytes)},
  verifier:{path:"scripts/analyze-live-memory.mjs",sha256:sha(await bounded("scripts/analyze-live-memory.mjs"))},
  inheritedRawScopeCaveat:"Old scope text describes a post-cancel detailed dump; actual hash-pinned derivative and running-before/after records prove these NEW light live captures. No inherited peak-time/stack/causal claim is accepted.",
  liveFacts,nativeFacts:{blankPrivateBytes,peakPrivateBytes,observedIncrementalPrivateMiB:(peakPrivateBytes-blankPrivateBytes)/MiB,
    includesLateConversionPhasePeaks:true,phaseCoverage:phases.map(row=>({phase:row.phase,validSamples:row.validSamples,unavailableSamples:row.unavailableSamples})),primaryMemoryAcceptance:false},
  firstNativeFailure:raw.nativeFailureCapture.firstFailure,cleanupIdentities,protectedFullPostHashVerified:true,
  observedFinalOutputBytes:m.outputBytes,terminalPendingMetrics:null,completeOriginalConversions:0,nativeAllocationCauseProven:false,
  publicAcceptance:false,originalFullSourceAcceptance:false,conversionSpeedAcceptance:false,completeChromiumMemoryAcceptance:false};
const proofPath=process.argv[2].replace(/\.json$/,"-analysis.json"),bytes=JSON.stringify(proof,null,2)+"\n";assert.ok(Buffer.byteLength(bytes)<2*MiB);
await writeFile(path.join(root,proofPath),bytes,{flag:"wx"});console.log(JSON.stringify({proofPath,status:proof.status,nativeFacts:proof.nativeFacts,phases:liveFacts.map(row=>({phase:row.phase,before:row.beforeJobState,after:row.afterJobState,output:row.afterOutputBytes}))}));

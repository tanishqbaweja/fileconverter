// Independent post-terminal reconstruction; does not rerun or change the conversion.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access,lstat,readFile,realpath,stat,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { baselineBinding,sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeSplitRenderProgressDriver,makeSplitRenderProgressTraceHelper } from "./lib/split-render-progress-recipe.mjs";
import { recordOutputWorkCheckpoint,compareOutputWorkWindows } from "./lib/output-work-checkpoints.mjs";
import { splitRenderNativeFacts,splitRenderFirstFailureFacts } from "./lib/split-render-progress-evidence.mjs";
import { verifyJsProbeIdentityAbsence } from "./lib/js-probe-identity-cleanup.mjs";
const root=path.resolve(import.meta.dirname,".."),MiB=1048576,receiptPath=process.argv[2];assert.equal(process.argv.length,3);
assert.match(receiptPath,/^evidence\/\d{4}-\d{2}-\d{2}T[\d-]+Z-split-render-progress\.json$/);
const bounded=async(file,maximum=2*MiB)=>{
  const full=path.resolve(root,file);assert.ok(full.startsWith(root+path.sep));const identity=await lstat(full);
  assert.ok(identity.isFile()&&!identity.isSymbolicLink()&&identity.size<=maximum);assert.equal(await realpath(full),full);return readFile(full);
};
const boundedAssetHash=async file=>{
  const full=path.resolve(root,file);assert.ok(full.startsWith(root+path.sep));const identity=await lstat(full);
  assert.ok(identity.isFile()&&!identity.isSymbolicLink()&&identity.size<=128*MiB);assert.equal(await realpath(full),full);
  const digest=createHash("sha256");for await(const chunk of createReadStream(full,{highWaterMark:MiB}))digest.update(chunk);
  return digest.digest("hex");
};
const receiptBytes=await bounded(receiptPath),receipt=JSON.parse(receiptBytes);
assert.equal(receipt.status,"paired-diagnostic-returned-independent-analysis-pending");assert.equal(receipt.failure,null);
assert.equal(receipt.executions.length,2);assert.equal(receipt.productionRestored,true);assert.deepEqual(receipt.sourcePins,receipt.postSourcePins);
for(const [file,hash] of Object.entries(receipt.sourcePins))assert.equal(sha(await bounded(file)),hash,file);
const oldCompressed=await bounded("outputs/reports/2026-10-08T22-04-15-944Z-ui-progress-baseline-executed-sources.json.gz");
assert.equal(sha(oldCompressed),"5111278bc1b5bbe47585679fda04a351e6885aa6974def53663800a81b8bc695");
const oldExecuted=JSON.parse(gunzipSync(oldCompressed,{maxOutputLength:MiB}));
const reports=[],nativeFacts=[],firstFailureFacts=[],identities=[],lastReportedMetrics=[];
for(const execution of receipt.executions){
  assert.equal(execution.actualExitCode,1);assert.equal(execution.status,"failed");assert.equal(execution.rawRemovedAfterLosslessArchive,true);
  await assert.rejects(access(path.join(root,execution.rawReport.path)),{code:"ENOENT"});
  const compressed=await bounded(execution.compressedReport.path,32*MiB);assert.equal(compressed.length,execution.compressedReport.bytes);assert.equal(sha(compressed),execution.compressedReport.sha256);
  const bytes=gunzipSync(compressed,{maxOutputLength:32*MiB});assert.equal(bytes.length,execution.rawReport.bytes);assert.equal(sha(bytes),execution.rawReport.sha256);
  const raw=JSON.parse(bytes);reports.push(raw);assert.equal(raw.status,"failed");assert.equal(raw.runs.length,1);assert.equal(raw.runs[0].independentValidation,null);
  assert.equal(raw.requestedRuns,3);assert.equal(raw.source.bytes,2958573265);assert.equal(raw.source.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(raw.source.probe.streams[0].width,1920);assert.equal(raw.source.probe.streams[0].height,804);
  assert.equal(raw.conversionJsReport,null);assert.equal(raw.progressProbe.jsAllocationSamplingEnabled,false);
  assert.equal(raw.progressProbe.maximumConversionMs,300000);assert.equal(raw.progressProbe.checkpointOutputBytes,67108864);
  assert.deepEqual(raw.progressProbe,execution.progressProbe);assert.deepEqual(raw.blankBaseline,execution.blankBaseline);
  const recreated={workCheckpoints:[],lastProgressObservation:null,unavailableProgressSamples:0};
  for(const row of raw.samples.filter(row=>row.phase==="conversion-1"))recordOutputWorkCheckpoint(recreated,{jobState:row.jobState,metrics:row.metrics});
  assert.deepEqual(recreated.workCheckpoints,raw.progressProbe.workCheckpoints);assert.deepEqual(recreated.lastProgressObservation,raw.progressProbe.lastProgressObservation);
  assert.equal(recreated.unavailableProgressSamples,raw.progressProbe.unavailableProgressSamples);
  const m=(raw.progressProbe.beforeCancellation??raw.runs[0].state)?.metrics;
  assert.ok(m);assert.equal(m.wasmMemoryBytes,50331648);assert.equal(m.peakWasmMemoryBytes,50331648);
  assert.ok(m.maxReadChunkBytes<=65536&&m.maxWriteChunkBytes<=65536&&m.peakQueuedBytes<=65536);assert.equal(m.peakPendingOperations,1);
  lastReportedMetrics.push({mode:execution.mode,metrics:m,scope:"Observed snapshot, not an independently captured terminal queue/worker-ownership report"});
  nativeFacts.push(splitRenderNativeFacts(raw,execution.mode));firstFailureFacts.push({mode:execution.mode,...splitRenderFirstFailureFacts(raw)});
  identities.push(...raw.nativeMemory.identities);
  assert.deepEqual(raw.forbiddenRequests,[]);
  const sourceCompressed=await bounded(execution.sourceArchive.path,MiB);assert.equal(sha(sourceCompressed),execution.sourceArchive.sha256);
  const sourceBytes=gunzipSync(sourceCompressed,{maxOutputLength:MiB});assert.equal(sha(sourceBytes),execution.sourceArchive.restoredSha256);
  const source=JSON.parse(sourceBytes);assert.equal(sha(source.generated),execution.sourceArchive.driverSha256);assert.equal(sha(source.traceHelper),execution.sourceArchive.traceHelperSha256);
  const helperImport=source.generated.match(/^import \{ startBoundedRendererAttribution \} from (.*);$/m);assert.ok(helperImport);
  const binding=execution.progressProbe.expectedAsset;
  const reproduced=makeSplitRenderProgressDriver(oldExecuted.generated,root,JSON.parse(helperImport[1]),binding,execution.mode);
  for(const [key,value] of Object.entries(reproduced))assert.deepEqual(source[key],value,key);
  const helperPath=source.traceHelper.match(/^const rawArchivePath=(.*);$/m);assert.ok(helperPath);
  assert.equal(source.traceHelper,makeSplitRenderProgressTraceHelper(oldExecuted.traceHelper,JSON.parse(helperPath[1])));
  assert.deepEqual(raw.progressProbe.actualServedAsset,binding);
  assert.ok(source.generated.includes('"--headless=new"')&&!source.generated.includes("await createConversionJsAllocation"));
  for(const [file,hash] of Object.entries(raw.sourceHashes))assert.equal(sha(await bounded(file)),hash,file);
  for(const key of ["mediaProfileRuntimeRemoved","generatedDistRestored","protectedFixtureUnchanged","observerStopped","sampledChromeRootStopped"])assert.equal(raw.cleanup[key],true,key);
  assert.ok(!raw.cleanup.errors?.length);await assert.rejects(access(raw.runtimeDirectory),{code:"ENOENT"});
  assert.ok(["cancelled","error","complete"].includes(raw.cleanup.conversionQuiescence.terminalState));
}
for(const key of ["chromeLauncherSha256","chromeLibrarySha256","viewport","checkpointOutputBytes","maximumConversionMs"])
  assert.deepEqual(reports[0].progressProbe[key],reports[1].progressProbe[key],key);
assert.equal(reports[0].browserVersion,reports[1].browserVersion);
const workWindows=compareOutputWorkWindows(reports[0].progressProbe.workCheckpoints,reports[1].progressProbe.workCheckpoints);assert.deepEqual(workWindows,receipt.workWindows);
const ids=[...new Set(identities.map(row=>row.pid))];assert.ok(ids.length>0&&ids.length<=128);
const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",
  `$ErrorActionPreference='Stop'; $splitComparisonIds=@(${ids.join(",")}); ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$splitComparisonIds -contains [int]$_.ProcessId} | ForEach-Object {[pscustomobject]@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=([datetime]$_.CreationDate).ToUniversalTime().ToString('o')}}) -Compress`],
{windowsHide:true,timeout:15000,maxBuffer:262144});
const currentIdentities=JSON.parse(stdout);
// Native GetProcessTimes and CIM timestamps can differ below a millisecond.
// A plausibly matching PID/parent/birth is NOT declared absent just for that rounding.
assert.deepEqual(currentIdentities.filter(now=>identities.some(prior=>prior.pid===now.pid&&prior.parentPid===now.parentPid&&
  Math.abs(Date.parse(prior.createdAt)-Date.parse(now.createdAt))<=1)),[],"Possible original birth identity remains alive");
const cleanupIdentities={...verifyJsProbeIdentityAbsence(identities,currentIdentities),conservativeBirthToleranceMs:1};
const originalFile=path.join(root,"test.mkv");assert.equal((await stat(originalFile)).size,2958573265);
const hash=createHash("sha256");for await(const chunk of createReadStream(originalFile,{highWaterMark:MiB}))hash.update(chunk);
assert.equal(hash.digest("hex"),"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const baseline=await bounded("dist/client"+baselineBinding.url);assert.equal(baseline.length,baselineBinding.bytes);assert.equal(sha(baseline),baselineBinding.sha256);
const previous=JSON.parse(await bounded("evidence/2026-10-08T13-49-53-644Z-stable-progress-ui-headless-golden-validation.json"));
for(const [file,expected] of Object.entries(previous.cleanup.restoredAssetHashes))assert.equal(await boundedAssetHash("dist/client/engines/remux/"+file),expected);
for(const file of ["_private_split_decoder.mjs","_private_split_decoder.wasm","_private_split_encoder.mjs","_private_split_encoder.wasm",
  "mpeg2-split-session.mjs","mpeg2-split-frame-bridge.mjs","mpeg2-split-frame-layout.mjs","mpeg2-split-frame-properties.mjs","mpeg2-split-packet-bridge.mjs"])
  await assert.rejects(access(path.join(root,"dist/client/engines/remux",file)),{code:"ENOENT"});
const verifierPins={};for(const file of ["scripts/analyze-split-render-progress.mjs","scripts/lib/split-render-progress-evidence.mjs"])
  verifierPins[file]=sha(await bounded(file));
const proof={recordedAt:new Date().toISOString(),status:"independently-verified-paired-partial-diagnostic-not-acceptance",
  receipt:{path:receiptPath,bytes:receiptBytes.length,sha256:sha(receiptBytes)},verifierPins,
  sourcePinCount:Object.keys(receipt.sourcePins).length,browserVersion:reports[0].browserVersion,matchedBrowserBinaryHashes:true,
  workWindows,nativeFacts,firstFailureFacts,lastReportedMetrics,cleanupIdentities,protectedFullPostHashVerified:true,normalProductionRestored:true,
  conversionsCompleted:0,completeOutputsIndependentlyValidated:0,nativeAllocationCauseProven:false,repeatabilityAccepted:false,
  conversionSpeedAcceptance:false,completeChromiumMemoryAcceptance:false,originalFullSourceAcceptance:false,publicAcceptance:false};
const output=receiptPath.replace(/\.json$/,"-analysis.json"),bytes=JSON.stringify(proof,null,2)+"\n";assert.ok(Buffer.byteLength(bytes)<MiB);
await writeFile(path.join(root,output),bytes,{flag:"wx"});console.log(JSON.stringify({output,status:proof.status,workWindows,nativeFacts,cleanupIdentities}));

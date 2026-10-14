// Actual failure only. Preserve captured API vs unknown malloc chunk; no replay.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access,lstat,readFile,stat,unlink,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync,gunzipSync } from "node:zlib";
import { sha,baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "./lib/installed-chrome-full-sources.mjs";
import { loadInstalledChromeFullQualification } from "./lib/installed-chrome-full-recipe.mjs";
import { validateCompositeAllocationFailureRecord } from "./lib/realloc-full-failure-record.mjs";
assert.equal(process.argv.length,2);
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),stamp="2026-10-14T16-27-26-406Z";
const terminalPath=`evidence/${stamp}-installed-chrome-realloc-original-full-terminal.json`,terminalBytes=await read(terminalPath),terminal=JSON.parse(terminalBytes);
assert.equal(terminal.failure,null);assert.deepEqual(terminal.cleanupErrors,[]);assert.equal(terminal.candidate.actualExitCode,1);assert.equal(terminal.candidate.completedConversions,0);
const record=terminal.candidate.compressedReport,zip=await read(record.path);assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
const bytes=gunzipSync(zip,{maxOutputLength:33554432});assert.equal(bytes.length,record.restoredBytes);assert.equal(sha(bytes),record.restoredSha256);const raw=JSON.parse(bytes),run=raw.runs[0];
assert.equal(raw.status,"failed");assert.equal(raw.runs.length,1);assert.equal(run.state.jobState,"error");assert.equal(run.independentValidation,null);assert.equal(raw.requestedRuns,3);assert.equal(raw.limitMiB,250);
assert.deepEqual(raw.forbiddenRequests,[]);assert.deepEqual(raw.inputReadFailureSamples,[]);assert.equal(raw.abortDiagnostic.captureError,null);assert.equal(raw.abortDiagnostic.records.length,1);
const abort=raw.abortDiagnostic.records[0];validateCompositeAllocationFailureRecord(abort);assert.equal(abort.qualifiedReallocCallPath,true);assert.equal(abort.qualifiedBufferReallocCallPath,true);
const attempt=abort.reallocAttempt,inventory=abort.allocatorFreeBlocks;assert.equal(attempt.sequence,73389);assert.equal(attempt.phase,"av-realloc-pending");assert.equal(attempt.outerBufferScope,true);
assert.equal(attempt.allocationApiRequestedBytes,273954);assert.equal(attempt.outerRequestedBytes,273954);
for(const field of ["oldBufferRefAddress","oldBufferDataAddress","oldBufferSize","oldBufferRefcount","reallocPointerAddress"])assert.equal(attempt[field],0);
assert.equal(attempt.wordsRead,16);assert.equal(abort.validatedScalarWords,16);assert.equal(abort.failedIndividualAllocationBytes,null);assert.equal(attempt.allocatorInternalChunkBytes,null);
assert.equal(inventory.complete,true);assert.equal(inventory.totalFreeChunkBytes,2071568);assert.equal(inventory.largestFreeChunkBytes,246016);assert.equal(inventory.freeChunks,74);assert.equal(inventory.headerWordsRead,383);
assert.equal(inventory.unclaimedMemoryAboveSegmentBytes,69632);assert.equal(inventory.topChunkBytes,608);assert.equal(abort.originalFailureCauseProven,false);
assert.ok(inventory.largestFreeChunkBytes<attempt.allocationApiRequestedBytes);assert.ok(inventory.totalFreeChunkBytes>attempt.allocationApiRequestedBytes);
assert.equal(raw.splitFinalSamples[0].frames,34348);assert.equal(raw.splitFinalSamples[0].completedPackets,34348);assert.equal(raw.splitFinalSamples[0].activePackets,0);
assert.equal(run.state.metrics.outputBytes,626767162);assert.equal(run.state.metrics.elapsedMs,1226154.705000013);assert.equal(run.state.metrics.peakWasmMemoryBytes,50331648);
assert.equal(run.state.metrics.pendingOperations,0);assert.equal(run.state.metrics.queuedBytes,0);
const suspension=raw.asyncifyStorageFinalSamples[0];assert.equal(suspension.allocations,1);assert.equal(suspension.frees,0);assert.equal(suspension.retainedBytes,262156);assert.equal(suspension.activeLeases,0);assert.equal(suspension.abortedReleaseDeferredUntilWorkerTermination,true);
assert.equal(raw.formula,"peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory");
assert.equal(raw.blankBaseline.privateBytes,246951936);assert.equal(run.peakPrivateBytes,488222720);
const incremental=(run.peakPrivateBytes-raw.blankBaseline.privateBytes)/1048576;assert.equal(incremental,230.09375);assert.equal(run.incrementalPrivateMiB,incremental);
const active=raw.nativeMemory.phases.find(row=>row.phase==="conversion-1");assert.equal(active.validSamples,11268);assert.equal(active.unavailableSamples,0);assert.equal(run.nativePeaks.validSamples,11278);
assert.equal(raw.nativeMemory.sequence,14388);assert.equal(raw.nativeMemory.error,null);assert.equal(raw.nativeMemory.receiptClockFence.samplesDropped,0);assert.equal(raw.nativeMemory.receiptClockFence.timestampsRewritten,0);assert.equal(raw.nativeMemory.receiptClockFence.monitorClosed,true);
const archive=await materializeLayeredFullSourceArchive(root,terminal.sourceArchive),qualified=await loadInstalledChromeFullQualification(root);
assert.equal(Object.keys(archive.sourcePreimages).length,508);assert.deepEqual(archive.sourcePins,terminal.sourcePins);assert.deepEqual(raw.sourceHashes,terminal.sourcePins);assert.deepEqual(terminal.sourcePins,terminal.postSourcePins);
assert.deepEqual(raw.manifest,qualified.report.manifest);assert.equal(raw.browserVersion,qualified.pin.version);assert.deepEqual(terminal.browserPinBefore,terminal.browserPinAfter);
assert.equal(raw.progressProbe.chromeLauncherSha256,qualified.pin.launcher.sha256);assert.equal(raw.progressProbe.chromeLibrarySha256,qualified.pin.library.sha256);
for(const field of ["mediaProfileRuntimeRemoved","generatedDistRestored","protectedFixtureUnchanged","observerStopped","sampledChromeRootStopped"])assert.equal(raw.cleanup[field],true);
for(const directory of [terminal.wrapper,terminal.candidateDirectory,raw.runtimeDirectory])await assert.rejects(access(directory),{code:"ENOENT"});
const supervisorPath="evidence/2026-10-14T16-27-22-112Z-installed-chrome-realloc-supervisor-full.json",supervisorBytes=await read(supervisorPath),supervisor=JSON.parse(supervisorBytes);
assert.equal(supervisor.status,"command-completed-not-conversion-acceptance");assert.equal(supervisor.childExit.code,0);assert.equal(supervisor.runtimeRemoved,true);await assert.rejects(access(supervisor.runtimeDirectory),{code:"ENOENT"});
const checkpointPath=raw.nativeMemory.durableCheckpoint.file;assert.equal(path.dirname(checkpointPath),path.join(root,"outputs/reports"));const checkpointBytes=await readFile(checkpointPath),checkpoint=JSON.parse(checkpointBytes);
assert.ok(checkpointBytes.length<=2097152);assert.equal(checkpoint.status,"observer-closed-not-conversion-acceptance");assert.equal(checkpoint.coverageThroughSequence,14388);assert.deepEqual(checkpoint.baseline,raw.blankBaseline);
const phases=raw.nativeMemory.phases.map(row=>{const saved=checkpoint.native.phases.find(value=>value.phase===row.phase),{unavailableExamples,...persisted}=row;assert.deepEqual(saved,persisted);
  return {phase:row.phase,validSamples:row.validSamples,unavailableSamples:row.unavailableSamples,allPersistedFieldsEqual:true,rawUnavailableExamples:unavailableExamples,unavailableExamplesStoredInCheckpoint:false};});
const identities=[...raw.nativeMemory.identities,...raw.ownedLaunches.map(row=>row.identity),terminal.driverIdentity,supervisor.supervisorIdentity,supervisor.childIdentity,checkpoint.identities.monitor];
const unique=[...new Map(identities.map(row=>[`${row.pid}:${Date.parse(row.createdAt)}`,row])).values()];
const command="$ErrorActionPreference='Stop'; $terminalOwnedPids="+[...new Set(unique.map(row=>row.pid))].join(",")+"; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$terminalOwnedPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(command,"utf16le").toString("base64")],{cwd:root,windowsHide:true,timeout:15000,maxBuffer:131072});
const current=JSON.parse(stdout),birthChecks=unique.map(identity=>{const now=current.find(row=>row.pid===identity.pid)??null;assert.ok(now===null||Math.abs(Date.parse(now.createdAt)-Date.parse(identity.createdAt))>=1);return {identity:{pid:identity.pid,parentPid:identity.parentPid,createdAt:identity.createdAt},current:now,ownedBirthAbsent:true};});
assert.equal(sha(await read("dist/client"+baselineBinding.url)),baselineBinding.sha256);assert.equal((await stat(path.join(root,"test.mkv"))).size,2958573265);
const originalHash=createHash("sha256");for await(const chunk of createReadStream(path.join(root,"test.mkv"),{highWaterMark:1048576}))originalHash.update(chunk);assert.equal(originalHash.digest("hex"),terminal.protectedAfter.sha256);assert.deepEqual(terminal.protectedBefore,terminal.protectedAfter);
const checkpointArchive=`outputs/reports/${stamp}-installed-chrome-realloc-final-native-checkpoint.json.gz`,compressed=gzipSync(checkpointBytes,{level:9});assert.deepEqual(gunzipSync(compressed),checkpointBytes);
await writeFile(path.join(root,checkpointArchive),compressed,{flag:"wx"});assert.equal(sha(await read(checkpointArchive)),sha(compressed));const info=await lstat(checkpointPath,{bigint:true});assert.ok(info.isFile()&&!info.isSymbolicLink());
assert.equal(sha(await readFile(checkpointPath)),sha(checkpointBytes));await unlink(checkpointPath);await assert.rejects(access(checkpointPath),{code:"ENOENT"});
const own="scripts/analyze-installed-chrome-realloc-full-terminal.mjs",ownBytes=await read(own),output=`evidence/${stamp}-installed-chrome-realloc-full-terminal-analysis.json`;
const proof={recordedAt:new Date().toISOString(),status:"actual-full-original-failed-current273954B-null-realloc-and-bounded-free-header-inventory-not-acceptance",
  terminal:{path:terminalPath,sha256:sha(terminalBytes)},supervisor:{path:supervisorPath,sha256:sha(supervisorBytes)},rawArchive:record,sourceArchive:terminal.sourceArchive,
  sourceCount:508,allExecutedCurrentPrePostPreimagesVerified:true,sourceCapsChanged:false,requestedRuns:3,completedValidatedConversions:0,independentFullFidelityValidation:null,
  elapsedMs:run.state.metrics.elapsedMs,frames:34348,partialOutputBytesDeleted:626767162,lastBridge:raw.splitFinalSamples[0],suspensionLifecycle:suspension,
  nativeFailure:{abortRecord:abort,allocationApiRequestedBytes:273954,requestedHeapExtentBytes:33759232,failedIndividualMallocChunkBytes:null,
    freshNullBufferRequestObserved:true,totalFreeChunkBytes:2071568,largestFreeChunkBytes:246016,freeChunks:74,requestExceedsEveryInventoriedFreeChunk:true,
    aggregateFreeBytesExceedApiRequest:true,underlyingLifetimeOrFragmentationOriginProven:false,
    inference:"At this fatal point the captured NULL av_realloc API request exceeds every inventoried contiguous free chunk despite >2MiB total free. This supports immediate contiguous-space shortage; does not identify the lifetime/policy that created fragmentation or infer exact internal malloc chunk size."},
  failedWindowMemory:{formula:raw.formula,baselinePrivateBytes:raw.blankBaseline.privateBytes,peakPrivateBytes:run.peakPrivateBytes,incrementalPrivateMiB:incremental,
    activePhaseSamples:11268,runPeakSnapshotSamples:11278,snapshotCutoffsKeptDistinct:true,unavailableActiveSamples:0,nativeSequence:14388,acceptance:false},
  durableCheckpoint:{path:checkpointArchive,bytes:compressed.length,sha256:sha(compressed),restoredBytes:checkpointBytes.length,restoredSha256:sha(checkpointBytes),rawRemovedAfterLosslessArchive:true,phases},
  birthChecks,cleanup:raw.cleanup,protectedOriginal:terminal.protectedAfter,browserPin:terminal.browserPinAfter,noConversionRelaunched:true,noProcessesKilled:true,
  fullOriginalAcceptance:false,completeChromiumMemoryAcceptance:false,publicAcceptance:false,speedGainProven:false,etaSleepSeconds:1800,
  next:"Investigate bounded final-unref reuse for initial Matroska AVBuffer realloc payloads; preserve aliases/content/size/padding/close semantics and fixed heaps/settings/quality before a changed full retry.",
  ownSource:{path:own,sha256:sha(ownBytes),preimage:ownBytes.toString("base64")}};
await writeFile(path.join(root,output),JSON.stringify(proof,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({output,apiRequestedBytes:273954,totalFreeBytes:2071568,largestFreeBytes:246016,failedWindowMiB:incremental,ownedBirthsAbsent:birthChecks.length,checkpointRawBytesRemoved:checkpointBytes.length}));

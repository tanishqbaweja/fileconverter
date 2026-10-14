// One-off independent current/evidence/source join; no expensive browser replay.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access,lstat,readFile,stat,unlink,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { sha,baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectReallocMediaReport } from "./lib/realloc-media-report-inspector.mjs";
import { reallocMediaComponents } from "./lib/realloc-media-components.mjs";
import { REALLOC_DECODER_SHA256 } from "./lib/realloc-attempt-abort-capture.mjs";
assert.equal(process.argv.length,2);
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),stamp="2026-10-14T09-09-29-345Z";
const proofPath=`evidence/${stamp}-journaled-realloc-media.json`,proofBytes=await read(proofPath),proof=JSON.parse(proofBytes);
assert.equal(proof.failure,null);assert.equal(proof.status,"four-headless-conversions-input-failure-and-recovery-passed-not-full-acceptance");
assert.equal(proof.analysis.genuineValidatedConversions,4);assert.equal(proof.browserMode,"headless");assert.equal(proof.publicAcceptance,false);
assert.equal(proof.completeChromiumMemoryAcceptance,false);assert.equal(proof.originalFullSourceAcceptance,false);
const restore=async (record,maximum)=>{assert.equal(path.dirname(path.resolve(root,record.path)),path.join(root,"outputs/reports"));
  const zip=await read(record.path);assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
  const raw=gunzipSync(zip,{maxOutputLength:maximum});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);return raw;};
const archive=JSON.parse(await restore(proof.generatedArchive,8388608));assert.equal(Object.keys(proof.sourcePins).length,249);
assert.ok(Object.keys(proof.sourcePins).length<=256);assert.deepEqual(archive.sourcePins,proof.sourcePins);assert.deepEqual(proof.sourcePins,proof.postSourcePins);
for(const [file,hash] of Object.entries(proof.sourcePins)){assert.equal(sha(archive.sources[file]),hash,file);assert.equal(sha(await read(file)),hash,file);}
const raw=await restore(proof.report.archive,2097152);assert.equal(sha(raw),proof.report.sha256);const report=JSON.parse(raw);
assert.deepEqual(report.manifest,archive.generated.composition.manifest);
const analysis=inspectReallocMediaReport(report,JSON.parse(await read(proof.baseline.path)).reports[0].report,JSON.parse(await read(proof.build.path)));
assert.deepEqual(analysis,proof.analysis);const parts=await reallocMediaComponents(root);
assert.equal(report.manifest.artifacts["within-mpeg2-split.wasm"],REALLOC_DECODER_SHA256);assert.equal(report.manifest.artifacts["within-mpeg2-split.mjs"],parts.glue.generatedSha256);
assert.equal(report.manifest.artifacts["split-encoder.wasm"],"a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
assert.equal(report.manifest.aggregateWasmMemoryBytes,50331648);assert.equal(report.manifest.allowMemoryGrowth,false);
assert.deepEqual(report.manifest.reallocAttempt,parts.build.manifest.reallocAttempt);assert.deepEqual(report.manifest.componentProofs.nativeExecutedSources,parts.envelope);
assert.deepEqual(report.manifest.reallocComposition.observerTypedFunctions,parts.observerTypedFunctions);
assert.equal(archive.generated.asyncifyGlueRecipe.generated,parts.glue.generated);assert.equal(archive.generated.infrastructureTimeout.individualTestTimeoutMs,60000);
assert.equal(archive.generated.infrastructureTimeout.conversionAcceptanceThresholdsChanged,false);
const config=(await import("data:text/javascript;base64,"+Buffer.from(archive.generated.config).toString("base64"))).default;
assert.equal(config.use.headless,true);assert.equal(config.retries,0);assert.equal(config.timeout,60000);assert.equal(config.globalTimeout,270000);
const cases=report.rows.filter(x=>!x.kind&&x.status==="passed");assert.equal(cases.length,4);
const diagnostics=report.rows.filter(x=>x.kind==="independent-frame-diagnostic");assert.equal(diagnostics.length,4);
for(const row of [...cases,...diagnostics]){assert.equal(row.outputSha256,"554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27");assert.equal(row.outputBytes,2245558);
  assert.equal(row.sourceBytes,4457906);assert.equal(row.metrics.queuedBytes,0);assert.equal(row.metrics.pendingOperations,0);
  assert.ok(row.metrics.peakPendingOperations<=1&&row.metrics.peakQueuedBytes<=524288);assert.equal(row.metrics.maxReadChunkBytes,65536);assert.equal(row.metrics.peakWasmMemoryBytes,50331648);}
for(const row of diagnostics){assert.equal(row.nativeFullDecodePassed,true);assert.ok(row.ordinalSsim>=.98);}
assert.equal(report.rows.filter(x=>x.kind==="attached-picture-preservation"&&x.status==="passed").length,4);
assert.deepEqual(report.rows.filter(x=>x.kind==="validated-same-page-recovery").map(x=>x.phase),["write-failure","cancellation","input-read-failure"]);
for(const row of report.rows.filter(x=>x.cleanupRemovedEntries))assert.deepEqual(row.cleanupRemovedEntries,[]);
const journalPath=archive.generated.journaledFixture.cleanupPath,journalBytes=await read(journalPath),journal=JSON.parse(journalBytes);
assert.equal(journal.status,"registered-fixture-already-removed");assert.equal(journal.ownedDirectoryAbsent,true);assert.equal(journal.runnerAbsence.status,"owned-identity-absent");
await assert.rejects(access(journal.record.directory),{code:"ENOENT"});
for(const flag of ["ownedWrapperAbsent","privateAdditionsAbsent","normalAppAndCssUnchanged"])assert.equal(proof.cleanup[flag],true);
assert.deepEqual(proof.cleanup.newFixtureDirsRemaining,[]);await assert.rejects(access(proof.cleanup.ownedWrapper),{code:"ENOENT"});
const helpers=proof.cleanup.helpers;assert.equal(sha(await read(helpers.path)),helpers.sha256);await assert.rejects(access(helpers.runtime),{code:"ENOENT"});
const identities=[...helpers.launchRecords.map(row=>row.identity),journal.record.registrationIdentity,...parts.proof.nativeIdentities];
const memorySamples=report.rows.filter(x=>x.memoryScope).flatMap(x=>x.samples),sampledPids=new Map();
for(const sample of memorySamples)for(const item of sample.processes??[])sampledPids.set(item.pid,{...item,lastSampleAt:sample.timestamp});
const ids=[...new Set([...identities.map(x=>x.pid),...sampledPids.keys()])];assert.ok(ids.length<=64);
const command="$ErrorActionPreference='Stop'; $verificationPids="+ids.join(",")+"; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$verificationPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const result=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(command,"utf16le").toString("base64")],{cwd:root,windowsHide:true,timeout:15000,maxBuffer:131072});
const current=JSON.parse(result.stdout),birthChecks=identities.map(identity=>{const now=current.find(x=>x.pid===identity.pid)??null;
  assert.ok(now===null||Math.abs(Date.parse(now.createdAt)-Date.parse(identity.createdAt))>=1);return {identity,current:now,ownedBirthAbsent:true};});
const sampledPidChecks=[...sampledPids.values()].map(sample=>{const now=current.find(x=>x.pid===sample.pid)??null;
  assert.ok(now===null||Date.parse(now.createdAt)>Date.parse(sample.lastSampleAt));return {pid:sample.pid,parentPid:sample.parentPid,lastSampleAt:sample.lastSampleAt,current:now,sampledProcessGone:true,
    birthWasNotRecordedInConversionMemorySample:true};});
for(const [name,hash] of Object.entries(proof.cleanup.restored)){assert.equal(sha(await read("public/engines/remux/"+name)),hash);assert.equal(sha(await read("dist/client/engines/remux/"+name)),hash);}
assert.equal(sha(await read("dist/client"+baselineBinding.url)),baselineBinding.sha256);
const original=path.join(root,"test.mkv");assert.equal((await stat(original)).size,2958573265);const originalHash=createHash("sha256");
for await(const chunk of createReadStream(original,{highWaterMark:1048576}))originalHash.update(chunk);const originalSha256=originalHash.digest("hex");
assert.equal(originalSha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");assert.deepEqual(proof.protectedPre,proof.protectedPost);assert.equal(proof.protectedPost.sha256,originalSha256);
const rawPath=path.resolve(root,proof.report.path);assert.equal(path.dirname(rawPath),path.join(root,"output/playwright"));
assert.match(path.basename(rawPath),/^2026-10-14T[0-9:.TZ-]+-packet-cache-media-axJ8V0-direct-artwork\.json$/);
assert.deepEqual(await readFile(rawPath),raw);const rawIdentity=await lstat(rawPath,{bigint:true});assert.ok(rawIdentity.isFile()&&!rawIdentity.isSymbolicLink());
const ownFile="scripts/verify-journaled-realloc-media-evidence.mjs",ownBytes=await read(ownFile),output=`evidence/${stamp}-journaled-realloc-media-independent-qualification.json`;
const proofOut={recordedAt:new Date().toISOString(),status:"four-genuine-headless-conversions-and-recovery-independently-qualified-not-full-acceptance",
  receipt:{path:proofPath,sha256:sha(proofBytes)},sourceCount:249,sourceArchive:proof.generatedArchive,reportArchive:proof.report.archive,
  allExecutedCurrentPostPreimagesVerified:true,unchanged256Source8MiBCaps:true,analysis,actualDecoderSha256:REALLOC_DECODER_SHA256,
  nativeSourceEnvelope:parts.envelope,compositeControl:{path:parts.witness.proof.path,sha256:parts.witness.proof.sha256},
  outputSha256:cases[0].outputSha256,allEightIndependentOutputHashesMatch:true,journal:{path:journalPath,sha256:sha(journalBytes),...journal},birthChecks,sampledPidChecks,
  conversionMemorySamplesAreDiagnosticNotPrimaryAcceptance:true,primaryIncrementalPrivateMiB:null,speedGainProven:false,
  cases:[analysis.previous.normal,...analysis.previous.recovery.results.map(x=>x.analysis),analysis.validatedInputFailureRecovery].map((x,i)=>({phase:["normal","write-recovery","cancel-recovery","read-recovery"][i],elapsedMs:x.elapsedMs,input:x.input,outputBytes:x.outputBytes,ordinalSsim:x.ordinalSsim})),
  originalWholePrePostCurrentSha256:originalSha256,noProcessesKilled:true,noDocker:true,browserMode:"headless",headedCoverageVerified:false,
  fullOriginalAcceptance:false,completeChromiumMemoryAcceptance:false,publicAcceptance:false,
  removedRedundantRawJson:{path:proof.report.path,bytes:raw.length,sha256:sha(raw),archive:proof.report.archive,losslessArchiveVerifiedBeforeRemoval:true},
  ownSource:{path:ownFile,sha256:sha(ownBytes),preimage:ownBytes.toString("base64")}};
const recheck=await lstat(rawPath,{bigint:true});assert.equal(recheck.dev,rawIdentity.dev);assert.equal(recheck.ino,rawIdentity.ino);assert.equal(sha(await readFile(rawPath)),sha(raw));
await unlink(rawPath);await assert.rejects(access(rawPath),{code:"ENOENT"});
await writeFile(path.join(root,output),JSON.stringify(proofOut,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output,sourceCount:249,actualCases:cases.length,allEightOutputHashesMatch:true,birthChecks:birthChecks.length,sampledConversionPidsGone:sampledPidChecks.length,removedRawBytes:raw.length,primaryIncrementalPrivateMiB:null}));

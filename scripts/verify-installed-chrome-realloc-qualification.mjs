// Independent exact125+255/source/native/output/pin/cleanup join, no replay.
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
import { inspectInstalledChromePin,assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { verifyReallocNativeEnvelope } from "./lib/realloc-native-envelope.mjs";
assert.equal(process.argv.length,2);
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),stamp="2026-10-14T15-36-28-196Z";
const mediaPath=`evidence/${stamp}-installed-chrome-realloc-media.json`,mediaBytes=await read(mediaPath),media=JSON.parse(mediaBytes);
const witnessPath="evidence/2026-10-14T15-33-36-401Z-installed-chrome-realloc-control-executed-sources.json",witnessBytes=await read(witnessPath),witness=JSON.parse(witnessBytes);
assert.equal(media.failure,null);assert.equal(media.analysis.genuineValidatedConversions,4);assert.equal(media.publicAcceptance,false);
assert.equal(witness.failure,null);assert.equal(witness.proof.status,"passed-synthetic-abort-control");
const restore=async(record,limit)=>{assert.equal(path.dirname(path.resolve(root,record.path)),path.join(root,"outputs/reports"));
  const zip=await read(record.path);assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
  const raw=gunzipSync(zip,{maxOutputLength:limit});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);return raw;};
const controlArchive=JSON.parse(await restore(witness.archive,2097152)),mediaArchive=JSON.parse(await restore(media.generatedArchive,8388608));
for(const [receipt,archive,count] of [[witness,controlArchive,125],[media,mediaArchive,255]]) {
  assert.equal(Object.keys(receipt.sourcePins).length,count);assert.deepEqual(receipt.sourcePins,receipt.postSourcePins);assert.deepEqual(archive.sourcePins,receipt.sourcePins);
  for(const [file,hash] of Object.entries(receipt.sourcePins)){const preimage=receipt===witness?Buffer.from(archive.preimages[file],"base64"):archive.sources[file];assert.equal(sha(preimage),hash,file);assert.equal(sha(await read(file)),hash,file);}
}
const proofBytes=await read(witness.proof.path),control=JSON.parse(proofBytes);assert.equal(sha(proofBytes),witness.proof.sha256);
assert.equal(control.status,"passed-synthetic-abort-control");assert.equal(control.browserVersion,witness.browserPinBefore.version);assert.equal(witness.actualRuntimeBrowserVersion,control.browserVersion);
assert.equal(control.result.terminal.emitted.validatedScalarWords,16);assert.equal(control.result.terminal.emitted.maximumScalarWords,32);
assert.equal(control.result.terminal.emitted.allocationApiRequestedBytes,33554432);assert.equal(control.result.terminal.emitted.failedIndividualAllocationBytes,null);
assert.equal(control.result.terminal.emitted.allocatorFreeBlocks.headerWordsRead,44);assert.equal(control.result.terminal.originalCalls,1);
assert.equal(control.exportOnlyControl.originalSha256,"eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c");assert.equal(control.exportOnlyControl.usableForMediaOrAcceptance,false);
assert.equal(control.cleanup.allSampledNativeBirthsAbsent,true);assert.equal(control.cleanup.runtimeProfileRemoved,true);
assertInstalledChromePinsEqual(witness.browserPinBefore,witness.browserPinAfter);assertInstalledChromePinsEqual(media.browserPinBefore,media.browserPinAfter);
assertInstalledChromePinsEqual(witness.browserPinBefore,media.browserPinBefore);assertInstalledChromePinsEqual(media.browserPinBefore,await inspectInstalledChromePin());
const buildBytes=await read("evidence/mpeg2-realloc-attempt-build-38526781934.json"),nativeEnvelope=await verifyReallocNativeEnvelope(root,JSON.parse(buildBytes),buildBytes,JSON.parse(await read("evidence/mpeg2-realloc-attempt-build-branch-2026-10-14-recursion-fix.json")));
assert.deepEqual(nativeEnvelope,witness.nativeEnvelope);assert.deepEqual(nativeEnvelope,witness.nativeEnvelopePost);
const raw=await restore(media.report.archive,2097152),report=JSON.parse(raw);assert.equal(sha(raw),media.report.sha256);assert.deepEqual(report.manifest,mediaArchive.generated.composition.manifest);
const analysis=inspectReallocMediaReport(report,JSON.parse(await read(media.baseline.path)).reports[0].report,JSON.parse(await read(media.build.path)));assert.deepEqual(analysis,media.analysis);
const runtimeVersions=report.rows.filter(row=>row.kind==="actual-runtime-browser-version");assert.equal(runtimeVersions.length,4);for(const row of runtimeVersions)assert.equal(row.version,media.browserPinBefore.version);
assert.equal(mediaArchive.generated.actualControlWitness,witnessPath);assert.deepEqual(mediaArchive.generated.browserPin,media.browserPinBefore);
const outputs=report.rows.filter(row=>(!row.kind&&row.status==="passed")||row.kind==="independent-frame-diagnostic");assert.equal(outputs.length,8);
for(const row of outputs){assert.equal(row.outputSha256,"554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27");assert.equal(row.outputBytes,2245558);assert.equal(row.sourceBytes,4457906);
  assert.equal(row.metrics.peakWasmMemoryBytes,50331648);assert.equal(row.metrics.queuedBytes,0);assert.equal(row.metrics.pendingOperations,0);assert.ok(row.metrics.peakPendingOperations<=1&&row.metrics.peakQueuedBytes<=524288);}
assert.equal(report.rows.filter(row=>row.kind==="independent-frame-diagnostic"&&row.nativeFullDecodePassed&&row.ordinalSsim>=.98).length,4);
assert.deepEqual(report.rows.filter(row=>row.kind==="validated-same-page-recovery").map(row=>row.phase),["write-failure","cancellation","input-read-failure"]);
const journalPath=mediaArchive.generated.journaledFixture.cleanupPath,journalBytes=await read(journalPath),journal=JSON.parse(journalBytes);
assert.equal(journal.ownedDirectoryAbsent,true);assert.equal(journal.runnerAbsence.status,"owned-identity-absent");
for(const directory of [journal.record.directory,media.cleanup.ownedWrapper,media.cleanup.helpers.runtime,witness.ownedCaller,control.runtimeDirectory])await assert.rejects(access(directory),{code:"ENOENT"});
assert.deepEqual(media.cleanup.newFixtureDirsRemaining,[]);assert.equal(media.cleanup.normalAppAndCssUnchanged,true);assert.equal(media.cleanup.privateAdditionsAbsent,true);
const identities=[...control.nativeIdentities,...media.cleanup.helpers.launchRecords.map(row=>row.identity),journal.record.registrationIdentity];
const samples=report.rows.filter(row=>row.memoryScope).flatMap(row=>row.samples),sampledPids=new Map();
for(const sample of samples)for(const process of sample.processes??[])sampledPids.set(process.pid,{pid:process.pid,parentPid:process.parentPid,lastSampleAt:sample.timestamp});
const pids=[...new Set([...identities.map(row=>row.pid),...sampledPids.keys()])];assert.ok(pids.length<=64);
const command="$ErrorActionPreference='Stop'; $qualificationPids="+pids.join(",")+"; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$qualificationPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(command,"utf16le").toString("base64")],{cwd:root,windowsHide:true,timeout:15000,maxBuffer:131072});
const current=JSON.parse(stdout),birthChecks=identities.map(identity=>{const now=current.find(row=>row.pid===identity.pid)??null;assert.ok(now===null||Math.abs(Date.parse(now.createdAt)-Date.parse(identity.createdAt))>=1);return {identity,current:now,ownedBirthAbsent:true};});
const sampledPidChecks=[...sampledPids.values()].map(sample=>{const now=current.find(row=>row.pid===sample.pid)??null;assert.ok(now===null||Date.parse(now.createdAt)>Date.parse(sample.lastSampleAt));return {...sample,current:now,sampledProcessGone:true,birthWasNotRecordedInConversionSample:true};});
for(const [file,hash] of Object.entries(media.cleanup.restored)){assert.equal(sha(await read("dist/client/engines/remux/"+file)),hash);assert.equal(sha(await read("public/engines/remux/"+file)),hash);}
assert.equal(sha(await read("dist/client"+baselineBinding.url)),baselineBinding.sha256);
const original=path.join(root,"test.mkv");assert.equal((await stat(original)).size,2958573265);const digest=createHash("sha256");for await(const chunk of createReadStream(original,{highWaterMark:1048576}))digest.update(chunk);
const originalSha256=digest.digest("hex");assert.equal(originalSha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");assert.deepEqual(media.protectedPre,media.protectedPost);assert.equal(media.protectedPost.sha256,originalSha256);
const target=path.resolve(root,media.report.path);assert.equal(path.dirname(target),path.join(root,"output/playwright"));assert.match(path.basename(target),/^2026-10-14T[0-9:.TZ-]+-packet-cache-media-MbROAx-direct-artwork\.json$/);
assert.deepEqual(await readFile(target),raw);const identity=await lstat(target,{bigint:true});assert.ok(identity.isFile()&&!identity.isSymbolicLink());
const own="scripts/verify-installed-chrome-realloc-qualification.mjs",ownBytes=await read(own),output=`evidence/${stamp}-installed-chrome-realloc-independent-qualification.json`;
const value={recordedAt:new Date().toISOString(),status:"installed-chrome155-actual-fatal-and-four-genuine-conversions-qualified-not-full-acceptance",
  media:{path:mediaPath,sha256:sha(mediaBytes)},controlWitness:{path:witnessPath,sha256:sha(witnessBytes)},control:{...witness.proof},browserPin:media.browserPinBefore,
  beforeAfterCurrentPinsEqual:true,actualRuntimeVersions:runtimeVersions,sourceCounts:{control:125,media:255},sourceArchives:{control:witness.archive,media:media.generatedArchive},
  allExecutedCurrentPostPreimagesVerified:true,sourceCapsChanged:false,nativeEnvelope,analysis,allEightOutputHashesMatchGolden:true,outputSha256:outputs[0].outputSha256,
  journal:{path:journalPath,sha256:sha(journalBytes)},birthChecks,sampledPidChecks,originalWholePrePostCurrentSha256:originalSha256,
  removedRedundantRawJson:{path:media.report.path,bytes:raw.length,sha256:sha(raw),archive:media.report.archive,losslessArchiveVerifiedBeforeRemoval:true},
  browserMode:"headless",headedCoverageVerified:false,primaryIncrementalPrivateMiB:null,fullOriginalAcceptance:false,publicAcceptance:false,speedGainProven:false,noProcessesKilled:true,noDocker:true,
  ownSource:{path:own,sha256:sha(ownBytes),preimage:ownBytes.toString("base64")}};
const recheck=await lstat(target,{bigint:true});assert.equal(recheck.dev,identity.dev);assert.equal(recheck.ino,identity.ino);assert.equal(sha(await readFile(target)),sha(raw));await unlink(target);await assert.rejects(access(target),{code:"ENOENT"});
await writeFile(path.join(root,output),JSON.stringify(value,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({output,version:value.browserPin.version,sourceCounts:value.sourceCounts,birthChecks:birthChecks.length,sampledConversionPidsGone:sampledPidChecks.length,removedRawBytes:raw.length}));

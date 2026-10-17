import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {access,lstat,readFile,unlink,writeFile} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";
import {gzipSync,gunzipSync} from "node:zlib";
import {inspectRecordedTimelineFullTerminal} from "./lib/recorded-timeline-full-terminal.mjs";
import {materializeUpdatedFullArchive} from "./lib/recorded-timeline-full-sources.mjs";
import {sourceTimestampAt} from "./lib/qualified-source-timeline.mjs";
import {sha,baselineBinding} from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const terminalPath="evidence/2026-10-16T21-31-52-360Z-recorded-timeline-full-terminal.json",terminalBytes=await read(terminalPath),terminal=JSON.parse(terminalBytes);
const zip=await read(terminal.report.path);assert.equal(zip.length,terminal.report.bytes);assert.equal(sha(zip),terminal.report.sha256);
const raw=gunzipSync(zip,{maxOutputLength:33554432});assert.equal(raw.length,terminal.report.restoredBytes);assert.equal(sha(raw),terminal.report.restoredSha256);
const report=JSON.parse(raw),analysis=inspectRecordedTimelineFullTerminal(terminal,report);
assert.deepEqual((await materializeUpdatedFullArchive(root,terminal.sourceArchive)).pins,terminal.sourcePins);
const supervisorPath="evidence/2026-10-16T21-31-45-004Z-recorded-timeline-supervisor-full.json",supervisorBytes=await read(supervisorPath),supervisor=JSON.parse(supervisorBytes);
assert.equal(supervisor.status,"command-failed-not-conversion-acceptance");assert.equal(supervisor.childExit.code,1);assert.equal(supervisor.runtimeRemoved,true);
const births=[supervisor.supervisorIdentity,supervisor.childIdentity,terminal.driverIdentity,...terminal.treeCleanupAudit.recordedBirths];
const pids=[...new Set(births.map(row=>row.pid))];assert.ok(pids.length<=512);
const command="$ErrorActionPreference='Stop'; $recordedTimelineAuditPids=@("+pids.join(",")+"); ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$recordedTimelineAuditPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",command],{windowsHide:true,timeout:30000,maxBuffer:131072});
const current=JSON.parse(stdout);for(const birth of births)assert.ok(!current.some(row=>row.pid===birth.pid&&Math.abs(Date.parse(row.createdAt)-Date.parse(birth.createdAt))<1));
for(const directory of [terminal.wrapper,terminal.candidateDirectory,terminal.callerRuntimeDirectory,supervisor.runtimeDirectory,...terminal.treeCleanupAudit.paths])await assert.rejects(access(directory),{code:"ENOENT"});
assert.equal(sha(await read("dist/client"+baselineBinding.url)),baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")),"f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
const digest=createHash("sha256"),original=path.join(root,"test.mkv");assert.equal((await lstat(original)).size,2958573265);
for await(const chunk of createReadStream(original,{highWaterMark:1048576}))digest.update(chunk);
assert.equal(digest.digest("hex"),terminal.protectedAfter.sha256);
const prefix="outputs/reports/2026-10-16T21-32-19-026Z-private-mpeg2-updated-chrome-full-native-100ms";
const timestampRecordPath=prefix+"-output-timestamps-1.json",timestampRecord=JSON.parse(await read(timestampRecordPath));
assert.equal(timestampRecord.frames,296160);assert.equal(timestampRecord.stderr.bytes,0);assert.equal(timestampRecord.failure,null);
assert.equal(timestampRecord.executable,"C:/ffmpeg/bin/ffprobe.exe");assert.equal(timestampRecord.maximumMs,1800000);assert.equal(timestampRecord.maximumStdoutBytes,33554432);
const timestampPath=path.join(root,timestampRecord.stdout.archive.path),timestampIdentity=await lstat(timestampPath,{bigint:true});assert.ok(timestampIdentity.isFile()&&!timestampIdentity.isSymbolicLink());
const clockZip=await readFile(timestampPath);assert.equal(clockZip.length,timestampRecord.stdout.archive.bytes);assert.equal(sha(clockZip),timestampRecord.stdout.archive.sha256);
const clockRaw=gunzipSync(clockZip,{maxOutputLength:33554432});assert.equal(clockRaw.length,timestampRecord.stdout.bytes);assert.equal(sha(clockRaw),timestampRecord.stdout.sha256);
const times=clockRaw.toString().split(/\r?\n/).filter(line=>/^-?\d+(?:\.\d+)?(?:,|$)/.test(line)).map(line=>Number(line.split(",")[0]));
assert.equal(times.length,296160);let maximumError=0;for(let index=0;index<times.length;index++)maximumError=Math.max(maximumError,Math.abs(times[index]-sourceTimestampAt(index)));
assert.equal(maximumError,report.runs[0].independentValidation.maximumTimestampErrorSeconds);assert.ok(maximumError<=.001);
const diagnosticTraces=[];
for(const session of report.rendererAttributionResult.sessions) {
  const archive=session.trace.trace.rawArchive;if(!archive)continue;
  assert.equal(path.dirname(archive.path),path.join(root,"outputs/reports"));const data=await readFile(archive.path);
  assert.equal(data.length,archive.bytes);assert.equal(sha(data),archive.sha256);
  diagnosticTraces.push({...archive,observedSessionStartedAt:session.startedAt,legacyFilenameTimestampNotExecutionDate:true,postCancellationNotPeakObjectProof:true});
}
const checkpointPath=prefix+"-native-checkpoint.json",checkpointIdentity=await lstat(path.join(root,checkpointPath),{bigint:true});assert.ok(checkpointIdentity.isFile()&&!checkpointIdentity.isSymbolicLink());
const checkpointRaw=await read(checkpointPath);assert.ok(checkpointRaw.length<=2097152);const compressed=gzipSync(checkpointRaw,{level:9});assert.deepEqual(gunzipSync(compressed),checkpointRaw);
const checkpointArchive=checkpointPath+".gz";await writeFile(path.join(root,checkpointArchive),compressed,{flag:"wx"});
const ownSources={};for(const file of ["scripts/analyze-recorded-timeline-full-terminal.mjs","scripts/lib/recorded-timeline-full-terminal.mjs","tests/recorded-timeline-full-terminal.test.mjs"]){const data=await read(file);ownSources[file]={sha256:sha(data),preimage:data.toString("base64")};}
const output="evidence/2026-10-16T21-31-52-360Z-recorded-timeline-full-terminal-analysis.json";
await writeFile(path.join(root,output),JSON.stringify({recordedAt:new Date().toISOString(),analysis,terminal:{path:terminalPath,sha256:sha(terminalBytes)},
  supervisor:{path:supervisorPath,sha256:sha(supervisorBytes)},all768ExecutedPreCurrentPostPinsVerified:true,sourceArchive:terminal.sourceArchive,
  recordedBirthsChecked:births.length,currentOwnedBirthsAbsent:true,currentPidReuses:current,ownedDirectoriesAbsent:true,normalAssetsRestored:true,protectedOriginalShaUnchanged:true,
  independentlyReplayedTimestampProof:{recordPath:timestampRecordPath,recordSha256:sha(await read(timestampRecordPath)),frames:times.length,maximumErrorSeconds:maximumError,
    rawCompressedBytes:clockZip.length,rawCompressedSha256:sha(clockZip),rawStdoutSha256:sha(clockRaw),plannedRemovalAfterVerification:true},diagnosticTraces,
  losslesslyCompactedCheckpoint:{path:checkpointArchive,bytes:compressed.length,sha256:sha(compressed),restoredBytes:checkpointRaw.length,restoredSha256:sha(checkpointRaw)},ownSources,
  fullOriginalAcceptance:false,publicAcceptance:false},null,2)+"\n",{flag:"wx"});
const checked=await lstat(path.join(root,checkpointPath),{bigint:true});assert.equal(checked.dev,checkpointIdentity.dev);assert.equal(checked.ino,checkpointIdentity.ino);assert.equal(sha(await read(checkpointPath)),sha(checkpointRaw));await unlink(path.join(root,checkpointPath));
const checkedClock=await lstat(timestampPath,{bigint:true});assert.equal(checkedClock.dev,timestampIdentity.dev);assert.equal(checkedClock.ino,timestampIdentity.ino);assert.equal(sha(await readFile(timestampPath)),sha(clockZip));await unlink(timestampPath);
console.log(JSON.stringify({output,analysis,checkpointRawRemoved:true,verifiedTimestampRawRemoved:true}));

import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {access,readFile,writeFile,lstat,unlink} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";
import {gzipSync,gunzipSync} from "node:zlib";
import {inspectUpdatedChromeFullTerminal} from "./lib/updated-chrome-full-terminal.mjs";
import {materializeUpdatedFullArchive} from "./lib/updated-chrome-full-sources.mjs";
import {sha,baselineBinding} from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const terminalPath="evidence/2026-10-16T17-01-47-260Z-updated-chrome-full-terminal.json",terminalBytes=await read(terminalPath),terminal=JSON.parse(terminalBytes);
const zip=await read(terminal.report.path);assert.equal(zip.length,terminal.report.bytes);assert.equal(sha(zip),terminal.report.sha256);
const raw=gunzipSync(zip,{maxOutputLength:33554432});assert.equal(raw.length,terminal.report.restoredBytes);assert.equal(sha(raw),terminal.report.restoredSha256);
const report=JSON.parse(raw),analysis=inspectUpdatedChromeFullTerminal(terminal,report);
const archive=await materializeUpdatedFullArchive(root,terminal.sourceArchive);assert.deepEqual(archive.pins,terminal.sourcePins);
const supervisorPath="evidence/2026-10-16T17-01-39-930Z-updated-chrome-supervisor-full.json",supervisorBytes=await read(supervisorPath),supervisor=JSON.parse(supervisorBytes);
assert.equal(supervisor.status,"command-failed-not-conversion-acceptance");assert.equal(supervisor.childExit.code,1);assert.equal(supervisor.runtimeRemoved,true);
const births=[supervisor.supervisorIdentity,supervisor.childIdentity,terminal.driverIdentity,...terminal.treeCleanupAudit.recordedBirths];
const pids=[...new Set(births.map(row=>row.pid))];assert.ok(pids.length<=512);
const command="$ErrorActionPreference='Stop'; $updatedTerminalAuditPids=@("+pids.join(",")+"); ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$updatedTerminalAuditPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",command],{windowsHide:true,timeout:30000,maxBuffer:131072});
const current=JSON.parse(stdout);for(const birth of births)assert.ok(!current.some(row=>row.pid===birth.pid&&Math.abs(Date.parse(row.createdAt)-Date.parse(birth.createdAt))<1));
for(const directory of [terminal.wrapper,terminal.candidateDirectory,supervisor.runtimeDirectory,...terminal.treeCleanupAudit.paths])await assert.rejects(access(directory),{code:"ENOENT"});
assert.equal(sha(await read("dist/client"+baselineBinding.url)),baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")),"f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
const digest=createHash("sha256"),original=path.join(root,"test.mkv");assert.equal((await lstat(original)).size,2958573265);
for await(const chunk of createReadStream(original,{highWaterMark:1048576}))digest.update(chunk);
assert.equal(digest.digest("hex"),terminal.protectedAfter.sha256);
const checkpointPath="outputs/reports/2026-10-16T17-02-15-592Z-private-mpeg2-updated-chrome-full-native-100ms-native-checkpoint.json";
const checkpointIdentity=await lstat(path.join(root,checkpointPath),{bigint:true});assert.ok(checkpointIdentity.isFile()&&!checkpointIdentity.isSymbolicLink());
const checkpointRaw=await read(checkpointPath);assert.ok(checkpointRaw.length<=2097152);const compressed=gzipSync(checkpointRaw,{level:9});assert.deepEqual(gunzipSync(compressed),checkpointRaw);
const checkpointArchive=checkpointPath+".gz";await writeFile(path.join(root,checkpointArchive),compressed,{flag:"wx"});
const ownSources={};for(const file of ["scripts/analyze-updated-chrome-full-terminal.mjs","scripts/lib/updated-chrome-full-terminal.mjs","tests/updated-chrome-full-terminal.test.mjs"]){const bytes=await read(file);ownSources[file]={sha256:sha(bytes),preimage:bytes.toString("base64")};}
const output="evidence/2026-10-16T17-01-47-260Z-updated-chrome-full-terminal-analysis.json";
await writeFile(path.join(root,output),JSON.stringify({recordedAt:new Date().toISOString(),analysis,terminal:{path:terminalPath,sha256:sha(terminalBytes)},
  supervisor:{path:supervisorPath,sha256:sha(supervisorBytes)},all750ExecutedPreCurrentPostPinsVerified:true,sourceArchive:terminal.sourceArchive,
  recordedBirthsChecked:births.length,currentOwnedBirthsAbsent:true,currentPidReuses:current,ownedDirectoriesAbsent:true,normalAssetsRestored:true,protectedOriginalShaUnchanged:true,
  losslesslyCompactedCheckpoint:{path:checkpointArchive,bytes:compressed.length,sha256:sha(compressed),restoredBytes:checkpointRaw.length,restoredSha256:sha(checkpointRaw)},ownSources,
  fullOriginalAcceptance:false,publicAcceptance:false},null,2)+"\n",{flag:"wx"});
const now=await lstat(path.join(root,checkpointPath),{bigint:true});assert.equal(now.dev,checkpointIdentity.dev);assert.equal(now.ino,checkpointIdentity.ino);assert.equal(sha(await read(checkpointPath)),sha(checkpointRaw));await unlink(path.join(root,checkpointPath));
console.log(JSON.stringify({output,analysis,checkpointRawRemoved:true}));

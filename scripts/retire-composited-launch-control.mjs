// Read-only liveness audit, then remove only the recorded failed helper scratch.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access,lstat,readFile,realpath,rm,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha,baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root=path.resolve(import.meta.dirname,".."),execute=promisify(execFile);
const proofPath="evidence/2026-10-15T17-15-11-444Z-composited-handoff-media.json",proofBytes=await readFile(path.join(root,proofPath)),proof=JSON.parse(proofBytes);
assert.equal(proof.status,"failed-or-incomplete");assert.equal(proof.analysis,null);
const scratch=path.join(root,"work/single-idle-golden-helpers-VSPMxA");
assert.equal(path.dirname(scratch),path.join(root,"work"));
const query=async()=>JSON.parse((await execute("powershell.exe",["-NoProfile","-NonInteractive","-Command",
  "$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$_.ProcessId -eq 39156 -or $_.ProcessId -eq 35404 -or $_.CommandLine -like '*single-idle-golden-helpers-VSPMxA*' -or $_.CommandLine -like '*packet-cache-media-MTAxSR*'} | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');commandLine=$_.CommandLine}}) -Compress"],
  {cwd:root,windowsHide:true,timeout:15000,maxBuffer:16384})).stdout);
const observed=await query();
// This PowerShell query itself can contain the names; never treat it as an owned helper.
const helpers=observed.filter(row=>!row.commandLine?.includes("ConvertTo-Json -InputObject"));
assert.deepEqual(helpers,[],"Never remove scratch while any matching helper/recorded PID is live");
const runtime=await createOwnedRuntimeScratch("composited-launch-restoration-");
try {await execute(process.execPath,["node_modules/vinext/dist/cli.js","build"],{cwd:root,env:runtime.env,windowsHide:true,timeout:180000,maxBuffer:2097152});}
finally {await runtime.close();}
assert.equal(sha(await readFile(path.join(root,"dist/client",baselineBinding.url))),baselineBinding.sha256);
let removedScratch=false;
try {
  const before=await lstat(scratch,{bigint:true});assert.ok(before.isDirectory()&&!before.isSymbolicLink());assert.equal(await realpath(scratch),scratch);
  assert.ok(proof.failure.includes(scratch)||proof.failure.includes(scratch.replaceAll("\\","\\\\")),"Scratch must be explicitly identified in failed receipt");
  const current=await lstat(scratch,{bigint:true});assert.equal(current.dev,before.dev);assert.equal(current.ino,before.ino);
  await rm(scratch,{recursive:true,force:false,maxRetries:5,retryDelay:100});removedScratch=true;
}catch(error){if(error.code!=="ENOENT")throw error;}
await assert.rejects(access(scratch),{code:"ENOENT"});
const output="evidence/2026-10-15T17-15-11-444Z-composited-launch-cleanup.json";
const source=await readFile(import.meta.filename);
await writeFile(path.join(root,output),JSON.stringify({recordedAt:new Date().toISOString(),proof:{path:proofPath,sha256:sha(proofBytes)},
  observed,ownedHelpersAbsent:true,noProcessesKilled:true,normalAssetsRestored:true,removedScratch,scratchAbsent:true,
  convertedFilesCreated:0,browserConversionsPerformed:0,ownSource:{path:"scripts/retire-composited-launch-control.mjs",sha256:sha(source),preimage:source.toString("base64")}},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output,removedScratch,normalAssetsRestored:true,noProcessesKilled:true}));

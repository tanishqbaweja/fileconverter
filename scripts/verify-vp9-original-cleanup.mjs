// Read-only census of exact births retained by original attempt5, never kill.
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length,2);
const root=path.resolve(import.meta.dirname,".."),input="evidence/2026-11-06-vp9-original-cpu-startup-attempt5.json",
  report=JSON.parse(await readFile(path.join(root,input))),identities=new Map();
const add=row=>{
  assert.ok(Number.isSafeInteger(row.pid)&&row.pid>0&&Number.isSafeInteger(row.parentPid)&&Number.isFinite(Date.parse(row.createdAt)));
  identities.set(row.pid+":"+row.createdAt,{pid:row.pid,parentPid:row.parentPid,createdAt:row.createdAt});
  assert.ok(identities.size<=64);
};
const visit=value=>{
  if(!value||typeof value!=="object")return;
  if(value.executableName==="chrome.exe"&&value.createdAt)add(value);
  for(const child of Object.values(value))if(child&&typeof child==="object")visit(child);
};
visit(report);for(const row of report.processCleanup)add(row.identity);
const errors=report.failures.filter(line=>line.includes("Owned process cleanup:"));assert.equal(errors.length,1);
const failedChild=Number(errors[0].match(/process with PID (\d+)/)?.[1]);
assert.ok([...identities.values()].some(row=>row.pid===failedChild),"Reported child must have a retained launch/birth identity");
const pids=[...new Set([...identities.values()].map(row=>row.pid))],filter=pids.map(pid=>"ProcessId = "+pid).join(" OR ");
const script="$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '"+filter+
  "' | ForEach-Object { @{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) -Compress";
const runtime=await createOwnedRuntimeScratch("vp9-cleanup-verification-");
try {
  const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],
    {cwd:root,env:runtime.env,windowsHide:true,timeout:15000,maxBuffer:65536});
  const current=JSON.parse(stdout);assert.ok(Array.isArray(current)&&current.length<=pids.length);
  const proofs=[...identities.values()].map(identity=>{
    const process=current.find(row=>row.pid===identity.pid)??null;
    if(process)assert.ok(Number.isSafeInteger(process.parentPid)&&Number.isFinite(Date.parse(process.createdAt)));
    const sameBirth=process&&Math.abs(Date.parse(process.createdAt)-Date.parse(identity.createdAt))<1;
    return {identity,current:process,status:sameBirth?"owned-birth-still-present":"owned-birth-absent",pidReused:Boolean(process&&!sameBirth)};
  });
  const result={acquiredAt:new Date().toISOString(),scope:"Supplemental read-only census after retained taskkill error; original failure record is unchanged",
    sourceReport:input,originalCleanupErrorPreserved:errors[0],reportedFailedChild:failedChild,proofs,
    allObservedOwnedBirthsAbsent:proofs.every(row=>row.status==="owned-birth-absent"),
    querySucceeded:true,noProcessesKilled:true,unavailableIsNotAbsence:true,originalConversionSucceeded:false,publicAcceptance:false};
  await writeFile(path.join(root,"evidence/2026-11-06-vp9-original-cpu-startup-attempt5-cleanup-followup.json"),JSON.stringify(result,null,2)+"\n",{flag:"wx"});
  assert.equal(result.allObservedOwnedBirthsAbsent,true,"Do not close unrelated applications or assume a remaining owned process is gone");
  console.log(JSON.stringify({observedIdentities:proofs.length,reportedFailedChild:failedChild,allObservedOwnedBirthsAbsent:true,noProcessesKilled:true}));
} finally {await runtime.close();}

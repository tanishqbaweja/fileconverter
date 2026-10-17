import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile, lstat, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),rows=[];
for(const [file,fallback]of[["evidence/2026-10-17T16-32-25-187Z-paint-boundary-visual-live.json","paint-boundary-visual-smXus1"],["evidence/2026-10-17-paint-boundary-visual.json",null]]){
  const raw=await readFile(path.join(root,file)),receipt=JSON.parse(raw),directory=receipt.runtimeDirectory??path.join(root,"work",fallback);
  assert.equal(path.dirname(directory),path.join(root,"work"));assert.match(path.basename(directory),/^paint-boundary-visual-[A-Za-z0-9]+$/);
  const identity=receipt.identity,current=await queryReliableProcessIdentity(identity.pid);let closedOwnedBrowser=false;
  if(current&&Math.abs(Date.parse(current.createdAt)-Date.parse(identity.createdAt))<1){
    assert.equal(current.parentPid,identity.parentPid);
    const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",`(Get-CimInstance Win32_Process -Filter 'ProcessId = ${identity.pid}').CommandLine`],{windowsHide:true,timeout:15000,maxBuffer:16384});
    assert.ok(stdout.includes(directory));const port=Number((await readFile(path.join(directory,"DevToolsActivePort"),"utf8")).split(/\r?\n/)[0]);assert.ok(port>0);
    const browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);assert.equal(browser.version(),receipt.browserPin.version);
    const session=await browser.newBrowserCDPSession();await session.send("Browser.close").catch(()=>{});await browser.close().catch(()=>{});closedOwnedBrowser=true;
  }
  const births=[...new Map([identity,...(receipt.sampledBirths??[])].map(row=>[row.pid+":"+row.createdAt,row])).values()],absences=[];
  for(const birth of births){const absence=await observeOwnedProcessExit(birth);assert.equal(absence.status,"owned-identity-absent");absences.push(absence);}
  const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command","$paintRecoveryPath='"+directory.replaceAll("'","''")+"'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($paintRecoveryPath)} | Select-Object ProcessId,CreationDate) -Compress"],{windowsHide:true,timeout:15000,maxBuffer:65536});
  assert.deepEqual(JSON.parse(stdout),[]);
  const before=await lstat(directory,{bigint:true});assert.ok(before.isDirectory()&&!before.isSymbolicLink());assert.equal(await realpath(directory),directory);
  const after=await lstat(directory,{bigint:true});assert.equal(before.dev,after.dev);assert.equal(before.ino,after.ino);
  await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  const zipped=gzipSync(raw,{level:9}),archive=file+".gz";assert.deepEqual(gunzipSync(zipped),raw);
  await writeFile(path.join(root,archive),zipped,{flag:"wx"});await rm(path.join(root,file));
  rows.push({source:{path:archive,bytes:zipped.length,sha256:sha(zipped),restoredBytes:raw.length,restoredSha256:sha(raw)},
    directory,directoryRemoved:true,closedOwnedBrowser,absences,originalFailure:receipt.failure??null,
    unobservedExit:receipt.status==="running-component-only",unobservedExitCause:null,processesKilled:false});
}
const result={recordedAt:new Date().toISOString(),status:"owned-visual-profiles-recovered-no-visual-or-conversion-acceptance",rows,
  rejectedCss:"paint containment changed8067pixels in real running component",publicAcceptance:false};
const file="evidence/2026-10-17-paint-boundary-visual-recovery.json";await writeFile(path.join(root,file),JSON.stringify(result,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({file,ownedDirectoriesRemoved:rows.length,closedOwnedBrowsers:rows.filter(row=>row.closedOwnedBrowser).length}));

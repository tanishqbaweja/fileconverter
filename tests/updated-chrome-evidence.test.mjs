import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {access,readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {promisify} from "node:util";
import {gunzipSync} from "node:zlib";
import {sha,baselineBinding} from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import {inspectEbmlMediaReport} from "../scripts/lib/staged-handoff-media-recipe.mjs";
import {verifyHandoffBuildAndEvents} from "../scripts/lib/composited-handoff-evidence.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const proof=JSON.parse(await read("evidence/2026-10-16T16-41-46-137Z-updated-chrome-media.json"));
async function unpack(record) {
  const zip=await read(record.path);assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
  const raw=gunzipSync(zip,{maxOutputLength:8388608});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);
  return JSON.parse(raw);
}
test("actual Chrome.80 browser result replays370 source pins and original independent validation",async()=>{
  process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT="evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
  assert.equal(proof.status,"four-updated-chrome-conversions-and-recovery-passed-not-full-acceptance");
  assert.equal(proof.failure,null);assert.deepEqual(proof.cleanupErrors,[]);assert.equal(proof.executions,1);
  assert.deepEqual(proof.sourcePins,proof.postSourcePins);assert.equal(Object.keys(proof.sourcePins).length,370);
  for(const [file,hash]of Object.entries(proof.sourcePins))assert.equal(sha(await read(file)),hash,file);
  const source=await unpack(proof.sourceArchive);assert.deepEqual(source.sourcePins,proof.sourcePins);
  assert.equal(source.recipe.onlyBrowserIdentityAndOwnedPathsChanged,true);assert.equal(source.recipe.conversionAndValidationGatesChanged,false);
  for(const [key,row]of Object.entries(source.recipe.changes))assert.equal(sha(source.recipe.generated[key]),row.sha256,key);
  assert.deepEqual(proof.browserPinBefore,proof.browserPinAfter);assert.equal(proof.browserPinAfter.version,"155.0.8059.80");
  assert.deepEqual(proof.nativeQualification,proof.nativeQualificationAfter);assert.deepEqual(proof.protectedBefore,proof.protectedAfter);
  const report=await unpack(proof.report),parent=JSON.parse(await read(proof.parent.path));
  assert.equal(sha(await read(proof.parent.path)),proof.parent.sha256);
  const baseline=JSON.parse(await read(parent.baseline.path)),nativeBuild=JSON.parse(await read(parent.build.path));
  assert.deepEqual(await inspectEbmlMediaReport(report,baseline.reports[0].report,nativeBuild),proof.analysis);
  assert.equal(proof.analysis.genuineValidatedConversions,4);
  const build=JSON.parse(await read(proof.build.path));assert.equal(sha(await read(proof.build.path)),proof.build.sha256);
  assert.deepEqual(verifyHandoffBuildAndEvents(build,source.recipe.generated,report),proof.lifecycle);
  const previous=await unpack(parent.report.archive),packets=rows=>rows.filter(row=>row.kind==="independent-packet-order-proof");
  assert.equal(packets(report.rows).length,4);assert.deepEqual(packets(report.rows),packets(previous.rows));
  for(const row of packets(report.rows)){assert.equal(row.outputBytes,2245626);assert.equal(row.packets.length,475);}
  const completed=report.rows.filter(row=>row.frames!==undefined&&row.ssim!==undefined);
  assert.equal(completed.length,4);for(const row of completed){assert.equal(Number(row.frames),96);assert.ok(row.ssim>=.98);}
  for(const key of ["publicAcceptance","fullOriginalAcceptance","completeChromiumMemoryAcceptance"])assert.equal(proof[key],false);
});
test("actual short-run owned profiles, fixtures, outputs and sampled processes are gone",async()=>{
  const report=await unpack(proof.report);
  for(const directory of [proof.runtimeDirectory,proof.helpers.runtime,proof.fixtureCleanup.record.directory])
    await assert.rejects(access(directory),{code:"ENOENT"});
  assert.equal(proof.runtimeRemoved,true);assert.equal(proof.productionRestored,true);
  assert.equal(sha(await read("dist/client"+baselineBinding.url)),baselineBinding.sha256);
  assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")),"f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
  await assert.rejects(access(path.join(root,"dist/client/engines/remux/_private_split_decoder.wasm")),{code:"ENOENT"});
  const identities=[...proof.helpers.launchRecords.map(row=>row.identity),proof.fixtureCleanup.record.registrationIdentity];
  const sampled=new Map();for(const row of report.rows.filter(row=>row.memoryScope))for(const sample of row.samples)for(const process of sample.processes??[])
    sampled.set(process.pid,{pid:process.pid,lastSampleAt:sample.timestamp});
  const pids=[...new Set([...identities.map(row=>row.pid),...sampled.keys()])];assert.ok(pids.length>0&&pids.length<=64);
  const command="$ErrorActionPreference='Stop'; $updatedChromeAuditPids=@("+pids.join(",")+"); ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$updatedChromeAuditPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
  const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",command],{cwd:root,windowsHide:true,timeout:15000,maxBuffer:131072});
  const current=JSON.parse(stdout);
  for(const identity of identities){const now=current.find(row=>row.pid===identity.pid);assert.ok(!now||Math.abs(Date.parse(now.createdAt)-Date.parse(identity.createdAt))>=1);}
  for(const sample of sampled.values()){const now=current.find(row=>row.pid===sample.pid);assert.ok(!now||Date.parse(now.createdAt)>Date.parse(sample.lastSampleAt));}
  assert.equal(proof.fixtureCleanup.ownedDirectoryAbsent,true);
});

// Independent read-only terminal analysis; no browser, conversion or deletion.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
const root=path.resolve(import.meta.dirname,".."), sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const input="evidence/mpeg2-abort-original-2026-10-08.json", bytes=await readFile(path.join(root,input)), proof=JSON.parse(bytes);
assert.equal(proof.rawStatus,"failed"); assert.match(proof.failure.message,/abortDiagnostic.staticAssets.length > 0/);
assert.equal(proof.completeOriginalConversions,0); assert.deepEqual(proof.abortDiagnostic.records,[]);
assert.deepEqual(proof.abortDiagnostic.staticAssets,[]); assert.equal(proof.runs[0].state,null);
assert.equal(proof.runs[0].nativePeaks,null); assert.equal(proof.runs[0].independentValidation,null);
assert.ok(proof.nativePhaseCoverage.every(row=>row.phase.startsWith("pre-conversion-")));
assert.equal(sha(proof.generatedSource),proof.generatedSourceSha256);
for(const[file,hash]of Object.entries(proof.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),hash,file);
const rawPath=path.join(root,proof.rawReport.path); assert.ok(rawPath.startsWith(path.join(root,"outputs/reports")+path.sep));
assert.ok((await stat(rawPath)).size<32*1048576); const raw=await readFile(rawPath);
assert.equal(raw.length,proof.rawReport.bytes); assert.equal(sha(raw),proof.rawReport.sha256);
assert.equal(proof.nativePeak.processes.reduce((sum,p)=>sum+p.privateBytes,0),proof.nativePeak.privateBytes);
assert.equal(proof.nativePeak.phase,"pre-conversion-1");
assert.equal(proof.nativePeakIncrementalMiB,75.5390625);
for(const key of["mediaProfileRuntimeRemoved","generatedDistRestored","protectedFixtureUnchanged","observerStopped","sampledChromeRootStopped"])
  assert.equal(proof.cleanup[key],true);
assert.equal(proof.cleanup.conversionQuiescence.terminalState,"idle");
for(const directory of[proof.runtimeDirectory,proof.generatedRuntimeDirectory])await assert.rejects(access(directory),{code:"ENOENT"});
const helpers=[
  {pid:38492,parentPid:40984,createdAt:"2026-10-07T18:47:15.1809040Z"},
  {pid:40984,parentPid:23908,createdAt:"2026-10-07T18:47:15.0890140Z"},
  {pid:43844,parentPid:38492,createdAt:"2026-10-07T18:47:24.3756460Z"},
  {pid:44916,parentPid:38492,createdAt:"2026-10-07T18:47:26.8504250Z"},
];
const identities=[...proof.sampledNativeIdentities,...helpers], ids=[...new Set(identities.map(p=>p.pid))];
assert.ok(ids.every(pid=>Number.isSafeInteger(pid)&&pid>0));
const filter=ids.map(pid=>`ProcessId = ${pid}`).join(" or ");
const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",
  `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{pid=$_.ProcessId;parentPid=$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) -Compress`],
{windowsHide:true,timeout:15000,maxBuffer:131072});
const current=JSON.parse(stdout);
assert.deepEqual(current.filter(p=>identities.some(old=>old.pid===p.pid&&old.parentPid===p.parentPid&&
  microsecondBirth(old.createdAt)===microsecondBirth(p.createdAt))),[]);
const restoredAssets={};
for(const file of["within-remux.mjs","within-remux.wasm","within-mpeg4.mjs","within-mpeg4.wasm","within-direct.mjs","within-direct.wasm"]){
  const hash=sha(await readFile(path.join(root,"public/engines/remux",file)));
  assert.equal(sha(await readFile(path.join(root,"dist/client/engines/remux",file))),hash); restoredAssets[file]=hash;
}
for(const file of["_private_split_decoder.mjs","_private_split_decoder.wasm","_private_split_encoder.mjs","_private_split_encoder.wasm",
  "mpeg2-split-session.mjs","mpeg2-split-frame-bridge.mjs","mpeg2-split-frame-layout.mjs","mpeg2-split-frame-properties.mjs","mpeg2-split-packet-bridge.mjs"])
  await assert.rejects(access(path.join(root,"dist/client/engines/remux",file)),{code:"ENOENT"});
assert.equal((await stat(path.join(root,"test.mkv"))).size,2958573265);
const sourceHash=createHash("sha256");for await(const chunk of createReadStream(path.join(root,"test.mkv"),{highWaterMark:1048576}))sourceHash.update(chunk);
assert.equal(sourceHash.digest("hex"),"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const analysis={recordedAt:new Date().toISOString(),status:"verified-terminal-preconversion-harness-failure-not-acceptance",
  input:{path:input,bytes:bytes.length,sha256:sha(bytes)},rawReportVerified:true,allExecutedSourcesVerified:true,
  failure:proof.failure,browserConversionsStarted:0,completeOriginalConversions:0,actualAbortStacksCaptured:0,
  preConversionIncrementalMiB:75.5390625,conversionPeakMiB:null,publicAcceptance:false,originalFullSourceAcceptance:false,
  cause:"The harness asserted intercepted adapter inventory before the Convert click. No adapter had been captured; no real conversion or OOM occurred. Existing browser harness separately warns worker-import routing is unreliable; this failed attempt does not prove lazy timing was the only problem.",
  cleanup:{allSampledNativeBirthsAbsent:true,nativeIdentities:proof.sampledNativeIdentities.length,
    helperBirthsAbsent:true,checkedPids:ids.length,observedCurrentProcesses:current,reusedPidsAreNotOldProcesses:true,
    bothRuntimeDirectoriesAbsent:true,restoredAssets,ninePrivateAssetsAbsent:true,protectedFullPostHashVerified:true,noProcessesKilled:true},
  sourcePins:{"scripts/analyze-mpeg2-abort-preconversion.mjs":sha(await readFile(path.join(root,"scripts/analyze-mpeg2-abort-preconversion.mjs")))},
  next:"Use existing owned generated-adapter staging with the same proven failure hook, test all five actual browser golden/recovery cases, then a new full-source diagnostic. Do not edit/repin this executed failed route-based recipe."};
const json=JSON.stringify(analysis,null,2)+"\n";assert.ok(Buffer.byteLength(json)<32768);
await writeFile(path.join(root,"evidence/mpeg2-abort-preconversion-analysis-2026-10-08.json"),json,{flag:"wx"});
console.log(json);

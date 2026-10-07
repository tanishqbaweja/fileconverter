// Read-only independent verification; no browser/source/conversion/retry/delete.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { createGunzip } from "node:zlib";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
import { summarizeMemoryInfraTrace } from "./lib/partial-largest-blink-type-summary.mjs";
const root=path.resolve(import.meta.dirname,".."),MiB=1048576,sha=b=>createHash("sha256").update(b).digest("hex");
const input="evidence/partial-blink-blocked-control-2026-10-08.json",bytes=await readFile(path.join(root,input)),proof=JSON.parse(bytes);
assert.ok(bytes.length<=2*MiB);assert.equal(proof.status,"verified-partial-record-control-global-dump-failed");
assert.equal(proof.failure,null);assert.deepEqual(proof.errors,[]);assert.equal(proof.traceStartsBeforeAllocation,0);
assert.equal(proof.traceStarts,1);assert.equal(proof.originalRead,false);assert.equal(proof.converterLoaded,false);
assert.equal(sha(proof.generatedHelper),proof.generatedHelperSha256);
assert.equal(sha(proof.executedGeneratedSource),proof.executedGeneratedSourceSha256);
for(const[file,hash]of Object.entries(proof.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),hash,file);
const trace=proof.traceReport.sessions[0].trace,dump=trace.dumps[0];
assert.equal(trace.status,"failed-diagnostic");assert.equal(dump.memoryDump.success,false);
assert.equal(trace.trace.parseError,null);assert.equal(trace.trace.dataLossOccurred,false);assert.equal(trace.trace.overflow,false);
const archive=trace.trace.rawArchive;assert.equal(path.dirname(archive.path),path.join(root,"outputs/reports"));
assert.ok((await stat(archive.path)).size<=4*MiB);const compressed=await readFile(archive.path);
assert.equal(compressed.length,archive.bytes);assert.equal(sha(compressed),archive.sha256);
const hash=createHash("sha256"),chunks=[];let reconstructed=0;
await pipeline(createReadStream(archive.path,{highWaterMark:65536}),createGunzip({chunkSize:65536}),
  new Writable({highWaterMark:65536,write(chunk,encoding,done){reconstructed+=chunk.length;
    if(reconstructed>16*MiB)return done(new Error("Trace reconstruction bound exceeded"));hash.update(chunk);chunks.push(chunk);done();}}));
assert.equal(reconstructed,trace.trace.serializedBytes);assert.equal(hash.digest("hex"),trace.trace.sha256);
const reparsed=summarizeMemoryInfraTrace(JSON.parse(Buffer.concat(chunks).toString()),trace.dumps);
assert.deepEqual(reparsed,trace.allocatorSummary);
const target=proof.nativeFailureCapture.firstFailure.delta.processDeltas.toSorted((a,b)=>b.deltaPrivateBytes-a.deltaPrivateBytes)[0];
const process=trace.allocatorSummary[0].processes.find(p=>p.pid===target.pid);assert.ok(process);
assert.equal(target.pid,12144);assert.equal(process.tracePrivateFootprintBytes,310677504);
assert.deepEqual(process.blinkHeapStatistics,[]);assert.deepEqual(process.blinkTypeStatistics,[]);
const native=proof.nativeMemory.identities,helpers=[
  {pid:12064,parentPid:37304,createdAt:"2026-10-07T19:52:19.4456710Z"},
  {pid:35836,parentPid:12064,createdAt:"2026-10-07T19:52:19.4866160Z"},
];
const ids=[...new Set([...native.map(p=>p.pid),...helpers.map(p=>p.pid),proof.ownedPids.observer])];
const filter=ids.map(pid=>{assert.ok(Number.isSafeInteger(pid)&&pid>0);return`ProcessId = ${pid}`;}).join(" or ");
const{stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",
  `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{pid=$_.ProcessId;parentPid=$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) -Compress`],
{windowsHide:true,timeout:15000,maxBuffer:131072});
const current=JSON.parse(stdout),identities=[...native,...helpers];
assert.deepEqual(current.filter(p=>identities.some(old=>old.pid===p.pid&&old.parentPid===p.parentPid&&microsecondBirth(old.createdAt)===microsecondBirth(p.createdAt))),[]);
assert.ok(!current.some(p=>p.pid===proof.ownedPids.observer)); // observer PID actually absent; unsampled birth is not invented
for(const directory of[proof.runtimeDirectory,path.join(root,"work/partial-blink-blocked-driver-wvuoi5")])await assert.rejects(access(directory),{code:"ENOENT"});
for(const value of Object.values(proof.cleanup))assert.equal(value,true);
const report={recordedAt:new Date().toISOString(),status:"verified-partial-failed-global-dump-control-not-target-allocation-attribution",
  input:{path:input,bytes:bytes.length,sha256:sha(bytes)},executedSourcesVerified:true,generatedSourcesVerified:true,
  globalDumpSucceeded:false,partialRecordsRecovered:true,serializedTrace:{bytes:reconstructed,sha256:trace.trace.sha256},
  rawArchive:{...archive,path:path.relative(root,archive.path).replaceAll("\\","/")},rawTraceReconstructionAndReparseVerified:true,
  guid:dump.memoryDump.dumpGuid,processRecordCount:trace.allocatorSummary[0].processes.length,
  processCoverage:trace.allocatorSummary[0].processes.map(p=>({pid:p.pid,name:p.traceName,privateFootprintBytes:p.tracePrivateFootprintBytes,
    blinkHeapRecords:p.blinkHeapStatistics.length,retainedKnownTypes:p.blinkTypeStatistics.length,selection:p.blinkTypeSelection})),
  target:{nativeIdentity:target,privateFootprintBytes:process.tracePrivateFootprintBytes,
    blinkHeapAvailable:false,blinkTypesAvailable:false,missingProvidersAreUnavailableNotZero:true,allocationObjectOrCallsite:null},
  diagnosticFinding:"Failed global dumps can contain actual process records. Busy worker control's target renderer has OS footprint but NO Blink heap/type records; availability from other renderers must not be substituted for the target. Before another full source run, test ordinary worker quiescence followed by one complete dump. This is not proof of why the historical production dump failed.",
  cleanup:{original:proof.cleanup,sampledNativeBirthsAbsent:true,nativeBirths:native.length,wrapperDriverBirthsAbsent:true,
    observerPidAbsent:true,observerBirthAvailable:false,checkedPids:ids.length,observedCurrentProcesses:current,
    bothRuntimeDirectoriesAbsent:true,noProcessesKilledByVerifier:true},
  originalRead:false,converterLoaded:false,conversionsPerformed:0,publicAcceptance:false,originalFailureCause:null,
  sourcePins:{"scripts/freeze-partial-blink-blocked-control.mjs":sha(await readFile(path.join(root,"scripts/freeze-partial-blink-blocked-control.mjs")))}};
const json=JSON.stringify(report,null,2)+"\n";assert.ok(Buffer.byteLength(json)<32768);
await writeFile(path.join(root,"evidence/partial-blink-blocked-control-verification-2026-10-08.json"),json,{flag:"wx"});
console.log(JSON.stringify({status:report.status,target:report.target,cleanup:report.cleanup,archive:report.rawArchive}));

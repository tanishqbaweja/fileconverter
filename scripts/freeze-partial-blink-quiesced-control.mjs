// Independent read-only terminal verification, no converter/source/media/delete.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { createGunzip } from "node:zlib";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
import { summarizeMemoryInfraTrace } from "./lib/partial-largest-blink-type-summary.mjs";
const root=path.resolve(import.meta.dirname,".."),MiB=1048576,sha=b=>createHash("sha256").update(b).digest("hex");
const input="evidence/partial-blink-quiesced-control-2026-10-08.json",bytes=await readFile(path.join(root,input)),proof=JSON.parse(bytes);
assert.ok(bytes.length<=2*MiB);assert.equal(proof.status,"verified-quiesced-worker-record-control-global-dump-succeeded");
assert.equal(proof.failure,null);assert.deepEqual(proof.errors,[]);assert.equal(proof.traceStartsBeforeAllocation,0);
assert.equal(proof.traceStarts,1);assert.equal(proof.quiescence.actualWorkerCloseObserved,true);
assert.equal(proof.quiescence.retainedSyntheticBytes,264*MiB);assert.equal(proof.quiescence.noForcedGc,true);
assert.equal(proof.originalRead,false);assert.equal(proof.converterLoaded,false);
assert.equal(sha(proof.generatedHelper),proof.generatedHelperSha256);assert.equal(sha(proof.executedGeneratedSource),proof.executedGeneratedSourceSha256);
for(const[file,hash]of Object.entries(proof.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),hash,file);
const trace=proof.traceReport.sessions[0].trace,dump=trace.dumps[0];
assert.equal(trace.status,"completed-diagnostic");assert.equal(dump.memoryDump.success,true);
assert.equal(trace.trace.parseError,null);assert.equal(trace.trace.dataLossOccurred,false);assert.equal(trace.trace.overflow,false);
assert.ok(proof.quiescence.closedAt<=Date.parse(dump.timestamp));
const archive=trace.trace.rawArchive;assert.equal(path.dirname(archive.path),path.join(root,"outputs/reports"));
assert.ok((await stat(archive.path)).size<=4*MiB);const compressed=await readFile(archive.path);
assert.equal(compressed.length,archive.bytes);assert.equal(sha(compressed),archive.sha256);
const hash=createHash("sha256"),chunks=[];let reconstructed=0;
await pipeline(createReadStream(archive.path,{highWaterMark:65536}),createGunzip({chunkSize:65536}),
  new Writable({highWaterMark:65536,write(chunk,encoding,done){reconstructed+=chunk.length;
    if(reconstructed>16*MiB)return done(new Error("Trace reconstruction bound exceeded"));hash.update(chunk);chunks.push(chunk);done();}}));
assert.equal(reconstructed,trace.trace.serializedBytes);assert.equal(hash.digest("hex"),trace.trace.sha256);
assert.deepEqual(summarizeMemoryInfraTrace(JSON.parse(Buffer.concat(chunks).toString()),trace.dumps),trace.allocatorSummary);
const target=proof.nativeFailureCapture.firstFailure.delta.processDeltas.toSorted((a,b)=>b.deltaPrivateBytes-a.deltaPrivateBytes)[0];
const process=trace.allocatorSummary[0].processes.find(p=>p.pid===target.pid);assert.ok(process);
assert.ok(process.blinkHeapStatistics.length>0);assert.ok(process.blinkTypeStatistics.length>0);
const native=proof.nativeMemory.identities,driverPid=native.find(p=>p.pid===proof.ownedPids.chrome).parentPid;
const helpers=[driverPid,proof.ownedPids.observer],ids=[...new Set([...native.map(p=>p.pid),...helpers])];
const filter=ids.map(pid=>{assert.ok(Number.isSafeInteger(pid)&&pid>0);return`ProcessId = ${pid}`;}).join(" or ");
const{stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",
  `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{pid=$_.ProcessId;parentPid=$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) -Compress`],
{windowsHide:true,timeout:15000,maxBuffer:131072});
const current=JSON.parse(stdout);
assert.deepEqual(current.filter(p=>native.some(old=>old.pid===p.pid&&old.parentPid===p.parentPid&&microsecondBirth(old.createdAt)===microsecondBirth(p.createdAt))),[]);
assert.ok(!current.some(p=>helpers.includes(p.pid))); // actual absent PIDs; helper births unavailable, not invented
await assert.rejects(access(proof.runtimeDirectory),{code:"ENOENT"});
const generatedInventory=(await readdir(path.join(root,"work"))).filter(n=>n.startsWith("partial-blink-quiesced-driver-"));assert.deepEqual(generatedInventory,[]);
for(const value of Object.values(proof.cleanup))assert.equal(value,true);
const report={recordedAt:new Date().toISOString(),status:"verified-quiesced-worker-target-provider-recovery-not-original-attribution",
  input:{path:input,bytes:bytes.length,sha256:sha(bytes)},executedSourcesVerified:true,generatedSourcesVerified:true,
  globalDumpSucceeded:true,serializedTrace:{bytes:reconstructed,sha256:trace.trace.sha256},
  rawArchive:{...archive,path:path.relative(root,archive.path).replaceAll("\\","/")},rawTraceReconstructionAndReparseVerified:true,
  quiescence:proof.quiescence,guid:dump.memoryDump.dumpGuid,processRecordCount:trace.allocatorSummary[0].processes.length,
  target:{nativeIdentity:target,privateFootprintBytes:process.tracePrivateFootprintBytes,blinkHeapAvailable:true,blinkTypesAvailable:true,
    heaps:process.blinkHeapStatistics,retainedKnownTypes:process.blinkTypeStatistics.length,selection:process.blinkTypeSelection,allocationObjectOrCallsite:null},
  diagnosticFinding:"Ordinary worker termination with actual close observed restores target Blink provider availability in this synthetic control while fixed264MiB storage remains referenced. It does not identify the production allocation or prove its old failed dump had this cause. A production diagnostic must use normal cancellation/worker replacement, preserve the pre-cancel peak, and disclose delayed post-cancel providers.",
  cleanup:{original:proof.cleanup,sampledNativeBirthsAbsent:true,nativeBirths:native.length,
    driverObserverPidsAbsent:true,helperBirthsAvailable:false,wrapperIdentityAvailable:false,checkedPids:ids.length,observedCurrentProcesses:current,
    innerRuntimeAbsent:true,generatedDriverInventory:generatedInventory,noProcessesKilledByVerifier:true},
  originalRead:false,converterLoaded:false,conversionsPerformed:0,publicAcceptance:false,originalFailureCause:null,
  sourcePins:{"scripts/freeze-partial-blink-quiesced-control.mjs":sha(await readFile(path.join(root,"scripts/freeze-partial-blink-quiesced-control.mjs")))}};
const json=JSON.stringify(report,null,2)+"\n";assert.ok(Buffer.byteLength(json)<32768);
await writeFile(path.join(root,"evidence/partial-blink-quiesced-control-verification-2026-10-08.json"),json,{flag:"wx"});
console.log(JSON.stringify({status:report.status,target:report.target,cleanup:report.cleanup,archive:report.rawArchive}));

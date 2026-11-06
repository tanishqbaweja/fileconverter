import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),sha=b=>createHash("sha256").update(b).digest("hex"),
  r=await json("evidence/2026-11-06-vp9-original-cpu-startup-attempt9.json"),a=await json("evidence/2026-11-06-vp9-http-original9-localization.json");
test("actual HTTP original sustains real bounded I/O but exact all-Chrome389MiB still fails and remains cancelled, not full conversion",()=>{
  assert.equal(r.status,"failed-private-vp9-browser-smoke");assert.equal(r.executedHead,"9202c4bb33c1379853abbd6f937bfe6d88f529d6");
  assert.equal(r.browserResult.sourceFileBytes,2958573265);assert.equal(r.browserResult.sourceCopied,false);assert.equal(r.browserResult.nativeBrowserCpuOnly,true);
  assert.equal(r.browserResult.metrics.inputBytes,23160385);assert.equal(r.browserResult.metrics.outputBytes,20868532);assert.equal(r.browserResult.writeAttempts,88);
  assert.equal(r.browserResult.metrics.wasmMemoryBytes,100663296);assert.equal(r.browserResult.metrics.peakPendingOperations,1);
  assert.equal(r.browserResult.metrics.maxReadChunkBytes,262144);assert.equal(r.browserResult.metrics.maxWriteChunkBytes,262144);
  assert.equal(r.memory.incrementalPrivateMiB,389.296875);assert.equal(r.memory.validSamples,1396);assert.equal(r.memory.unavailableSamples,0);
  assert.equal((r.memory.peak.privateBytes-r.blankBaseline.privateBytes)/1048576,r.memory.incrementalPrivateMiB);
  assert.equal(r.originalStartup.stop.kind,"memory-budget-exceeded");assert.equal(r.originalStartup.passedStartupOnly,false);assert.equal(r.publicAcceptance,false);
});
test("late child remains fully counted, with identity but unknown purpose; pre-birth memory is diagnostic only",()=>{
  assert.equal(a.primary.peakProcessCount,11);assert.equal(a.primary.allPeakProcessesIncluded,true);
  assert.equal(a.lateChild.privateBytesAtWholeTreePeak,247611392);assert.equal(a.lateChild.type,null);assert.equal(a.lateChild.utilitySubtype,null);
  assert.ok(a.lateChild.measuredSecondsAfterBrowserBirth>=180&&a.lateChild.measuredSecondsAfterBrowserBirth<181);
  assert.equal(a.beforeLateBirth.diagnosticOnly,true);assert.equal(a.beforeLateBirth.notAnAlternateAcceptanceWindow,true);assert.equal(a.actualEncodedFrameCount,null);
  assert.equal(r.memory.peak.processes.reduce((n,p)=>n+p.privateBytes,0),r.memory.peak.privateBytes);
});
test("aborted data/OPFS/profiles/static stages/owned roots removed, original unchanged, retained failed evidence lossless",async()=>{
  assert.equal(r.browserResult.partialOutputBytes,0);assert.equal(r.browserResult.cleanupComplete,true);assert.equal(r.originalStartup.partialOutputRemoved,true);
  assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);assert.equal(r.privateCpuOverride.stageRemoved,true);
  assert.ok(r.processCleanup.every(x=>x.status==="owned-identity-absent"));assert.deepEqual(r.originalBefore,r.originalAfter);assert.deepEqual(r.forbiddenRequests,[]);
  const packed=await read(r.rawArchive.file),raw=gunzipSync(packed,{maxOutputLength:8388608});assert.equal(sha(packed),r.rawArchive.sha256);assert.equal(sha(raw),r.rawArchive.decodedSha256);
});

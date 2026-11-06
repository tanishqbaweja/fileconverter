import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),sha=b=>createHash("sha256").update(b).digest("hex"),
  r=await json("evidence/2026-11-06-vp9-original-cpu-startup-attempt8.json");
test("actual packed original fails exact250MiB whole-tree limit, never relabels cancellation/header as successful encoding",()=>{
  assert.equal(r.executedHead,"e25dc5205020adfa61dc2faffc068e843e5bcb67");assert.equal(r.status,"failed-private-vp9-browser-smoke");
  assert.equal(r.originalStartup.stop.kind,"memory-budget-exceeded");assert.equal(r.memory.incrementalPrivateMiB,253.0546875);
  assert.equal((r.memory.peak.privateBytes-r.blankBaseline.privateBytes)/1048576,r.memory.incrementalPrivateMiB);
  assert.equal(r.memory.peak.processes.reduce((n,p)=>n+p.privateBytes,0),r.memory.peak.privateBytes);
  assert.equal(r.memory.validSamples,38);assert.equal(r.memory.unavailableSamples,0);assert.equal(r.browserResult.nativeBrowserCpuOnly,true);
  assert.equal(r.browserResult.sourceFileBytes,2958573265);assert.equal(r.browserResult.sourceCopied,false);
  assert.equal(r.browserResult.metrics.wasmMemoryBytes,100663296);assert.equal(r.browserResult.metrics.outputBytes,485);
  assert.equal(r.allocationDiagnostics.available,false);assert.equal(r.allocationDiagnostics.allocatorManagedBytes,null);
  assert.equal(r.originalStartup.passedStartupOnly,false);assert.equal(r.originalStartup.fullOriginalConverted,false);assert.equal(r.publicAcceptance,false);
});
test("owned aborted media/profile/stage/roots removed, original unchanged and raw failure losslessly archived",async()=>{
  assert.equal(r.browserResult.cleanupComplete,true);assert.equal(r.browserResult.partialOutputBytes,0);assert.equal(r.originalStartup.partialOutputRemoved,true);
  assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);assert.ok(r.processCleanup.every(x=>x.status==="owned-identity-absent"));
  assert.deepEqual(r.originalBefore,r.originalAfter);assert.equal(r.originalAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");assert.deepEqual(r.forbiddenRequests,[]);
  const packed=await read(r.rawArchive.file),raw=gunzipSync(packed,{maxOutputLength:8388608});assert.equal(sha(packed),r.rawArchive.sha256);assert.equal(sha(raw),r.rawArchive.decodedSha256);
  const archive=await json("evidence/2026-11-06-vp9-original-cpu-startup-attempt8-archive.json");assert.equal(archive.retainedBytes,101580);assert.equal(archive.allRoundtripsVerified,true);
});
test("process localization never excludes browser root or confuses static-engine transport hypothesis with proven allocator attribution",async()=>{
  const a=await json("evidence/2026-11-06-vp9-token-packed-original-memory-localization.json");assert.equal(a.primary.excessBytes,3203072);
  assert.equal(a.primary.allPeakProcessBytesIncluded,true);assert.equal(a.processes.length,10);
  assert.equal(a.processes.find(p=>p.typeFromSameBirthLoadedCensus==="browser").deltaFromLoadedBytes,30502912);
  assert.equal(a.transportInspection.exactRootProcessAllocationOwner,null);assert.equal(a.native.actualEncodedFrames,null);
  assert.equal(a.transportInspection.thisIsStaticEngineNotUserFileCopy,true);assert.equal(a.publicAcceptance,false);
});

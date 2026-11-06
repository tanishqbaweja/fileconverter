import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import path from "node:path";
import {readPreLeaseLifecycleSampler} from "./helpers/pre-cdp-lease-lifecycle.mjs";
import {reviewDocxHtmlIntegration} from "../scripts/lib/reviewed-docx-html-integration.mjs";
const root=path.resolve(import.meta.dirname,".."),json=async f=>JSON.parse(await readFile(path.join(root,f))),
  file="evidence/2026-11-06-webcodecs-vp9-original-allocation-42231818045.json",r=await json(file),sha=s=>createHash("sha256").update(s).digest("hex");
test("actual platform setup diagnostic is perturbing and over budget, never passing conversion or first-frame evidence",()=>{
  assert.equal(r.status,"completed-perturbed-original-platform-allocation-diagnostic-not-acceptance");assert.deepEqual(r.failures,[]);
  assert.equal(r.platformAllocation.acceptanceMetric,false);assert.equal(r.platformAllocation.perturbsMemoryAndTiming,true);
  assert.equal(r.originalStartup.passedStartupOnly,false);assert.equal(r.originalStartup.diagnosticOnly,true);
  assert.equal(r.originalStartup.stop.kind,"memory-budget-exceeded");assert.equal(r.browserResult.encoder.frames,0);
  assert.equal(r.browserResult.encoder.framesClosed,0);assert.equal(r.browserResult.encoder.peakPackedBytes,0);
  assert.equal(r.browserResult.metrics.wasmMemoryBytes,33554432);assert.equal(r.browserResult.sourceFileBytes,2958573265);
  assert.equal(r.browserResult.nativeBrowserPlatformOnly,true);assert.equal(r.browserResult.sourceCopied,false);
  assert.equal(r.memory.incrementalPrivateMiB,263.86328125);assert.equal(r.memory.validSamples,32);assert.equal(r.memory.unavailableSamples,0);
  assert.equal((r.memory.peak.privateBytes-r.blankBaseline.privateBytes)/1048576,r.memory.incrementalPrivateMiB);
  assert.equal(r.memory.peak.processes.reduce((n,p)=>n+p.privateBytes,0),r.memory.peak.privateBytes);
  assert.equal(r.browserServicesDisabled,false);assert.equal(r.headed,false);assert.equal(r.publicAcceptance,false);assert.equal(r.speedGainProven,false);
});
test("all three bounded traces round-trip, full raw allocator details remain byte-exact and source pins match",async()=>{
  const raw=await readFile(path.join(root,r.rawArchive.file)),decoded=gunzipSync(raw,{maxOutputLength:8388608});
  assert.equal(sha(raw),r.rawArchive.sha256);assert.equal(sha(decoded),r.rawArchive.decodedSha256);
  const original=JSON.parse(decoded);assert.equal(original.memory.incrementalPrivateMiB,r.memory.incrementalPrivateMiB);
  assert.deepEqual(r.platformAllocation.checkpoints.map(x=>x.label),["loaded-idle","webcodecs-vp9-ready","encoder-configured"]);
  for(const c of original.platformAllocation.checkpoints) {
    assert.equal(c.error,null);const a=c.result.archive,bytes=await readFile(a.path),restored=gunzipSync(bytes,{maxOutputLength:8388608});
    assert.equal(sha(bytes),a.sha256);assert.equal(sha(restored),a.restoredSha256);assert.equal(restored.length,a.restoredBytes);
    assert.equal(c.result.dataLossOccurred,false);assert.equal(c.result.allocationStackAttribution,false);
    assert.ok(c.result.summary[0].processes.some(p=>Object.keys(p.liveAllocatorCounters).length>0));
    assert.equal(c.realms.targetsAvailable,true);assert.ok(c.realms.targets.every(t=>t.error===null));
  }
  for(const [f,pin]of Object.entries(r.sourcePins)) {
    let bytes=await (f==="scripts/lib/cdp-realm-memory.mjs"?readPreLeaseLifecycleSampler(f):readFile(path.join(root,f)));
    if(f==="lib/capability-registry.ts")bytes=reviewDocxHtmlIntegration(f,bytes).historicalBytes;
    assert.equal(sha(bytes),pin,f);
  }
});
test("native malloc category grew during setup; stack owner unknown and original data/owned cleanup verified",async()=>{
  const a=await json("evidence/2026-11-06-webcodecs-vp9-original-allocation-localization.json");
  assert.equal(a.setupDelta.rendererMallocAllocatedObjectsBytes,98248982);assert.equal(a.setupDelta.rendererV8EffectiveBytes,524288);
  assert.equal(a.setupDelta.rendererPrivateBytes,97275904);assert.equal(a.actualNativeAllocationStackOwner,null);
  assert.equal(a.firstFrameCheckpointReached,false);assert.equal(a.summedAllocatorTotal,null);assert.equal(a.acceptanceMetric,false);
  assert.equal(r.originalStartup.partialOutputRemoved,true);assert.equal(r.browserResult.partialOutputBytes,0);assert.equal(r.browserResult.cleanupComplete,true);
  assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);assert.ok(r.processCleanup.every(p=>p.status==="owned-identity-absent"));
  assert.deepEqual(r.originalBefore,r.originalAfter);assert.equal(r.originalBefore.bytes,2958573265);
  assert.equal(r.originalBefore.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");assert.deepEqual(r.forbiddenRequests,[]);
});

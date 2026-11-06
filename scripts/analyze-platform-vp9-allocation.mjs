// Read retained evidence only. No media processing or diagnostic replay.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import path from "node:path";
const root=path.resolve(import.meta.dirname,".."),file="evidence/2026-11-06-webcodecs-vp9-original-allocation-42231818045.json",
  r=JSON.parse(await readFile(path.join(root,file))),sha=s=>createHash("sha256").update(s).digest("hex");
assert.equal(r.status,"completed-perturbed-original-platform-allocation-diagnostic-not-acceptance");assert.deepEqual(r.failures,[]);
assert.equal(r.originalStartup.stop.kind,"memory-budget-exceeded");assert.equal(r.browserResult.encoder.frames,0);
assert.equal(r.browserResult.encoder.framesClosed,0);assert.equal(r.browserResult.encoder.peakPackedBytes,0);
assert.equal(r.originalStartup.passedStartupOnly,false);assert.equal(r.originalStartup.partialOutputRemoved,true);
assert.deepEqual(r.originalBefore,r.originalAfter);assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);
assert.ok(r.processCleanup.every(x=>x.status==="owned-identity-absent"));assert.deepEqual(r.forbiddenRequests,[]);
const checkpoints=r.platformAllocation.checkpoints;
assert.deepEqual(checkpoints.map(x=>x.label),["loaded-idle","webcodecs-vp9-ready","encoder-configured"]);
const configured=checkpoints.at(-1),renderer=configured.processSample.processes.filter(p=>p.type==="renderer").sort((a,b)=>b.privateBytes-a.privateBytes)[0];
assert.ok(renderer);
const sameBirth=p=>p.pid===renderer.pid&&p.parentPid===renderer.parentPid&&Math.abs(Date.parse(p.createdAt)-Date.parse(renderer.createdAt))<1;
const phases=[];
for(const c of checkpoints) {
  assert.equal(c.error,null);assert.ok(c.result);const a=c.result.archive,bytes=await readFile(a.path),decoded=gunzipSync(bytes,{maxOutputLength:8388608});
  assert.equal(bytes.length,a.bytes);assert.equal(sha(bytes),a.sha256);assert.equal(decoded.length,a.restoredBytes);assert.equal(sha(decoded),a.restoredSha256);
  const os=c.processSample.processes.find(sameBirth),native=c.result.summary[0].processes.find(p=>p.pid===renderer.pid);
  assert.ok(os&&native);assert.equal(c.processSample.privateBytes,c.processSample.processes.reduce((n,p)=>n+p.privateBytes,0));
  phases.push({phase:c.label,elapsedCaptureMs:Date.parse(c.finishedAt)-Date.parse(c.startedAt),wholeTreePrivateBytes:c.processSample.privateBytes,
    allProcessCount:c.processSample.processes.length,rendererIdentity:{pid:renderer.pid,parentPid:renderer.parentPid,createdAt:renderer.createdAt},
    rendererPrivateBytes:os.privateBytes,rendererMallocAllocatedObjectsBytes:native.allocators.malloc?.allocated_objects_size??null,
    rendererMallocEffectiveBytes:native.allocators.malloc?.effective_size??null,rendererV8EffectiveBytes:native.allocators.v8?.effective_size??null,
    realms:c.realms,archive:{...a,path:path.relative(root,a.path)}});
}
const ready=phases[1],end=phases[2],report={recordedAt:new Date().toISOString(),sourceReport:file,executedHead:r.executedHead,
  scope:"Perturbed setup allocation-category localization, NOT exact native stack owner or conversion acceptance",
  perturbsMemoryAndTiming:true,acceptanceMetric:false,summedAllocatorTotal:null,allocationStackAttribution:false,
  phases,setupDelta:{rendererPrivateBytes:end.rendererPrivateBytes-ready.rendererPrivateBytes,
    rendererMallocAllocatedObjectsBytes:end.rendererMallocAllocatedObjectsBytes-ready.rendererMallocAllocatedObjectsBytes,
    rendererV8EffectiveBytes:end.rendererV8EffectiveBytes-ready.rendererV8EffectiveBytes},
  firstFrameCheckpointReached:false,actualEncodedFrames:0,actualFramesClosed:0,packedFrameBytes:0,
  decoderHeapBytes:r.browserResult.metrics.wasmMemoryBytes,configuredHardwarePreference:r.browserResult.encoder.selectedHardwarePreference,
  physicalHardwareSelectionProven:false,actualNativeAllocationStackOwner:null,
  stop:r.originalStartup.stop,perturbedWholeTree:{blankPrivateBytes:r.blankBaseline.privateBytes,peakPrivateBytes:r.memory.peak.privateBytes,
    incrementalPrivateMiB:r.memory.incrementalPrivateMiB,validSamples:r.memory.validSamples,unavailableSamples:r.memory.unavailableSamples},
  inference:"Large renderer malloc-category increase is already present during platform encoder setup before frame submission; exact allocation call/implementation remains unproven. Do not blame packed-frame copies or treat overlapping counters as additive.",
  nextAction:"Do not replay unchanged platform profile; investigate controllable fixed-heap CPU token-record representation with exact semantics/ABI/fidelity proof. No software-thread knob or GPU availability is assumed.",
  originalUnchanged:true,disposableDataRemoved:true,forbiddenRequests:0,fullOriginalConverted:false,speedGainProven:false,publicAcceptance:false};
assert.equal(report.setupDelta.rendererMallocAllocatedObjectsBytes,98248982);assert.equal(report.setupDelta.rendererV8EffectiveBytes,524288);
await writeFile(path.join(root,"evidence/2026-11-06-webcodecs-vp9-original-allocation-localization.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({phases:phases.map(p=>p.phase),setupDelta:report.setupDelta,firstFrameCheckpointReached:false,
  perturbedIncrementalPrivateMiB:r.memory.incrementalPrivateMiB,exactNativeStackOwner:null,disposableDataRemoved:true}));

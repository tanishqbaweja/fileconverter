// Retained OS observations only; no conversion, profiling replay or media read.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
assert.equal(process.argv.length,2);
const root=path.resolve(import.meta.dirname,".."),file="evidence/2026-11-06-webcodecs-vp9-original-startup-42231818045.json",
  r=JSON.parse(await readFile(path.join(root,file))),peak=r.memory.peak,MiB=1048576;
assert.equal(r.status,"failed-private-vp9-browser-smoke");assert.equal(r.originalStartup.stop.kind,"memory-budget-exceeded");
assert.equal(r.browserResult.encoder.frames,94);assert.equal(r.browserResult.nativeBrowserPlatformOnly,true);
assert.equal(r.browserResult.metrics.wasmMemoryBytes,33554432);
assert.equal(peak.processes.reduce((n,p)=>n+p.privateBytes,0),peak.privateBytes);
const sameBirth=(a,b)=>a.pid===b.pid&&a.parentPid===b.parentPid&&Math.abs(Date.parse(a.createdAt)-Date.parse(b.createdAt))<1;
const processes=peak.processes.map(p=>{
  const loaded=r.loadedIdle.processes.find(q=>sameBirth(p,q));
  return {pid:p.pid,parentPid:p.parentPid,createdAt:p.createdAt,executableName:p.executableName,
    typeFromSameBirthLoadedCensus:loaded?.type??null,peakPrivateBytes:p.privateBytes,
    loadedIdlePrivateBytes:loaded?.privateBytes??null,
    deltaFromLoadedBytes:loaded?p.privateBytes-loaded.privateBytes:null};
}).sort((a,b)=>b.peakPrivateBytes-a.peakPrivateBytes);
const largest=processes[0];assert.equal(largest.pid,34644);assert.equal(largest.typeFromSameBirthLoadedCensus,"renderer");
const n=r.nativeMemory,trace=[];
for(const bucket of n.graphBuckets.filter(b=>b.phase==="conversion"))for(const key of ["peak","last"]) {
  const sample=bucket[key];if(!sample)continue;
  const process=sample[7].find(row=>sameBirth(n.identities[row[0]],largest));
  trace.push({timestamp:sample[1],sequence:sample[0],wholeTreePrivateBytes:sample[3],largestRendererPrivateBytes:process?.[1]??null});
}
const report={recordedAt:new Date().toISOString(),scope:"Process-level localization of actual over-budget original platform run, NOT allocator ownership or optimization acceptance",
  sourceReport:file,nativeRunId:r.nativeTool.runId,
  primary:{blankPrivateBytes:r.blankBaseline.privateBytes,peakWholeTreePrivateBytes:peak.privateBytes,
    incrementalPrivateMiB:(peak.privateBytes-r.blankBaseline.privateBytes)/MiB,maximumIncrementalMiB:250,
    excessBytes:peak.privateBytes-r.blankBaseline.privateBytes-250*MiB,allPeakProcessBytesIncluded:true},
  processes,largestRenderer:largest,conversionBucketObservations:trace,
  actualEncodedFrames:94,actualEncodedPackets:r.browserResult.encoder.packets,closedFrames:r.browserResult.encoder.framesClosed,
  wasmHeapBytes:33554432,peakPackedFrameBytes:r.browserResult.encoder.peakPackedBytes,peakPacketBytes:r.browserResult.encoder.peakPacketBytes,
  nativeCodecAllocationOwners:null,jsRealmHeapOwnership:null,frameLeakProven:false,
  loadedDeltasAreDiagnosticNotAcceptance:true,missingObservationsAreNull:true,
  fullOriginalConverted:false,independentOriginalFidelityPassed:false,physicalHardwareSelectionProven:false,speedGainProven:false,publicAcceptance:false,
  nextAction:"Bounded CDP realm/native-memory allocation capture around platform encoder initialization/first frame; do not blame full-file buffering, reduce resolution, omit processes, disable services or replay unchanged conversion",
  userMediaReadOrConverted:false};
assert.equal(report.primary.incrementalPrivateMiB,335.40234375);assert.ok(report.primary.excessBytes>0);
await writeFile(path.join(root,"evidence/2026-11-06-webcodecs-vp9-original-memory-localization.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({incrementalPrivateMiB:report.primary.incrementalPrivateMiB,excessBytes:report.primary.excessBytes,
  largestRendererPid:largest.pid,largestRendererPrivateBytes:largest.peakPrivateBytes,deltaFromLoadedBytes:largest.deltaFromLoadedBytes,nativeCodecAllocationOwners:null}));

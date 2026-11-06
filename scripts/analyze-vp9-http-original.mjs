// Retained original9 observations only; no replay, excluded child, or new baseline.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
const root=path.resolve(import.meta.dirname,".."),file="evidence/2026-11-06-vp9-original-cpu-startup-attempt9.json",r=JSON.parse(await readFile(path.join(root,file))),
  peak=r.memory.peak,same=(a,b)=>a.pid===b.pid&&a.parentPid===b.parentPid&&Math.abs(Date.parse(a.createdAt)-Date.parse(b.createdAt))<1;
assert.equal(r.status,"failed-private-vp9-browser-smoke");assert.equal(r.memory.incrementalPrivateMiB,389.296875);
assert.equal(r.originalStartup.stop.kind,"memory-budget-exceeded");assert.equal(peak.processes.reduce((n,p)=>n+p.privateBytes,0),peak.privateBytes);
const late=peak.processes.filter(p=>!r.loadedIdle.processes.some(q=>same(p,q))).sort((a,b)=>b.privateBytes-a.privateBytes);
assert.equal(late.length,1);const child=late[0],rootIdentity=r.nativeMemory.identities.find(p=>p.type==="browser");assert.equal(child.parentPid,rootIdentity.pid);
const before=[];
for(const b of r.nativeMemory.graphBuckets.filter(b=>b.phase==="conversion"))for(const key of ["peak","last"]){const s=b[key];
  if(s&&Date.parse(s[1])<Date.parse(child.createdAt)&&s[3]!==null)before.push(s);}
assert.ok(before.length);const beforePeak=before.reduce((a,b)=>a[3]>=b[3]?a:b),
  report={recordedAt:new Date().toISOString(),sourceReport:file,executedHead:r.executedHead,
    scope:"Exact failed normal-HTTP original startup plus late-child timing localization, NOT complete output/fidelity or service-name attribution",
    primary:{blankPrivateBytes:r.blankBaseline.privateBytes,peakPrivateBytes:peak.privateBytes,incrementalPrivateMiB:r.memory.incrementalPrivateMiB,
      validSamples:r.memory.validSamples,unavailableSamples:r.memory.unavailableSamples,allPeakProcessesIncluded:true,peakProcessCount:peak.processes.length},
    safetyStop:r.originalStartup.stop,elapsedNativeMs:r.browserResult.elapsedMs,inputFileBytes:r.browserResult.sourceFileBytes,
    actualInputBytesRead:r.browserResult.metrics.inputBytes,actualOutputBytesWrittenBeforeAbort:r.browserResult.metrics.outputBytes,
    actualNativeWriteAttempts:r.browserResult.writeAttempts,wasmMemoryBytes:r.browserResult.metrics.wasmMemoryBytes,activeWorkerCount:r.browserResult.metrics.activeWorkerCount,
    actualEncodedFrameCount:null,completedOutputIndependentlyValidated:false,partialAfterAbortBytes:r.browserResult.partialOutputBytes,
    lateChild:{pid:child.pid,parentPid:child.parentPid,createdAt:child.createdAt,creationFileTime:child.creationFileTime,privateBytesAtWholeTreePeak:child.privateBytes,
      measuredSecondsAfterBrowserBirth:(Date.parse(child.createdAt)-Date.parse(rootIdentity.createdAt))/1000,
      type:null,utilitySubtype:null,sandboxType:null,whyUnavailable:"Native memory identity table preserves birth but deliberately reports unknown type; no contemporaneous subtype census was retained. Cannot recover a terminated child's command line."},
    beforeLateBirth:{retainedBucketObservations:before.length,timestamp:beforePeak[1],wholeTreePrivateBytes:beforePeak[3],
      incrementalFromSameBlankMiB:(beforePeak[3]-r.blankBaseline.privateBytes)/1048576,diagnosticOnly:true,notAnAlternateAcceptanceWindow:true},
    sourceUnchanged:JSON.stringify(r.originalBefore)===JSON.stringify(r.originalAfter),
    ownedCleanupComplete:r.originalStartup.partialOutputRemoved&&r.ownedRuntimeRemoved&&r.ownedStaticStageRemoved&&r.privateCpuOverride.stageRemoved,
    processRootsAbsent:r.processCleanup.every(x=>x.status==="owned-identity-absent"),forbiddenRequests:r.forbiddenRequests.length,
    fullOriginalConverted:false,independentFullFidelityPassed:false,speedGainProven:false,publicAcceptance:false,
    nextAction:"Keep failures/constraints. Add bounded birth-identity-matched process-type diagnostics for future in-scope browser tests, then continue independent incomplete project work. Do not replay this original unchanged, name an unobserved service, disable services or exclude child memory."};
assert.equal(report.actualOutputBytesWrittenBeforeAbort,20868532);assert.equal(report.actualNativeWriteAttempts,88);
assert.equal(report.lateChild.privateBytesAtWholeTreePeak,247611392);
await writeFile(path.join(root,"evidence/2026-11-06-vp9-http-original9-localization.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({incrementalPrivateMiB:report.primary.incrementalPrivateMiB,outputBytes:report.actualOutputBytesWrittenBeforeAbort,elapsedMs:report.elapsedNativeMs,
  lateChildBytes:child.privateBytes,childType:null,preBirthDiagnosticIncrementMiB:report.beforeLateBirth.incrementalFromSameBlankMiB,cleaned:report.ownedCleanupComplete}));

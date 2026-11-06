// Retained exact OS evidence only; no user-media read or conversion replay.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
const root=path.resolve(import.meta.dirname,".."),file="evidence/2026-11-06-vp9-original-cpu-startup-attempt8.json",r=JSON.parse(await readFile(path.join(root,file))),
  sha=b=>createHash("sha256").update(b).digest("hex"),same=(a,b)=>a.pid===b.pid&&a.parentPid===b.parentPid&&Math.abs(Date.parse(a.createdAt)-Date.parse(b.createdAt))<1;
assert.equal(r.status,"failed-private-vp9-browser-smoke");assert.equal(r.originalStartup.stop.kind,"memory-budget-exceeded");
assert.equal(r.memory.incrementalPrivateMiB,253.0546875);assert.equal(r.memory.peak.processes.reduce((n,p)=>n+p.privateBytes,0),r.memory.peak.privateBytes);
const processes=r.memory.peak.processes.map(p=>{const before=r.loadedIdle.processes.find(q=>same(p,q));return {pid:p.pid,parentPid:p.parentPid,createdAt:p.createdAt,
  typeFromSameBirthLoadedCensus:before?.type??null,peakPrivateBytes:p.privateBytes,loadedPrivateBytes:before?.privateBytes??null,
  deltaFromLoadedBytes:before?p.privateBytes-before.privateBytes:null};}).sort((a,b)=>b.peakPrivateBytes-a.peakPrivateBytes),
  core=await readFile(path.join(root,"node_modules/playwright-core/lib/coreBundle.js")),responder=await readFile(path.join(root,"scripts/lib/vp9-duration-browser-assets.mjs"));
assert.ok(core.includes(Buffer.from('body = buffer.toString("base64")')));assert.ok(responder.includes(Buffer.from('route.fulfill({ status: 200, headers, path: asset.path })')));
const report={recordedAt:new Date().toISOString(),sourceReport:file,executedHead:r.executedHead,nativeRunId:42244170876,
  scope:"Original packed-token primary failure/process localization plus static transport source inspection, NOT accepted optimization or exact allocation-stack attribution",
  primary:{blankPrivateBytes:r.blankBaseline.privateBytes,peakWholeTreePrivateBytes:r.memory.peak.privateBytes,incrementalPrivateMiB:r.memory.incrementalPrivateMiB,
    excessBytes:r.memory.peak.privateBytes-r.blankBaseline.privateBytes-250*1048576,maximumIncrementalMiB:250,validSamples:r.memory.validSamples,unavailableSamples:r.memory.unavailableSamples,
    allPeakProcessBytesIncluded:true},processes,
  native:{wasmHeapBytes:r.browserResult.metrics.wasmMemoryBytes,heapMaximumBytes:100663296,explicitCpuOnly:true,
    actualEncodedFrames:null,whyFrameCountNull:"CPU terminal does not expose a validated encoded-frame counter; 485B mux header is not proof of frames or zero frames.",
    outputBytesBeforeAbort:r.browserResult.metrics.outputBytes,partialOutputBytes:r.browserResult.partialOutputBytes,
    allocationFailureSampleAvailable:r.allocationDiagnostics.available},
  transportInspection:{responderSha256:sha(responder),installedPlaywrightCoreSha256:sha(core),
    staticWasmBytes:9877633,privateCandidateDeliveredViaDevtoolsFulfill:true,installedFulfillPathReadsStaticFileAndBase64Encodes:true,
    thisIsStaticEngineNotUserFileCopy:true,exactRootProcessAllocationOwner:null,
    hypothesis:"Browser root increases 30502912B during this test. Static Wasm delivery via DevTools/base64 may add harness overhead; this is not yet proof of its share of private memory.",
    nextChangedControl:"Deliver same authenticated private static module/Wasm over existing production HTTP server, redirect only URLs (no response body in DevTools). Preserve all processes, same blank baseline, full input/settings and exact250MiB gate. Validate headers/bytes/fidelity/recovery before new original run."},
  loadedDeltasDiagnosticOnly:true,fullOriginalConverted:false,independentFullFidelityPassed:false,speedGainProven:false,publicAcceptance:false,
  sourceUnchanged:JSON.stringify(r.originalBefore)===JSON.stringify(r.originalAfter),disposableDataRemoved:r.ownedRuntimeRemoved&&r.ownedStaticStageRemoved&&r.originalStartup.partialOutputRemoved,
  forbiddenRequests:r.forbiddenRequests.length};
assert.equal(report.primary.excessBytes,3203072);assert.equal(processes.find(p=>p.typeFromSameBirthLoadedCensus==="browser").deltaFromLoadedBytes,30502912);
await writeFile(path.join(root,"evidence/2026-11-06-vp9-token-packed-original-memory-localization.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({incrementalPrivateMiB:report.primary.incrementalPrivateMiB,excessBytes:report.primary.excessBytes,wholeTreeProcesses:processes.length,
  browserRootDeltaBytes:30502912,transportOverheadAttributionProven:false,actualEncodedFrames:null}));

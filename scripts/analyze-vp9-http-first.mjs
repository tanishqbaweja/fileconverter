// Retained reports/trace only. No user media or browser conversion replay.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {unzipSync} from "fflate";
const root=path.resolve(import.meta.dirname,".."),file="evidence/2026-11-06-vp9-token-packed-http-qualification-42244170876.json",r=JSON.parse(await readFile(path.join(root,file))),
  sha=b=>createHash("sha256").update(b).digest("hex"),trace=await readFile(path.join(root,r.failureTrace.path));
assert.equal(r.status,"failed-private-vp9-browser-smoke");assert.equal(r.memory.incrementalPrivateMiB,264.25390625);
assert.equal(r.independentFidelity.passed,true);assert.equal(r.browserResult.metrics.outputBytes,99413);assert.equal(r.recovery,undefined);
assert.equal(r.normalHttpEngineDelivery,true);assert.deepEqual(r.privateCpuOverride.errors,[]);assert.equal(r.privateCpuOverride.stageRemoved,true);
assert.equal(sha(trace),r.failureTrace.sha256);assert.ok(trace.length<=8388608);
let total=0,count=0;const members=unzipSync(trace,{filter(entry){assert.ok(++count<=256);total+=entry.originalSize;assert.ok(entry.originalSize<=16777216&&total<=33554432);return true;}}),
  wasm=Object.entries(members).filter(([name])=>name.endsWith(".wasm")).map(([name,bytes])=>({name,bytes:bytes.length,sha256:sha(bytes)}));
assert.equal(wasm.length,2);assert.ok(wasm.some(x=>x.bytes===9877633&&x.sha256==="436db67db8c5c21aa862c4fb71de6fc1e2bc1344ee31c8beb084b102065118c5"));
const same=(a,b)=>a.pid===b.pid&&a.parentPid===b.parentPid&&Math.abs(Date.parse(a.createdAt)-Date.parse(b.createdAt))<1,
  processes=r.memory.peak.processes.map(p=>{const before=r.loadedIdle.processes.find(q=>same(p,q));return {pid:p.pid,parentPid:p.parentPid,createdAt:p.createdAt,
    typeFromSameBirthLoadedCensus:before?.type??null,peakPrivateBytes:p.privateBytes,loadedPrivateBytes:before?.privateBytes??null,
    deltaFromLoadedBytes:before?p.privateBytes-before.privateBytes:null};}).sort((a,b)=>b.peakPrivateBytes-a.peakPrivateBytes),
  report={recordedAt:new Date().toISOString(),sourceReport:file,executedHead:r.executedHead,
    scope:"First HTTP-only delivery failure localization and exact trace contents, NOT accepted optimization or proven native allocation owner",
    primary:{blankPrivateBytes:r.blankBaseline.privateBytes,peakPrivateBytes:r.memory.peak.privateBytes,incrementalPrivateMiB:r.memory.incrementalPrivateMiB,
      validSamples:r.memory.validSamples,unavailableSamples:r.memory.unavailableSamples,allPeakProcessBytesIncluded:true},processes,
    actualHttpEngineHashesAndHeadersPassed:true,outputBitExact:true,independentInitialFidelityPassed:true,recoveryNotRun:true,
    trace:{...r.failureTrace,wasmBodies:wasm,wholeEngineBodiesCaptured:true,userMediaBodiesCaptured:false},
    installedTracingTypeDoc:"snapshots: true captures DOM snapshots on actions and records network activity; these static response bodies are present in the actual retained trace.",
    exactTraceOverheadPrivateBytes:null,wholeFailureRemainsFailed:true,
    nextChangedControl:"Keep screenshot/API traces and bounded32-request metadata, omit DOM/network response-body snapshots. Keep all conversion checks, native/input/settings, blank baseline, all Chrome processes and250MiB unchanged. Retain both failures.",
    originalUnchanged:JSON.stringify(r.originalBefore)===JSON.stringify(r.originalAfter),disposableDataRemoved:r.ownedRuntimeRemoved&&r.ownedStaticStageRemoved&&r.privateCpuOverride.stageRemoved,
    processRootsAbsent:r.processCleanup.every(x=>x.status==="owned-identity-absent"),forbiddenRequests:r.forbiddenRequests.length,
    fullOriginalConverted:false,speedGainProven:false,publicAcceptance:false};
assert.equal(processes.reduce((n,p)=>n+p.peakPrivateBytes,0),report.primary.peakPrivateBytes);
await writeFile(path.join(root,"evidence/2026-11-06-vp9-http-first-localization.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({incrementalPrivateMiB:r.memory.incrementalPrivateMiB,wasmBodies:wasm.map(x=>x.bytes),exactTraceOverheadPrivateBytes:null,cleaned:report.disposableDataRemoved}));

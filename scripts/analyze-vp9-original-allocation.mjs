// Arithmetic on authenticated terminal measurements, not a new conversion.
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
assert.equal(process.argv.length,2);
const root=path.resolve(import.meta.dirname,".."),file="evidence/2026-11-06-vp9-original-cpu-startup-attempt5.json",
  r=JSON.parse(await readFile(path.join(root,file))),d=r.allocationDiagnostics;
assert.equal(r.status,"failed-private-vp9-browser-smoke");assert.equal(d.available,true);assert.equal(d.site,"new-frame");
assert.equal(d.wasmHeapBytes,100663296);assert.equal(d.wasmHeapMaximumBytes,d.wasmHeapBytes);
const remaining=d.allocatorFreeBytes+d.allocatorUnclaimedBytes,shortfall=d.frameRequestBytes-remaining;
assert.ok(shortfall>0);
const alignedWidth=(d.width+7)&~7,alignedHeight=(d.height+7)&~7,stride=(alignedWidth+2*d.border+31)&~31,
  y=(alignedHeight+2*d.border)*stride+d.alignment,
  uv=((alignedHeight>>1)+2*(d.border>>1))*(stride>>1)+d.alignment;
assert.equal(y+2*uv,d.frameRequestBytes);
const report={recordedAt:new Date().toISOString(),scope:"Actual original failure capacity diagnosis, NOT completed conversion or accepted memory reduction",
  sourceReport:file,nativeRunId:r.privateCpuOverride.runId,measurements:d,
  frameFormula:{pixelFormat:"8-bit yuv420p",alignedWidth,alignedHeight,stride,yPlaneBytes:y,uvPlaneBytes:uv,totalBytes:y+2*uv},
  allocatorFreePlusUnclaimedBytes:remaining,frameRequestShortfallAtLeastBytes:shortfall,
  shortfallExcludesUnderlyingAllocationOverhead:true,heapWasAtDeclaredMaximum:true,
  earlierJsProgressHeapBytes:r.browserResult.metrics.wasmMemoryBytes,
  actualFailureHeapMinusLastProgressBytes:d.wasmHeapBytes-r.browserResult.metrics.wasmMemoryBytes,
  otherAllocationOwnershipNotProven:true,newMemoryReductionImplemented:false,
  nextAction:"Audit preallocated utility/scaling buffers and their consumers/stride/cleanup invariants for lazy allocation; do not clip required frame bounds, raise limits, or replay unchanged original",
  userMediaReadOrConverted:false,publicAcceptance:false};
await writeFile(path.join(root,"evidence/2026-11-06-vp9-original-allocation-capacity.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({frameRequestBytes:d.frameRequestBytes,freePlusUnclaimedBytes:remaining,shortfallAtLeastBytes:shortfall,actualFailureHeapBytes:d.wasmHeapBytes}));

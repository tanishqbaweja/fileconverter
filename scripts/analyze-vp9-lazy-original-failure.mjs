// Terminal evidence and exact wrapper source only, never media conversion.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
assert.equal(process.argv.length,2);const root=path.resolve(import.meta.dirname,".."),json=async f=>JSON.parse(await readFile(path.join(root,f)));
const prior=await json("evidence/2026-11-06-vp9-original-cpu-startup-attempt5.json"),
  current=await json("evidence/2026-11-06-vp9-original-cpu-startup-attempt6.json"),
  native=await json("evidence/2026-11-06-vp9-original-width-native-42218018139.json");
assert.match(prior.browserResult.message,/FB allocation failed site=new-frame/);
assert.doesNotMatch(current.browserResult.message,/FB allocation failed|Failed to allocate lazy scaled frame|Failed to allocate last frame buffer/);
assert.match(current.browserResult.message,/\[hevc .*Error parsing NAL unit #0/);
assert.match(current.browserResult.message,/Out of memory/);assert.equal(current.allocationDiagnostics.available,false);
const sourceFile="work/vp9-duration-input-42218018139/within_remux.duration.c",source=await readFile(path.join(root,sourceFile),"utf8"),
  sha256=createHash("sha256").update(source).digest("hex");
assert.equal(sha256,native.nativeContract.candidate.compiledWrapperSha256);
const guard="  if (encoder->width != decoder->width ||\n      encoder->height != decoder->height) {";
const start=source.indexOf(guard),end=source.indexOf("\n  }\n",start);assert.ok(start>0&&end>start);
assert.ok(source.slice(start,end).includes("converted_frame = av_frame_alloc()"));
assert.ok(source.includes("    AVFrame *frame_to_encode = pipeline->decoded_frame;"));
const r={recordedAt:new Date().toISOString(),scope:"Changed actual original failure and rejected duplicate-scaling-copy hypothesis, NOT completed conversion/optimization acceptance",
  priorNativeRunId:prior.privateCpuOverride.runId,lazyNativeRunId:current.privateCpuOverride.runId,
  priorFailure:"VP9 new-frame allocation",currentFailure:"HEVC decoder reports out of memory while parsing NAL unit #0",
  vp9AllocationFailureNotPresentInCurrentLog:true,encodedOutputFramesVerified:null,
  lastObservedWasmBytes:current.browserResult.metrics.wasmMemoryBytes,declaredMaximumWasmBytes:100663296,
  currentFailureAllocatorRequestBytes:null,currentFailureAllocatorFreeBytes:null,previousFailureStatisticsNotReused:true,
  wrapper:{file:sourceFile,sha256,matchingGeometryUsesDecodedFrameDirectly:true,conversionFrameAllocatedOnlyForGeometryChange:true,
    exactAllocationGuard:guard},
  rejectedNextChange:"Do not remove a nonexistent unconditional scaling copy: the pinned wrapper already bypasses it at matching dimensions",
  nextAction:"Attribute coupled HEVC/VP9 live allocations; audit token/context record storage or qualify the existing platform-encoder path at original dimensions before another changed run",
  fullOriginalConverted:false,independentFullFidelityPassed:false,actualSavedBytes:null,publicAcceptance:false,userMediaReadOrConverted:false};
await writeFile(path.join(root,"evidence/2026-11-06-vp9-lazy-original-failure-analysis.json"),JSON.stringify(r,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({newFailure:r.currentFailure,lastObservedWasmBytes:r.lastObservedWasmBytes,currentFailureAllocatorRequestBytes:null,matchingGeometryUsesDecodedFrameDirectly:true}));

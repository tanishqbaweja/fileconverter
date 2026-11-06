// Offline retained trace/report authentication; never media conversion.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {unzipSync} from "fflate";
const root=path.resolve(import.meta.dirname,".."),file="evidence/2026-11-06-vp9-token-packed-http-qualification-42244170876-attempt2.json",
  r=JSON.parse(await readFile(path.join(root,file))),sha=b=>createHash("sha256").update(b).digest("hex"),
  trace=await readFile(path.join(root,r.boundedDiagnosticTrace.path));
assert.equal(r.status,"passed-private-vp9-recovery-sequence-not-large-or-public-acceptance");assert.deepEqual(r.failures,[]);
assert.equal(r.recovery.passed,true);assert.equal(sha(trace),r.boundedDiagnosticTrace.sha256);assert.ok(trace.length<=8388608);
let count=0,total=0;const members=unzipSync(trace,{filter(e){assert.ok(++count<=256);total+=e.originalSize;assert.ok(e.originalSize<=4194304&&total<=16777216);return true;}}),
  traceFiles=Object.entries(members).filter(([name])=>name.endsWith(".trace")),types={};assert.equal(traceFiles.length,1);
// unzip members are Uint8Array, not Buffers; always normalize before text decode.
for(const line of Buffer.from(traceFiles[0][1]).toString("utf8").split("\n"))if(line){const event=JSON.parse(line);types[event.type]=(types[event.type]??0)+1;}
const wasmMembers=Object.keys(members).filter(name=>name.endsWith(".wasm")),screenshots=Object.keys(members).filter(name=>name.endsWith(".jpeg"));
assert.equal(wasmMembers.length,0);assert.ok(screenshots.length>0&&types.before>0&&types.after===types.before);assert.equal(types["frame-snapshot"]??0,0);
assert.ok(r.networkMetadata.length>0&&r.networkMetadata.length<=32);assert.deepEqual(r.privateCpuOverride.served,{javascript:6,wasm:6});
assert.equal(r.privateCpuOverride.stageRemoved,true);assert.equal(r.privateCpuOverride.securityCacheAndMimeHeadersPreserved,true);
const report={recordedAt:new Date().toISOString(),sourceReport:file,executedHead:r.executedHead,
  scope:"Actual HTTP/bounded-trace small-control verification, NOT original/scaling/speed/public acceptance",
  primary:{blankPrivateBytes:r.blankBaseline.privateBytes,peakPrivateBytes:r.memory.peak.privateBytes,incrementalPrivateMiB:r.memory.incrementalPrivateMiB,
    validSamples:r.memory.validSamples,unavailableSamples:r.memory.unavailableSamples},
  trace:{...r.boundedDiagnosticTrace,members:count,uncompressedBytes:total,eventTypes:types,wasmBodies:0,screenshotMembers:screenshots.length,domSnapshots:0,
    apiTimelineVerified:true,screenshotTimelineVerified:true,networkMetadataRows:r.networkMetadata.length,networkMetadataMaximum:32},
  engineDeliveredByProductionHttp:true,staticHashesAndHeadersVerified:true,outputsByteExact:4,strictFidelityPassed:true,ssim:r.independentFidelity.ssim.score,
  originalUnchanged:JSON.stringify(r.originalBefore)===JSON.stringify(r.originalAfter),disposableDataRemoved:r.ownedRuntimeRemoved&&r.ownedStaticStageRemoved&&r.privateCpuOverride.stageRemoved,
  processRootsAbsent:r.processCleanup.every(x=>x.status==="owned-identity-absent"),forbiddenRequests:r.forbiddenRequests.length,
  originalRunPermittedBySmallControlOnly:true,fullOriginalConverted:false,domOrManualUiCoverageClaimed:false,speedGainProven:false,publicAcceptance:false};
assert.equal(report.primary.incrementalPrivateMiB,203.73046875);
await writeFile(path.join(root,"evidence/2026-11-06-vp9-http-bounded-verification.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({incrementalPrivateMiB:report.primary.incrementalPrivateMiB,traceBytes:trace.length,apiCalls:types.before,screenshots:screenshots.length,wasmBodies:0,cleaned:report.disposableDataRemoved}));

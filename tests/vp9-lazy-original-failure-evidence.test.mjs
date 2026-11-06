import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),
  base="evidence/2026-11-06-vp9-original-cpu-startup-attempt6",r=await json(base+".json");
test("lazy original failure is decoder ENOMEM, never full-original conversion acceptance",()=>{
  assert.equal(r.executedHead,"fca2ae63f01ae1f6da260986b468c0c27139f28b");
  assert.equal(r.privateCpuOverride.runId,42218018139);assert.equal(r.status,"failed-private-vp9-browser-smoke");
  assert.equal(r.browserResult.sourceFileBytes,2958573265);assert.equal(r.browserResult.sourceCopied,false);
  assert.equal(r.browserResult.nativeBrowserCpuOnly,true);
  assert.match(r.browserResult.message,/\[hevc .*Error parsing NAL unit #0/);
  assert.match(r.browserResult.message,/Out of memory/);
  assert.doesNotMatch(r.browserResult.message,/FB allocation failed|Failed to allocate lazy scaled frame|Failed to allocate last frame buffer/);
  assert.equal(r.allocationDiagnostics.available,false);
  assert.equal(r.browserResult.metrics.wasmMemoryBytes,100663296);
  assert.equal(r.browserResult.metrics.outputBytes,485);
  assert.equal(r.originalStartup.fullOriginalConverted,false);assert.equal(r.originalStartup.independentFullFidelityPassed,false);
  assert.equal(r.publicAcceptance,false);assert.equal(r.speedGainProven,false);
  assert.equal(r.memory.incrementalPrivateMiB,206.9140625);assert.equal(r.memory.validSamples,35);assert.equal(r.memory.unavailableSamples,0);
  assert.equal(r.memory.incrementalPrivateMiB,(r.memory.peak.privateBytes-r.blankBaseline.privateBytes)/1048576);
});
test("failed original output and obsolete owned static tool are cleaned, original unchanged, raw evidence lossless",async()=>{
  assert.equal(r.browserResult.cleanupComplete,true);assert.equal(r.browserResult.partialOutputBytes,0);
  assert.equal(r.originalStartup.partialOutputRemoved,true);assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);
  assert.equal(r.processCleanup.length,3);assert.ok(r.processCleanup.every(p=>p.status==="owned-identity-absent"));
  assert.equal(r.failures.length,1);assert.doesNotMatch(r.failures[0],/Owned process cleanup:/);
  assert.deepEqual(r.originalBefore,r.originalAfter);assert.equal(r.originalAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.deepEqual(r.forbiddenRequests,[]);
  const raw=gunzipSync(await read(r.rawArchive.file),{maxOutputLength:8388608});assert.equal(raw.length,273730);
  assert.equal(createHash("sha256").update(raw).digest("hex"),r.rawArchive.decodedSha256);
  assert.equal((await json(base+"-archive.json")).retainedBytes,100801);
  const cleanup=await json("evidence/2026-11-06-vp9-diagnostic-superseded-input-cleanup.json");
  assert.equal(cleanup.removed,true);assert.equal(cleanup.files,27);assert.equal(cleanup.bytes,11221430);
  assert.equal(cleanup.sourcePreimagesRetainedWithReplacement,true);assert.equal(cleanup.userMediaReadOrRemoved,false);
});
test("failure analysis rejects duplicate-scaling-copy work and does not reuse prior allocation statistics",async()=>{
  const a=await json("evidence/2026-11-06-vp9-lazy-original-failure-analysis.json");
  assert.equal(a.lazyNativeRunId,42218018139);assert.equal(a.priorNativeRunId,42135708757);
  assert.equal(a.wrapper.matchingGeometryUsesDecodedFrameDirectly,true);
  assert.equal(a.wrapper.conversionFrameAllocatedOnlyForGeometryChange,true);
  assert.equal(a.currentFailureAllocatorRequestBytes,null);assert.equal(a.currentFailureAllocatorFreeBytes,null);
  assert.equal(a.encodedOutputFramesVerified,null);assert.equal(a.actualSavedBytes,null);
  assert.equal(a.fullOriginalConverted,false);assert.equal(a.independentFullFidelityPassed,false);assert.equal(a.publicAcceptance,false);
});

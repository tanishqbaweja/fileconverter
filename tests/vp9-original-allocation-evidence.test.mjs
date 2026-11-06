import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),base="evidence/2026-11-06-vp9-original-cpu-startup-attempt5",
  r=await json(base+".json");
test("actual full-original CPU diagnostic identifies exact new-frame allocation at maximum heap without conversion success",()=>{
  assert.equal(r.executedHead,"a10ca65ce0ddd932d2eaf8059f4b2fe8a86d8d83");assert.equal(r.privateCpuOverride.runId,42135708757);
  assert.equal(r.status,"failed-private-vp9-browser-smoke");assert.equal(r.browserResult.nativeBrowserCpuOnly,true);
  assert.equal(r.browserResult.sourceFileBytes,2958573265);assert.equal(r.browserResult.sourceCopied,false);
  const d=r.allocationDiagnostics;assert.equal(d.available,true);assert.equal(d.site,"new-frame");
  assert.equal(d.frameRequestBytes,3790080);assert.equal(d.wasmHeapBytes,100663296);assert.equal(d.wasmHeapMaximumBytes,100663296);
  assert.equal(d.allocatorManagedBytes,91729032);assert.equal(d.allocatorFreeBytes,78312);assert.equal(d.allocatorUnclaimedBytes,3084744);
  assert.equal(d.frameRequestIsUnderlyingMallocRequest,false);assert.equal(d.primaryWholeBrowserMemoryMetric,false);
  assert.equal(r.browserResult.metrics.wasmMemoryBytes,76283904);assert.equal(r.originalStartup.passedStartupOnly,false);
  assert.equal(r.originalStartup.fullOriginalConverted,false);assert.equal(r.originalStartup.independentFullFidelityPassed,false);
  assert.equal(r.memory.incrementalPrivateMiB,184.63671875);assert.equal(r.memory.validSamples,35);assert.equal(r.memory.unavailableSamples,0);
  assert.equal(r.memory.incrementalPrivateMiB,(r.memory.peak.privateBytes-r.blankBaseline.privateBytes)/1048576);
});
test("capacity analysis proves geometry request and minimum shortfall without guessing live allocation owners",async()=>{
  const a=await json("evidence/2026-11-06-vp9-original-allocation-capacity.json");
  assert.equal(a.frameFormula.totalBytes,3790080);assert.equal(a.allocatorFreePlusUnclaimedBytes,3163056);
  assert.equal(a.frameRequestShortfallAtLeastBytes,627024);assert.equal(a.actualFailureHeapMinusLastProgressBytes,24379392);
  assert.equal(a.shortfallExcludesUnderlyingAllocationOverhead,true);assert.equal(a.otherAllocationOwnershipNotProven,true);
  assert.equal(a.newMemoryReductionImplemented,false);assert.equal(a.publicAcceptance,false);
});
test("original taskkill error remains failed while separate read-only census proves all retained owned births absent",async()=>{
  assert.ok(r.failures.some(line=>line.includes("Owned process cleanup:")));assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);
  assert.equal(r.browserResult.cleanupComplete,true);assert.equal(r.browserResult.partialOutputBytes,0);assert.equal(r.originalStartup.partialOutputRemoved,true);
  const census=await json(base+"-cleanup-followup.json");
  assert.equal(census.reportedFailedChild,39528);assert.equal(census.proofs.length,39);assert.equal(census.querySucceeded,true);
  assert.equal(census.allObservedOwnedBirthsAbsent,true);assert.ok(census.proofs.every(p=>p.status==="owned-birth-absent"));
  assert.equal(census.noProcessesKilled,true);assert.equal(census.originalConversionSucceeded,false);
  const packed=await read(r.rawArchive.file),raw=gunzipSync(packed,{maxOutputLength:8388608});
  assert.equal(raw.length,283766);assert.equal(createHash("sha256").update(raw).digest("hex"),r.rawArchive.decodedSha256);
  const archive=await json(base+"-archive.json");assert.equal(archive.retainedBytes,101802);
  assert.deepEqual(r.originalBefore,r.originalAfter);assert.equal(r.originalAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.deepEqual(r.forbiddenRequests,[]);
  const cleanup=await json("evidence/2026-11-06-vp9-temporal-superseded-input-cleanup.json");
  assert.equal(cleanup.removed,true);assert.equal(cleanup.files,20);assert.equal(cleanup.bytes,10925830);
  assert.equal(cleanup.sourcePreimagesRetainedWithReplacement,true);assert.equal(cleanup.userMediaReadOrRemoved,false);
});
test("complete pinned utility reference audit preserves required stride/scaling consumers instead of claiming safe deletion",async()=>{
  const a=await json("evidence/2026-11-06-vp9-utility-buffer-source-audit.json");
  assert.equal(a.archiveSha256,"7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c");
  assert.equal(a.cFiles,880);assert.equal(a.references.length,6);assert.equal(Object.keys(a.functions).length,4);
  assert.ok(a.functions.vp9_scale_if_required.exactSource.startsWith("YV12_BUFFER_CONFIG"));
  assert.ok(a.functions.vp9_scale_if_required.exactSource.includes("cm->mi_cols * MI_SIZE != unscaled->y_width"));
  assert.ok(a.functions.init_motion_estimation.exactSource.includes("cpi->scaled_source.y_stride"));
  for(const f of Object.values(a.functions))assert.equal(createHash("sha256").update(f.exactSource).digest("hex"),f.sha256);
  assert.equal(a.candidateImplemented,false);assert.equal(a.actualSavedBytes,null);assert.equal(a.publicAcceptance,false);
});

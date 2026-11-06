import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),
  base="evidence/2026-11-06-vp9-original-cpu-startup-attempt7",r=await json(base+".json");
test("actual full-original token build fails frame allocation at fixed heap maximum, not a completed conversion despite OS memory under250",()=>{
  assert.equal(r.executedHead,"b756e93ef305c1e802240abf1b8ef7393c5cbc18");assert.equal(r.privateCpuOverride.runId,42226266102);
  assert.equal(r.status,"failed-private-vp9-browser-smoke");assert.equal(r.browserResult.sourceFileBytes,2958573265);
  assert.equal(r.browserResult.sourceCopied,false);assert.equal(r.browserResult.nativeBrowserCpuOnly,true);
  assert.equal(r.browserResult.metrics.outputBytes,485);assert.match(r.browserResult.message,/FB allocation failed site=new-frame/);
  const d=r.allocationDiagnostics;assert.equal(d.available,true);assert.equal(d.site,"new-frame");
  assert.equal(d.frameRequestBytes,3790080);assert.equal(d.wasmHeapBytes,100663296);assert.equal(d.wasmHeapMaximumBytes,100663296);
  assert.equal(d.allocatorManagedBytes,94106256);assert.equal(d.allocatorFreeBytes,42820);assert.equal(d.allocatorUnclaimedBytes,707520);
  assert.equal(d.frameRequestIsUnderlyingMallocRequest,false);
  assert.equal(r.blankBaseline.privateBytes,347467776);assert.equal(r.memory.peak.privateBytes,598384640);
  assert.equal(r.memory.incrementalPrivateMiB,239.29296875);assert.equal(r.memory.validSamples,32);assert.equal(r.memory.unavailableSamples,0);
  assert.equal(r.memory.incrementalPrivateMiB,(r.memory.peak.privateBytes-r.blankBaseline.privateBytes)/1048576);
  assert.equal(r.originalStartup.fullOriginalConverted,false);assert.equal(r.originalStartup.independentFullFidelityPassed,false);
  assert.equal(r.publicAcceptance,false);assert.equal(r.speedGainProven,false);
});
test("new actual capacity measurement proves remaining shortfall without assigning unmeasured live codec owners",async()=>{
  const a=await json("evidence/2026-11-06-vp9-token-original-allocation-capacity.json");
  assert.equal(a.nativeRunId,42226266102);assert.equal(a.frameFormula.totalBytes,3790080);
  assert.equal(a.allocatorFreePlusUnclaimedBytes,750340);assert.equal(a.frameRequestShortfallAtLeastBytes,3039740);
  assert.equal(a.shortfallExcludesUnderlyingAllocationOverhead,true);assert.equal(a.otherAllocationOwnershipNotProven,true);
  assert.equal(a.newMemoryReductionImplemented,false);assert.equal(a.publicAcceptance,false);
});
test("taskkill error remains recorded; independent census proves38 observed owned births absent without killing, original unchanged",async()=>{
  assert.equal(r.failures.length,2);assert.ok(r.failures.some(f=>f.includes("Owned process cleanup:")&&f.includes("41936")));
  const census=await json(base+"-cleanup-followup.json");assert.equal(census.reportedFailedChild,41936);assert.equal(census.proofs.length,38);
  assert.equal(census.querySucceeded,true);assert.equal(census.allObservedOwnedBirthsAbsent,true);assert.equal(census.noProcessesKilled,true);
  assert.ok(census.proofs.every(p=>p.status==="owned-birth-absent"));
  assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);assert.equal(r.browserResult.cleanupComplete,true);
  assert.equal(r.browserResult.partialOutputBytes,0);assert.equal(r.originalStartup.partialOutputRemoved,true);
  assert.deepEqual(r.originalBefore,r.originalAfter);assert.equal(r.originalAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.deepEqual(r.forbiddenRequests,[]);
  const raw=gunzipSync(await read(r.rawArchive.file),{maxOutputLength:8388608});assert.equal(raw.length,292238);
  assert.equal(createHash("sha256").update(raw).digest("hex"),r.rawArchive.decodedSha256);
  assert.equal((await json(base+"-archive.json")).retainedBytes,102595);
});

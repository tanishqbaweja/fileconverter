// Portable retained-report checks; no browser or private binary replay.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const prefix="evidence/2026-11-20-vp9-cpu-specialist-original-startup-44735542199",
  read=f=>readFile(new URL("../"+f,import.meta.url)),bytes=await read(prefix+".json"),r=JSON.parse(bytes),a=JSON.parse(await read(prefix+"-analysis.json")),
  sha=b=>createHash("sha256").update(b).digest("hex");
test("actual original specialist fails exact same-blank whole-tree250MiB gate; complete journal agrees with online peak",()=>{
  assert.equal(sha(bytes),"59ee51e70d057c3ce19e22552774d6c238657015d34af144092059b9dd2e5b6e");assert.equal(a.sourceReportSha256,sha(bytes));
  assert.equal(r.status,"failed-private-vp9-browser-smoke");assert.equal(r.executedHead,"074866e66fa9b0d8618460819e53cc1d0019ded6");
  const p=r.nativeJournal.summary.native.phases.find(p=>p.phase==="conversion");
  assert.equal(p.peak[3],719859712);assert.equal(p.peak[3],r.memory.peak.privateBytes);
  assert.equal(p.peak[7].reduce((n,row)=>n+row[1],0),p.peak[3]);
  assert.equal((p.peak[3]-r.blankBaseline.privateBytes)/1048576,380.58203125);
  assert.equal(a.primary.incrementalPrivateMiB,380.58203125);assert.equal(p.validSamples,1420);assert.equal(p.unavailableSamples,0);
  assert.equal(r.originalStartup.stop.kind,"memory-budget-exceeded");assert.equal(r.nativeJournal.records,1675);
  assert.equal(r.nativeJournal.complete,true);assert.equal(r.nativeJournal.readbackVerified,true);assert.equal(r.nativeJournal.rawRemoved,true);
  assert.equal(a.nativeJournal.completeStreamingReplayVerified,true);assert.equal(a.nativeJournal.archiveSha256,r.nativeJournal.archiveSha256);
});
test("model-service label belongs to this exact captured birth and remains included, never an app-causation or alternate-baseline claim",()=>{
  const c=a.lateChild,match=r.nativeOwnership.birthTypeCapture.records.find(p=>p.pid===c.pid&&p.parentPid===c.parentPid&&p.creationFileTime===c.creationFileTime);
  assert.equal(c.pid,20340);assert.equal(c.creationFileTime,"134396524431630101");assert.equal(match.status,"classified");
  assert.equal(match.utilitySubtype,"on_device_model.mojom.OnDeviceModelService");assert.equal(c.privateBytes,248614912);
  assert.equal(c.privateMiBAtWholeTreePeak,237.09765625);assert.equal(c.excludedFromAcceptance,false);assert.equal(c.appCausationProven,false);
  assert.ok(r.memory.peak.processes.some(p=>p.pid===c.pid&&p.creationFileTime===c.creationFileTime&&p.privateBytes===c.privateBytes));
  assert.equal(a.beforeLateBirth.incrementalPrivateMiB,203.5546875);assert.equal(a.beforeLateBirth.notAnAlternateAcceptanceWindow,true);
  assert.equal(r.nativeOwnership.birthTypeCapture.processesExcluded,false);assert.equal(r.nativeOwnership.birthTypeCapture.primarySamplesMutated,false);
});
test("complete original File supplied, actual bounded native I/O aborted with zero partial output; full conversion/fidelity never claimed",()=>{
  assert.equal(r.fixture.protectedOriginal,true);assert.equal(r.fixture.copied,false);assert.equal(r.fixture.truncated,false);
  assert.equal(r.inputSelection.remotePlaywrightUpload,false);assert.equal(r.browserResult.sourceFileBytes,2958573265);
  assert.equal(r.browserResult.metrics.inputBytes,29451841);assert.equal(r.browserResult.metrics.outputBytes,22962542);assert.equal(r.browserResult.writeAttempts,96);
  assert.equal(r.browserResult.metrics.peakPendingOperations,1);assert.equal(r.browserResult.metrics.peakQueuedBytes,262144);
  assert.equal(r.browserResult.metrics.wasmMemoryBytes,100663296);assert.equal(r.browserResult.errorName,"AbortError");assert.equal(r.browserResult.partialOutputBytes,0);
  assert.equal(r.originalStartup.fullOriginalConverted,false);assert.equal(r.originalStartup.independentFullFidelityPassed,false);
  for(const k of ["servicesDisabled","speedGainProven","fullOriginalConverted","independentFullFidelityPassed","wholeGoalComplete"])assert.equal(a[k],false);
});
test("47browser births/3roots reconciled, unrelated reused24444 untouched, original SHA/size unchanged and all owned media/stages gone",()=>{
  assert.equal(r.browserBirthReconciliation.allObservedBirthsAbsent,true);assert.equal(r.browserBirthReconciliation.observedPidCount,47);
  assert.deepEqual(r.browserBirthReconciliation.reused.map(p=>p.pid),[24444]);assert.equal(r.browserBirthReconciliation.noProcessesKilled,true);
  assert.equal(a.freshBrowserBirthReconciliation.allObservedBirthsAbsent,true);assert.equal(a.allOwnedDataRemoved,true);
  assert.ok(r.processCleanup.every(p=>p.status==="owned-identity-absent"));assert.equal(r.processCleanup.length,3);
  assert.ok(r.originalStartup.partialOutputRemoved&&r.ownedRuntimeRemoved&&r.ownedStaticStageRemoved&&r.privateCpuOverride.stageRemoved);
  assert.deepEqual(r.originalBefore,r.originalAfter);assert.equal(r.originalAfter.bytes,2958573265);
  assert.equal(r.originalAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");assert.deepEqual(r.forbiddenRequests,[]);
  assert.equal(a.sourcePinsVerified,47);assert.equal(a.publicAssetsOrRoutesChanged,false);
});
test("CSV contains all1675 native records and rederives active peak/count without dropping unknown processes; HTML explicitly says FAIL",async()=>{
  const lines=(await read(a.reports.csv)).toString().trim().split("\n");assert.equal(lines.length,1676);
  const rows=lines.slice(1).map(line=>line.split(",")),active=rows.filter(row=>row[2]==="conversion"),available=active.filter(row=>row[8]==="available");
  assert.equal(active.length,1420);assert.equal(available.length,1420);assert.equal(Math.max(...available.map(row=>Number(row[5]))),380.58203125);
  const wholeTreePeak=available.reduce((a,b)=>Number(a[3])>Number(b[3])?a:b);
  assert.equal(Number(wholeTreePeak[7]),248614912);
  // A component can peak later while the rest of the tree is already falling.
  // Do not substitute this larger component-only value into the global peak.
  assert.equal(Math.max(...available.map(row=>Number(row[7]||0))),261500928);
  const html=(await read(a.reports.html)).toString();assert.ok(html.includes("Original VP9 startup: FAIL"));
  assert.ok(html.includes("250 MiB"));assert.ok(html.includes("Application causation is unproven"));assert.ok(html.includes("<polyline"));
});

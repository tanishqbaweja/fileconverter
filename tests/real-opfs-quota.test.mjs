import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { REAL_OPFS_QUOTA_BYTES, REAL_OPFS_QUOTA_CASES, validateRealOpfsQuotaFailure } from "../scripts/lib/real-opfs-quota-validation.mjs";
const state = () => ({ jobState: "error", workerStatus: "ready", error: "The operation failed because the quota was exceeded.", opfsName: null, opfsNames: [],
  metrics: { inputBytes: 262144, outputBytes: 65536, peakWasmMemoryBytes: 33554432, pendingOperations: 0, queuedBytes: 0,
    peakPendingOperations: 1, maxReadChunkBytes: 262144, maxWriteChunkBytes: 4096, peakQueuedBytes: 4096 } });
const control = () => ({ quota: { quota: REAL_OPFS_QUOTA_BYTES, overrideActive: true }, storageBefore: [], storageAfter: [], faultParameterPresent: false });
test("real quota proof requires browser enforcement, genuine native read/write and clean terminal worker/storage, never just an error string", () => {
  const proof = validateRealOpfsQuotaFailure(state(), control());
  assert.equal(proof.errorInjectionUsed, false); assert.equal(proof.actualNativeReadAndWrite, true);
  assert.equal(proof.physicalDiskExhausted, false); assert.equal(proof.osPermissionRevocationTested, false); assert.equal(proof.publicAcceptance, false);
  for (const mutate of [s => { s.jobState = "complete"; }, s => { s.workerStatus = "starting"; }, s => { s.metrics.inputBytes = 0; },
    s => { s.metrics.outputBytes = 0; }, s => { s.metrics.outputBytes = REAL_OPFS_QUOTA_BYTES + 1; }, s => { s.metrics.peakWasmMemoryBytes = 0; },
    s => { s.metrics.pendingOperations = 1; }, s => { s.metrics.maxWriteChunkBytes = 262145; }, s => { s.opfsNames = ["partial"]; },
    s => { s.error = "unrelated failure"; }, s => { s.error = "Audio metadata exceeds quota allowance"; }]) {
    const value = state(); mutate(value); assert.throws(() => validateRealOpfsQuotaFailure(value, control()));
  }
  for (const mutate of [p => { p.quota.overrideActive = false; }, p => { p.quota.quota++; }, p => { p.faultParameterPresent = true; },
    p => { p.storageBefore = ["old-file"]; }, p => { p.storageAfter = ["partial"]; }]) {
    const proof = control(); mutate(proof); assert.throws(() => validateRealOpfsQuotaFailure(state(), proof));
  }
});
test("real quota gate selects only the new actual-failure and same-page metadata/fidelity recovery jobs", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8"), start = source.indexOf("const selectedCases = "), end = source.indexOf(";\nconst root =", start);
  const cases = JSON.parse(JSON.stringify(runInNewContext("(" + source.slice(start + "const selectedCases = ".length, end) + ")",
    { mp3GainMatrix: false, mp3Clipping: false, mp3IoRecovery: false, mp3GainRepair: false, mp3GainDiagnostic: false,
      mp3ArtworkMetadata: false, standardRepeatedAudio: false, realQuotaRecovery: true, REAL_OPFS_QUOTA_CASES }, { timeout: 1000 })));
  assert.deepEqual(cases, REAL_OPFS_QUOTA_CASES.map(row => ({ ...row })));
  assert.equal(cases.length, 2); assert.ok(cases.every(row => !row.interruption && !row.testFault));
});
test("real quota mode calls browser quota control only in the owned context and restores default quota in finally without replacing production IO", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--real-opfs-quota-recovery/); assert.match(source, /quotaSession = await context.newCDPSession\(page\)/);
  assert.match(source, /"Storage.overrideQuotaForOrigin", \{ origin: quotaOrigin, quotaSize: REAL_OPFS_QUOTA_BYTES \}/);
  assert.match(source, /realQuotaControl.final.overrideActive, false/); assert.match(source, /realQuotaControl.restoredInFinally = true/);
  assert.match(source, /faultParameterPresent: new URL\(page.url\(\)\).searchParams.has\("fault"\)/);
  assert.match(source, /if \(audioIoRecovery \|\| mp3IoRecovery \|\| realQuotaRecovery\)/);
  assert.match(source, /duration=180/); assert.match(source, /validateRealOpfsQuotaFailure\(state/);
  assert.match(source, /noPageOrContextRecreation: true, noStaleErrorOrWarning: true, errorInjectionUsed: false/);
  assert.match(source, /row.fidelity.minimumPsnrDb, 60/); assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
  assert.match(source, /assert.ok\(report.memory.incrementalPrivateMiB <= 250\)/); assert.match(source, /await runtime.close\(\)/);
  const validator = await readFile("scripts/lib/real-opfs-quota-validation.mjs", "utf8");
  assert.doesNotMatch(validator, /throw new DOMException|prototype\.write|prototype\.estimate/);
});

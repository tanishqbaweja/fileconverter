import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
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
test("first actual1MiB quota experiment stays failed: real47-byte header was rejected before any acknowledged output; defaults and cleanup recovered", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-26T10-12-32.587Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.status, "failed"); assert.equal(receipt.executedHead, "874391b161d71814c4c0edfa370ff5f46fd88f41"); assert.equal(receipt.sourcePins, 51);
  const packed = await readFile(receipt.archive.path); assert.equal(sha(packed), receipt.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw), [failure, recovery] = report.cases;
  assert.equal(failure.realBrowserQuota.overrideActive, true); assert.equal(failure.realBrowserQuota.quota, 1048576);
  assert.match(failure.browserState.error, /FileSystemSyncAccessHandle.*No space available.*Audio header write failed/);
  assert.equal(failure.browserState.metrics.inputBytes, 262144); assert.equal(failure.browserState.metrics.outputBytes, 0);
  assert.equal(failure.browserState.metrics.maxWriteChunkBytes, 47); assert.equal(failure.browserState.metrics.peakWasmMemoryBytes, 33554432);
  assert.deepEqual(failure.storageBefore, []); assert.deepEqual(failure.storageAfter, []);
  assert.equal(failure.status, "failed"); assert.match(failure.failures[0], /acknowledged output before quota exhaustion/);
  // Even under today's control metadata, zero acknowledged bytes still cannot pass.
  assert.throws(() => validateRealOpfsQuotaFailure(failure.browserState, control()), /acknowledged output/);
  assert.equal(recovery.browserState.jobState, "complete"); assert.equal(recovery.browserState.error, null);
  assert.equal(recovery.output.sha256, "fa99d5254cc40bb3d9dc1b8f2f745477f5c5828916b83b7ef7db64d1e1092d7f");
  assert.equal(recovery.output.bytes, 17360); assert.equal(recovery.output.tags.status, "passed");
  assert.equal(recovery.fidelity.samples, 96000); assert.equal(recovery.fidelity.minimumPsnrDb, 60); assert.equal(recovery.fidelity.psnrDb, 66.16825969015325);
  assert.equal(recovery.realBrowserQuota.overrideActive, false); assert.equal(recovery.status, "failed"); // Dependency remains failed, not relabelled.
  assert.equal(receipt.realQuotaControl.restoredInFinally, true); assert.equal(receipt.realQuotaControl.final.overrideActive, false);
  assert.equal(receipt.memory.incrementalPrivateMiB, 181.63671875); assert.equal(receipt.memory.validSamples, 773); assert.equal(receipt.memory.unavailableSamples, 0);
  const journal = await readFile(receipt.losslessJournal.file); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  assert.equal(sha(gunzipSync(journal, { maxOutputLength: 8 * 1048576 })), receipt.losslessJournal.sha256);
  assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.equal(receipt.protectedOriginalUnchanged, true);
  assert.deepEqual(receipt.network.forbidden, []); assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
});
test("actual browser-enforced midstream OPFS quota failure and same-page exact PNG/metadata/PCM recovery pass under the unchanged whole-tree limit", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-26T10-20-39.819Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.executedHead, "2376f0a7f85c7439a76d522ab21e08f6198d7cb7"); assert.equal(receipt.status, "passed-selected-small-private-cases-not-promotion");
  assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.fullMetadataAcceptance, false); assert.equal(receipt.sourcePins, 51);
  assert.equal(receipt.artifactManifestSha256, "94da3c35e695c4a2b42a4a8cdd863910bbe09b2e9b46d8b66f674d075b3a658c");
  const packed = await readFile(receipt.archive.path); assert.equal(sha(packed), receipt.archive.sha256); assert.equal(packed.length, receipt.archive.bytes);
  const raw = gunzipSync(packed, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256); assert.equal(raw.length, receipt.archive.restoredBytes);
  const report = JSON.parse(raw), [failure, recovery] = report.cases; assert.equal(report.cases.length, 2);
  assert.equal(report.nativeConversionUsed, false); assert.equal(report.headedCoverage, false); assert.equal(report.scalingAcceptance, false);
  assert.equal(failure.status, "passed-private-browser-enforced-quota-failure-case"); assert.equal(failure.realBrowserQuota.quota, 1114112);
  assert.equal(failure.browserState.metrics.inputBytes, 1835008); assert.equal(failure.browserState.metrics.outputBytes, 1043199);
  assert.equal(failure.browserState.metrics.maxWriteChunkBytes, 9173); assert.equal(failure.realQuotaErrorVisible, true);
  assert.deepEqual(validateRealOpfsQuotaFailure(failure.browserState, { quota: failure.realBrowserQuota,
    storageBefore: failure.storageBefore, storageAfter: failure.storageAfter, faultParameterPresent: false }), failure.realQuotaFailureProof);
  assert.equal(failure.realQuotaFailureProof.errorInjectionUsed, false); assert.equal(failure.realQuotaFailureProof.physicalDiskExhausted, false);
  assert.match(failure.browserState.error, /FileSystemSyncAccessHandle.*No space available.*Audio frame encode or mux failed/);
  assert.equal(recovery.status, "passed-small-private-fidelity-and-metadata-case"); assert.equal(recovery.realBrowserQuota.overrideActive, false);
  assert.equal(recovery.output.bytes, 17360); assert.equal(recovery.output.sha256, "fa99d5254cc40bb3d9dc1b8f2f745477f5c5828916b83b7ef7db64d1e1092d7f");
  assert.equal(recovery.output.tags.status, "passed"); assert.equal(recovery.output.tags.fields.length, 25);
  assert.equal(recovery.fidelity.samples, 96000); assert.equal(recovery.fidelity.minimumPsnrDb, 60); assert.equal(recovery.fidelity.psnrDb, 66.16825969015325);
  assert.deepEqual(recovery.repeatedValues, ["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"]);
  assert.equal(recovery.artwork.bytes, 178); assert.equal(recovery.artwork.sha256, "a2c9b09a676abe1df460620135bd1d889ddfb84de2f665b08c95374ec10564f0");
  assert.equal(recovery.artwork.description, "表紙 — Front cover"); assert.equal(recovery.artwork.independentImageDecode, true);
  assert.deepEqual(recovery.samePageRealQuotaRecovery, { actualQuotaFailurePassed: true, defaultQuotaRestored: true,
    noPageOrContextRecreation: true, noStaleErrorOrWarning: true, errorInjectionUsed: false, publicAcceptance: false });
  assert.equal(receipt.realQuotaControl.restoredInFinally, true); assert.equal(receipt.realQuotaControl.initial.overrideActive, false);
  assert.equal(receipt.realQuotaControl.final.overrideActive, false); assert.equal(receipt.realQuotaControl.final.quota, receipt.realQuotaControl.initial.quota);
  assert.equal(receipt.realQuotaControl.defaultBrowserServicesChanged, false); assert.equal(receipt.memory.incrementalPrivateMiB, 186.2734375);
  assert.equal(receipt.memory.validSamples, 407); assert.equal(receipt.memory.unavailableSamples, 0);
  const journal = await readFile(receipt.losslessJournal.file); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  const sampleBytes = gunzipSync(journal, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(sampleBytes), receipt.losslessJournal.sha256);
  const history = sampleBytes.toString().trim().split("\n").map(line => JSON.parse(line).sample); assert.equal(history.length, 407);
  const peak = Math.max(...history.filter(sample => sample.phase !== "blank" && sample.privateBytes !== null).map(sample => sample.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.ok(report.cases.every(row => row.disposableOutputRemoved && row.failures.length === 0));
  assert.equal(report.processCleanup.length, 16); assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.equal(report.screenshots.length, 2); for (const screen of report.screenshots) { assert.equal(screen.headedCoverage, false); assert.equal(sha(await readFile(screen.path)), screen.sha256); }
  assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.equal(receipt.protectedOriginalUnchanged, true); assert.deepEqual(receipt.network.forbidden, []);
});

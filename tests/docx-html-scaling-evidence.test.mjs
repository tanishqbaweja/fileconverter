import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { summarizeDocxHtmlRunMemory } from "../scripts/lib/docx-html-scaling-control.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => readFile(new URL("../" + file, import.meta.url));
const controls = [
  ["evidence/2026-11-06T21-36-55-127Z-docx-html-qualification.json", "1850a2a473c0b11cff1f14434462725664dba0fb90ae73f14d4716598ec9b2ed"],
  ["evidence/2026-11-06T21-40-53-256Z-docx-html-qualification.json", "271a955dc93918f26324c794ad35c7b1c5a375d37ebeecb2e0dd8d926aad2e7a"],
];
const reports = [];
for (const [file, digest] of controls) {
  const bytes = await read(file); assert.equal(sha(bytes), digest); reports.push(JSON.parse(bytes));
}

test("actual completed DOCX scaling controls contain three independently validated full outputs at both genuine source sizes", () => {
  for (const r of reports) {
    assert.ok(["passed-private-progressive-docx-html-control-not-full-route-qualification", "failed-not-acceptance"].includes(r.status));
    assert.deepEqual(r.scalingInputs.map(x => x.bytes), [8786993, 140575793]);
    assert.deepEqual(r.scalingInputs.map(x => x.paragraphs), [2048, 32768]);
    for (const s of r.scalingInputs) {
      assert.equal(s.generated.zipMethod, "stored"); assert.equal(s.generated.nativeConversionUsed, false);
      assert.equal(s.validated.zipCrcVerified, true); assert.equal(s.validated.wordXmlWellFormed, true);
      assert.equal(s.validated.packageNamespacesAndMainRelationshipVerified, true);
    }
    const runs = r.cases.filter(x => x.runMemory); assert.equal(runs.length, 6);
    for (const [paragraphs, bytes, hash] of [[2048, 8735249, "c4658ddacf4a35dd3b8330c9c7221619e68542b08d46985b4eac45df0fdffca0"],
      [32768, 139756049, "b8ef8ba6178329962cc48943d18e3dd049b1b4b1e7423b821c766f457f8ea859"]]) {
      const selected = runs.filter(x => x.paragraphs === paragraphs); assert.deepEqual(selected.map(x => x.repeat), [1, 2, 3]);
      for (const c of selected) {
        assert.equal(c.kind, "complete"); assert.equal(c.outputBytes, bytes); assert.equal(c.validated.bytes, bytes);
        assert.equal(c.validated.sha256, hash); assert.equal(c.validated.paragraphs, paragraphs);
        assert.equal(c.validated.allParagraphsComparedInOrder, true); assert.equal(c.validated.csp, true);
        assert.equal(c.binding.convertedCopyCreated, false); assert.equal(c.binding.bindingMode, "three-fixed-sampled-ranges");
        assert.equal(c.binding.maximumBrowserSampleBytes, 4096); assert.equal(c.binding.maximumHostProbeBufferBytes, 4096);
        assert.equal(c.metrics.maxReadChunkBytes, 262144); assert.equal(c.metrics.maxWriteChunkBytes, 65536);
        assert.equal(c.metrics.peakQueuedBytes, 65536); assert.equal(c.metrics.peakPendingOperations, 1);
        assert.equal(c.metrics.pendingOperations, 0); assert.equal(c.metrics.queuedBytes, 0);
        assert.equal(c.metrics.peakWasmMemoryBytes, 0); assert.equal(c.metrics.sharedArrayBufferBytes, 0);
      }
    }
    assert.deepEqual(r.scalingValidatorControls.map(x => [x.name, x.exitCode]), [["positive", 0], ["wrong-ordinal", 1], ["active-markup", 1], ["truncated", 1]]);
  }
});

test("full raw process tree recomputes primary and every repeat; unavailable samples remain null and stable cleanup retains96MiB gate", async () => {
  for (const r of reports) {
    const packed = await read(r.nativeArchive.file), raw = gunzipSync(packed, { maxOutputLength: 8388608 });
    assert.equal(sha(packed), r.nativeArchive.sha256); assert.equal(sha(raw), r.nativeArchive.decodedSha256);
    const samples = JSON.parse(raw), window = samples.filter(s => Date.parse(s.timestamp) >= Date.parse(r.memory.windowStart) && Date.parse(s.timestamp) <= Date.parse(r.memory.windowEnd));
    const valid = window.filter(s => s.privateBytes !== null && s.processes);
    assert.equal(valid.length, r.memory.validSamples); assert.equal(window.length - valid.length, r.memory.unavailableSamples);
    for (const row of valid) assert.equal(row.processes.reduce((n, p) => n + p.privateBytes, 0), row.privateBytes);
    assert.equal(Math.max(...valid.map(x => x.privateBytes)), r.memory.peak.privateBytes);
    assert.equal((r.memory.peak.privateBytes - r.blankBaseline.privateBytes) / 1048576, r.memory.incrementalPrivateMiB);
    assert.ok(r.memory.incrementalPrivateMiB <= 250); assert.equal(r.memory.limitMiB, 250);
    for (const c of r.cases.filter(x => x.runMemory)) {
      const m = c.runMemory, recomputed = summarizeDocxHtmlRunMemory(samples, Date.parse(m.windowStart), Date.parse(m.windowEnd),
        r.blankBaseline, r.loadedIdle, m.cleanupStable);
      // Online counts are snapshots, not the finalized journal: one first-
      // session final-repeat sample arrived after its drain. Primary peaks,
      // process identity, unavailable counts and all limits must still match.
      const { validSamples: finalizedValid, ...finalized } = recomputed;
      const { validSamples: onlineValid, ...online } = m;
      assert.deepEqual(finalized, online);
      const expectedLate = r === reports[0] && c.paragraphs === 32768 && c.repeat === 3 ? 1 : 0;
      assert.equal(finalizedValid - onlineValid, expectedLate);
      assert.ok(m.cleanupDeltaFromLoadedMiB <= 96);
      assert.equal(m.cleanupRecoveryLimitMiB, 96); assert.equal(m.cleanupStable.minimumElapsedMs, 8000);
      assert.ok(m.cleanupStable.spreadBytes <= m.cleanupStable.privateBytes * .02);
      assert.ok(samples.some(s => s.privateBytes === m.cleanupStable.privateBytes));
    }
  }
});

test("headless native selection, recovery, independent diagnostic heaps and cleanup do not promote the route or waive original scope", async () => {
  for (const r of reports) {
    assert.equal(r.inputSelections.length, r === reports[0] ? 5 : 3);
    for (const s of r.inputSelections) { assert.equal(s.method, "DOM.setFileInputFiles"); assert.equal(s.contentPayloadsSent, 0); assert.equal(s.fileMetadataUnchanged, true); }
    if (r === reports[0]) {
      assert.deepEqual(r.failures, []);
      assert.equal(r.cases.filter(x => x.kind === "payload-cancel").length, 1); assert.equal(r.cases.filter(x => x.kind === "write-error").length, 1);
      assert.ok(r.cases.find(x => x.kind === "payload-cancel").armedMetrics.outputBytes >= 65536);
      assert.deepEqual(r.cases.find(x => x.kind === "payload-cancel").leftovers, []);
      assert.deepEqual(r.cases.find(x => x.kind === "write-error").leftovers, []);
    }
    assert.ok(r.realmObservations.length > 0 && r.realmObservations.length <= 600);
    assert.equal(r.realmObserverOwnership.maximumLeases, 16); assert.equal(r.realmObserverOwnership.acceptanceMetric, false);
    assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.browserCleanup.status, "owned-identity-absent"); assert.equal(r.serverCleanup.ownedRootAbsent, true);
    assert.deepEqual(r.protectedOriginalBefore, r.protectedOriginalAfter);
    assert.equal(r.protectedOriginalAfter.bytes, 2958573265); assert.equal(r.protectedOriginalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
    assert.deepEqual(r.forbiddenRequests, []); assert.equal(r.headed, false); assert.equal(r.browserServicesDisabled, false);
    assert.equal(r.nativeConversionUsed, false);
    assert.equal(r.completedDocumentScalingControlVerified, r === reports[0] ? true : undefined);
    for (const flag of ["publicPromotion", "stressAcceptance", "nativePickerVerified", "freshSessionRepeatVerified", "fullOoxmlLayoutFidelityVerified", "largeFileScalingVerified", "speedImprovementProven"]) assert.equal(r[flag], false);
    assert.match((await read(r.readableReport)).toString(), /Not public qualification/); assert.match((await read(r.csvReport)).toString(), /cleanupDeltaFromLoadedMiB/);
  }
});

test("fresh-session complete outputs do not erase the overall cancellation-observation failure", () => {
  const [a, b] = reports;
  assert.notEqual(a.browserCleanup.identity.pid, b.browserCleanup.identity.pid);
  assert.notEqual(a.browserCleanup.identity.createdAt, b.browserCleanup.identity.createdAt);
  assert.equal(b.status, "failed-not-acceptance"); assert.equal(b.failures.length, 1);
  assert.match(b.failures[0], /waitForFunction: Timeout 30000ms exceeded/);
  assert.equal(b.failedJobState.jobState, "complete"); assert.equal(b.failedJobState.metrics.outputBytes, 9000537);
  assert.equal(b.cases.filter(x => x.kind === "payload-cancel").length, 0);
  assert.equal(a.memory.incrementalPrivateMiB, 173.390625); assert.equal(b.memory.incrementalPrivateMiB, 157.01171875);
  for (let i = 0; i < 2; i++) assert.equal(a.scalingInputs[i].sha256, b.scalingInputs[i].sha256);
});

test("changed cancellation-only browser control really cancels after payload, recovers and leaves earlier full-session failure untouched", async () => {
  const bytes = await read("evidence/2026-11-07T02-01-08-508Z-docx-html-qualification.json");
  assert.equal(sha(bytes), "9e5b61478f2987c1ffd4ce9e16522cdc7eead36fb075eb975f44066bb081e78a");
  const r = JSON.parse(bytes);
  assert.equal(r.status, "passed-changed-docx-html-payload-cancel-write-recovery-control-not-scaling-or-promotion");
  assert.deepEqual(r.failures, []); assert.deepEqual(r.cases.map(x => x.kind), ["payload-cancel", "write-error", "complete"]);
  assert.equal(r.cancellationTrigger, "in-page-real-output-observation-then-production-cancel-button");
  const cancel = r.cases[0]; assert.equal(cancel.armedMetrics.outputBytes, 1703936); assert.equal(cancel.metrics.outputBytes, 1835008);
  assert.equal(cancel.metrics.peakPendingOperations, 1); assert.equal(cancel.metrics.peakQueuedBytes, 65536);
  assert.deepEqual(cancel.leftovers, []); assert.deepEqual(r.cases[1].leftovers, []);
  assert.equal(r.cases[2].validated.sha256, "31bbd28016f7eaef9a9c2ef4fbf91221c7f34450710949302daacdcef5de0a55");
  assert.equal(r.memory.incrementalPrivateMiB, 69.765625); assert.equal(r.memory.validSamples, 12); assert.equal(r.memory.unavailableSamples, 0);
  const packed = await read(r.nativeArchive.file), raw = gunzipSync(packed, { maxOutputLength: 1048576 });
  assert.equal(sha(packed), r.nativeArchive.sha256); assert.equal(sha(raw), r.nativeArchive.decodedSha256);
  const valid = JSON.parse(raw).filter(s => Date.parse(s.timestamp) >= Date.parse(r.memory.windowStart) && Date.parse(s.timestamp) <= Date.parse(r.memory.windowEnd) && s.privateBytes !== null);
  assert.equal(valid.length, 12); assert.equal(Math.max(...valid.map(s => s.privateBytes)), r.memory.peak.privateBytes);
  assert.equal((r.memory.peak.privateBytes - r.blankBaseline.privateBytes) / 1048576, 69.765625);
  assert.equal(r.browserServicesDisabled, false); assert.equal(r.publicPromotion, false); assert.equal(r.largeFileScalingVerified, false);
  assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.browserCleanup.status, "owned-identity-absent"); assert.equal(r.serverCleanup.ownedRootAbsent, true);
  assert.deepEqual(r.protectedOriginalBefore, r.protectedOriginalAfter); assert.deepEqual(r.forbiddenRequests, []);
  assert.equal(reports[1].status, "failed-not-acceptance");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { summarizeDocxHtmlRunMemory } from "../scripts/lib/docx-html-scaling-control.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reports = [];
for (const [file, digest] of [
  ["evidence/2026-11-07T02-15-56-367Z-docx-html-qualification.json", "df685c42d11a994276f03dbb2cef99570d0ae717881e7a15bc6e11cdc8ce2e47"],
  ["evidence/2026-11-07T02-22-59-206Z-docx-html-qualification.json", "f5c0786e9f0d1f8dc1e7cfabf8b98d4e59d6c230bfe4c17cfa7e72a543870297"],
]) { const bytes = await read(file); assert.equal(sha(bytes), digest); reports.push(JSON.parse(bytes)); }

test("actual baseline and async candidate use nine real handle jobs, twelve independently validated scaling outputs and honest resource counters", () => {
  for (const [index, r] of reports.entries()) {
    assert.equal(r.status, "passed-private-direct-handle-docx-html-scaling-control-not-native-picker-or-promotion");
    assert.deepEqual(r.failures, []); assert.equal(r.destinationMode, "handle"); assert.equal(r.destinationObservations.length, 9);
    assert.equal(new Set(r.destinationObservations.map(x => x.jobId)).size, 9);
    for (const d of r.destinationObservations) { assert.equal(d.mode, "handle"); assert.equal(d.actualFileHandle, true); }
    const runs = r.cases.filter(c => c.runMemory); assert.equal(runs.length, 6);
    assert.deepEqual(runs.map(c => [c.paragraphs, c.repeat]), [[2048, 1], [2048, 2], [2048, 3], [32768, 1], [32768, 2], [32768, 3]]);
    for (const c of runs) {
      assert.equal(c.kind, "complete"); assert.equal(c.validated.allParagraphsComparedInOrder, true);
      assert.equal(c.validated.paragraphs, c.paragraphs); assert.equal(c.validated.csp, true);
      assert.equal(c.outputBytes, c.paragraphs === 2048 ? 8735249 : 139756049);
      assert.equal(c.validated.sha256, c.paragraphs === 2048 ? "c4658ddacf4a35dd3b8330c9c7221619e68542b08d46985b4eac45df0fdffca0" : "b8ef8ba6178329962cc48943d18e3dd049b1b4b1e7423b821c766f457f8ea859");
      assert.equal(c.destinationObservation.actualFileHandle, true); assert.equal(c.metrics.activeWorkerCount, index === 0 ? 2 : 1);
      assert.equal(c.metrics.sharedArrayBufferBytes, index === 0 ? 266272 : 0); assert.equal(c.metrics.peakWasmMemoryBytes, 0);
      assert.equal(c.metrics.maxReadChunkBytes, 262144); assert.equal(c.metrics.maxWriteChunkBytes, 65536);
      assert.equal(c.metrics.peakQueuedBytes, 65536); assert.equal(c.metrics.peakPendingOperations, 1);
      assert.equal(c.metrics.pendingOperations, 0); assert.equal(c.metrics.queuedBytes, 0);
      assert.equal(c.binding.maximumHostProbeBufferBytes, 4096); assert.equal(c.binding.convertedCopyCreated, false);
    }
  }
});

test("both finalized native journals reproduce exact full-tree peaks and every cleanup window without omitting unavailable samples or processes", async () => {
  for (const r of reports) {
    const packed = await read(r.nativeArchive.file), raw = gunzipSync(packed, { maxOutputLength: 8388608 });
    assert.equal(sha(packed), r.nativeArchive.sha256); assert.equal(sha(raw), r.nativeArchive.decodedSha256);
    const samples = JSON.parse(raw), window = samples.filter(s => Date.parse(s.timestamp) >= Date.parse(r.memory.windowStart) && Date.parse(s.timestamp) <= Date.parse(r.memory.windowEnd));
    const valid = window.filter(s => s.privateBytes !== null && s.processes);
    assert.equal(valid.length, r.memory.validSamples); assert.equal(window.length - valid.length, r.memory.unavailableSamples);
    for (const s of valid) assert.equal(s.processes.reduce((total, p) => total + p.privateBytes, 0), s.privateBytes);
    assert.equal(Math.max(...valid.map(s => s.privateBytes)), r.memory.peak.privateBytes);
    assert.equal((r.memory.peak.privateBytes - r.blankBaseline.privateBytes) / 1048576, r.memory.incrementalPrivateMiB);
    assert.ok(r.memory.incrementalPrivateMiB <= 250); assert.equal(r.memory.limitMiB, 250);
    for (const c of r.cases.filter(c => c.runMemory)) {
      const m = c.runMemory;
      assert.deepEqual(summarizeDocxHtmlRunMemory(samples, Date.parse(m.windowStart), Date.parse(m.windowEnd), r.blankBaseline, r.loadedIdle, m.cleanupStable), m);
      assert.ok(m.cleanupDeltaFromLoadedMiB <= 96); assert.equal(m.cleanupRecoveryLimitMiB, 96);
      assert.equal(m.cleanupStable.minimumElapsedMs, 8000); assert.ok(m.cleanupStable.spreadBytes <= m.cleanupStable.privateBytes * .02);
    }
  }
  assert.equal(reports[0].memory.incrementalPrivateMiB, 185.92578125); assert.equal(reports[0].memory.unavailableSamples, 0);
  assert.equal(reports[1].memory.incrementalPrivateMiB, 104.99609375); assert.equal(reports[1].memory.unavailableSamples, 1);
});

test("candidate exceeds preregistered10percent criterion on byte-identical inputs/settings/outputs; only private DOCX backend selection changed", async () => {
  const [a, b] = reports, p = b.performanceCandidate;
  assert.equal(p.accepted, true); assert.equal(p.minimumLargeMedianImprovement, .10);
  assert.equal(p.identicalInputSettingsAndOutputHashesVerified, true); assert.match(p.caveat, /not randomized/);
  assert.deepEqual(a.browserBefore, b.browserBefore);
  for (let n = 0; n < 2; n++) assert.equal(a.scalingInputs[n].sha256, b.scalingInputs[n].sha256);
  const rows = r => r.cases.filter(c => c.runMemory), median = r => rows(r).filter(c => c.paragraphs === 32768).map(c => c.metrics.elapsedMs).sort((x, y) => x - y)[1];
  for (let n = 0; n < 6; n++) {
    assert.equal(rows(a)[n].sourceSha256, rows(b)[n].sourceSha256); assert.equal(rows(a)[n].validated.sha256, rows(b)[n].validated.sha256);
  }
  assert.equal(median(a), p.baselineLargeMedianMs); assert.equal(median(b), p.candidateLargeMedianMs);
  assert.equal(1 - median(b) / median(a), p.observedMedianImprovement); assert.ok(p.observedMedianImprovement >= .10);
  const source = await read("workers/conversion.worker.ts");
  assert.equal(sha(source), "57b9f4b9edeb981d9d267e8e2892d89007c114fb999708aff2407311b0147ce9");
  const before = '        profileId === "avi-to-flv" || profileId === "mkv-to-mp4",';
  const after = '        profileId === "avi-to-flv" || profileId === "mkv-to-mp4" || profileId === "docx-to-html",';
  assert.equal(source.toString().split(after).length, 2);
  assert.equal(sha(source.toString().replace(after, before)), a.sourcePins["workers/conversion.worker.ts"]);
});

test("direct cancellation/error/recovery, privacy and finally cleanup pass while native picker, complex fidelity and release stay unverified", () => {
  for (const r of reports) {
    assert.deepEqual(r.cases.map(c => c.kind), ["complete", "complete", "complete", "complete", "complete", "complete", "payload-cancel", "write-error", "complete"]);
    assert.ok(r.cases[6].armedMetrics.outputBytes >= 65536); assert.deepEqual(r.cases[6].leftovers, []); assert.deepEqual(r.cases[7].leftovers, []);
    assert.equal(r.cases[8].validated.sha256, "31bbd28016f7eaef9a9c2ef4fbf91221c7f34450710949302daacdcef5de0a55");
    assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.browserCleanup.status, "owned-identity-absent"); assert.equal(r.serverCleanup.ownedRootAbsent, true);
    assert.deepEqual(r.protectedOriginalBefore, r.protectedOriginalAfter); assert.equal(r.protectedOriginalAfter.bytes, 2958573265);
    assert.equal(r.protectedOriginalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
    assert.deepEqual(r.forbiddenRequests, []); assert.equal(r.browserServicesDisabled, false); assert.equal(r.headed, false);
    assert.equal(r.directHandleWriterControlVerified, true); assert.match(r.destinationAdapter, /OPFS/);
    for (const key of ["nativeExternalDestinationVerified", "nativePickerVerified", "publicPromotion", "stressAcceptance", "fullOoxmlLayoutFidelityVerified", "largeFileScalingVerified", "speedImprovementProven"]) assert.equal(r[key], false);
  }
});

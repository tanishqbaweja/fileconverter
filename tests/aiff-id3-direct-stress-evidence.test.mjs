import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { stableWindow } from "../scripts/lib/chromium-private-memory.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proofFile = "evidence/2026-10-10T08-31-05-604Z-aiff-id3-direct-handle-stress.json";
const proofBytes = await read(proofFile), proof = JSON.parse(proofBytes);
const analysis = JSON.parse(await read("evidence/aiff-id3-direct-stress-analysis-2026-10-10.json"));
async function restore(entry) {
  const gzip = await read(entry.path), bytes = gunzipSync(gzip);
  assert.equal(gzip.length, entry.bytes); assert.equal(sha(gzip), entry.sha256);
  assert.equal(bytes.length, entry.restoredBytes); assert.equal(sha(bytes), entry.restoredSha256);
  return bytes;
}
const raw = JSON.parse(await restore(proof.retainedReports.find(entry => entry.path.endsWith(".json.gz"))));

test("Direct AIFF stress has three valid identical outputs but remains failed at 260.72265625MiB, with no public promotion", () => {
  assert.equal(proof.mode, "direct-handle");
  assert.equal(proof.status, "failed-or-incomplete-private-stress");
  assert.match(proof.failure, /Private stress child exit 1/);
  assert.equal(raw.passed, false);
  assert.equal(raw.checks.processTreePrivateMemory, false);
  assert.ok(Object.entries(raw.checks).filter(([key]) => key !== "processTreePrivateMemory").every(([, value]) => value === true));
  assert.equal(raw.blankBaseline.stable, true);
  assert.equal(raw.blankBaseline.privateBytes, 270364672);
  assert.equal(raw.peakPrivateBytes, 543752192);
  assert.equal(raw.incrementalPrivateMiB, (raw.peakPrivateBytes - raw.blankBaseline.privateBytes) / 1048576);
  assert.equal(raw.incrementalPrivateMiB, 260.72265625);
  assert.ok(raw.incrementalPrivateMiB > raw.limitMiB);
  assert.deepEqual(raw.runs, proof.reportSummary.runs);
  assert.equal(raw.runs.length, 3);
  for (const run of raw.runs) {
    assert.equal(run.sourceBytes, 140922233); assert.equal(run.outputBytes, 153600760);
    assert.equal(run.sha256, "8295fda722e8b578b18fa88bad0e9c6ae24ec35a27942900c998ddd6848f0dd2");
    assert.equal(run.validationSha256, run.sha256);
    assert.equal(run.mediaProbe.withinValidation.passed, true);
    assert.equal(run.mediaProbe.withinValidation.sha256, proof.fixture.decodedPcmSha256);
    assert.equal(run.mediaProbe.withinArtworkValidation.passed, true);
    assert.equal(run.mediaProbe.withinArtworkValidation.sha256, proof.fixture.artwork.sha256);
    for (const [key, value] of Object.entries(proof.fixture.expectedTags)) assert.equal(run.mediaProbe.format.tags[key], value);
    assert.equal(run.maxReadChunkBytes, 262144); assert.equal(run.maxWriteChunkBytes, 262144);
    assert.equal(run.peakQueuedBytes, 262144); assert.equal(run.peakPendingOperations, 1);
    assert.equal(run.peakWasmMemoryBytes, 16777216);
  }
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.speedImprovementProven, false);
  assert.equal(proof.multiGigabyteScalingAcceptance, false);
});

test("Analysis retains both GPU births, all native private bytes, exact stable cleanup medians and unknown allocations", async () => {
  assert.equal(analysis.records[1].proofSha256, sha(proofBytes));
  assert.equal(analysis.sourceSha256, sha(await read("scripts/analyze-aiff-id3-direct-stress.mjs")));
  assert.equal(analysis.excessBytes, 11243520);
  assert.equal(analysis.allObservedProcessesCounted, true);
  assert.deepEqual(analysis.processExclusions, []);
  const direct = analysis.records[1], opfs = analysis.records[0];
  assert.deepEqual(direct.sourcePins, opfs.sourcePins);
  assert.deepEqual(direct.buildProof, opfs.buildProof);
  assert.equal(direct.fixtureSha256, opfs.fixtureSha256);
  assert.equal(direct.runs[2].peakGpuProcesses.length, 2);
  assert.deepEqual(direct.runs[2].peakGpuProcesses.map(row => row.pid).sort((a, b) => a - b), [11644, 15708]);
  assert.equal(direct.runs[2].newGpuBirthsAtPeak.length, 1);
  assert.equal(direct.runs[2].newGpuBirthsAtPeak[0].privateBytes, 44576768);
  assert.equal(direct.runs[2].newGpuBirthsAtPeak[0].nativeType, "unknown");
  assert.equal(direct.runs[2].newGpuBirthsAtPeak[0].cimBirthMatchedType, "gpu-process");
  assert.equal(direct.runs[2].peakProcesses.reduce((sum, row) => sum + row.privateBytes, 0), raw.peakPrivateBytes);
  for (const run of direct.runs) {
    const samples = raw.samples.filter(row => row.phase === `cleanup-${run.run}`);
    assert.deepEqual(run.cleanupStable, stableWindow(samples));
    assert.equal(run.cleanupPrivateBytes, run.cleanupStable.privateBytes);
    assert.equal(run.cleanupProcesses.reduce((sum, row) => sum + row.privateBytes, 0), run.cleanupPrivateBytes);
  }
  assert.equal(direct.conversionNativeSamples.reduce((sum, phase) => sum + phase.validSamples, 0), 254);
  assert.equal(direct.conversionNativeSamples.reduce((sum, phase) => sum + phase.unavailableSamples, 0), 0);
  assert.equal(analysis.allocationCauseEstablished, false);
  assert.equal(analysis.speedImprovementProven, false);
  assert.match(analysis.speedComparisonCaveat, /not a randomized controlled/);
  assert.match(analysis.next, /No unchanged replay/);
});

test("Failed direct stress still verifies real-output cancellation, hidden/headless helpers and lossless archives/finally cleanup", async () => {
  assert.equal(raw.browser.headless, true); assert.equal(proof.subprocessWindowsHidden, true);
  assert.equal(raw.cancellationCheck.passed, true); assert.ok(raw.cancellationCheck.outputBytes > 0);
  assert.equal(raw.cancellationCheck.pendingOperations, 0); assert.equal(raw.cancellationCheck.queuedBytes, 0);
  assert.deepEqual(raw.cancellationCheck.projectLocalEntriesAfter, []);
  assert.deepEqual(proof.helperProof.forbiddenRequests, []);
  assert.equal(proof.runner.absence.status, "owned-identity-absent");
  for (const row of proof.helperProof.launches) assert.equal(row.absence.status, "owned-identity-absent");
  assert.equal(proof.assetsRestored, true); assert.equal(proof.ownedRuntimeRemoved, true);
  assert.equal(proof.ownedRawReportsRemoved, true); assert.equal(proof.protectedOriginalRead, false);
  for (const directory of [proof.ownedRuntime, proof.ownedRawReportDirectory, proof.helperProof.runtime])
    await assert.rejects(access(directory), { code: "ENOENT" });
  for (const entry of [proof.executedSource, ...proof.retainedReports]) await restore(entry);
  assert.equal(sha(await restore(proof.executedSource)), proof.recipeGeneratedSha256);
  for (const name of ["within-aiff.mjs", "within-aiff.wasm"])
    assert.equal(sha(await read("dist/client/engines/remux/" + name)), sha(await read("public/engines/remux/" + name)));
});

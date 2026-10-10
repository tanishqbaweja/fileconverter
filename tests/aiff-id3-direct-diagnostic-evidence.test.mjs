import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { makeAiffId3DiagnosticRecipe, makeAiffId3DiagnosticLaunchRecipe } from "../scripts/lib/aiff-id3-direct-diagnostic-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const read = file => readFile(new URL("../" + file, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proofBytes = await read("evidence/2026-10-10T08-54-35-664Z-aiff-id3-direct-handle-diagnostic.json"), proof = JSON.parse(proofBytes);
const launch = JSON.parse(await read("evidence/2026-10-10T08-54-35-612Z-aiff-id3-direct-diagnostic-launch.json"));
async function restore(entry) {
  const gzip = await read(entry.path), bytes = gunzipSync(gzip);
  assert.equal(gzip.length, entry.bytes); assert.equal(sha(gzip), entry.sha256);
  assert.equal(bytes.length, entry.restoredBytes); assert.equal(sha(bytes), entry.restoredSha256);
  return bytes;
}
const raw = JSON.parse(await restore(proof.retainedReports.find(row => row.path.endsWith(".json.gz"))));
const observer = JSON.parse(await restore(proof.diagnosticObserverEvidence));

test("Actual changed diagnostic remains non-acceptance despite three valid outputs and229.03515625MiB, and never reclassifies failed direct stress", async () => {
  assert.equal(proof.status, "diagnostic-gates-passed-not-production-acceptance");
  assert.equal(proof.diagnosticOnly, true); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.speedImprovementProven, false); assert.equal(proof.multiGigabyteScalingAcceptance, false);
  assert.equal(raw.runs.length, 3); assert.equal(raw.blankBaseline.stable, true);
  assert.equal(raw.blankBaseline.privateBytes, 254468096); assert.equal(raw.peakPrivateBytes, 494628864);
  assert.equal(raw.incrementalPrivateMiB, (raw.peakPrivateBytes - raw.blankBaseline.privateBytes) / 1048576);
  assert.equal(raw.incrementalPrivateMiB, 229.03515625);
  for (const run of raw.runs) {
    assert.equal(run.sourceBytes, 140922233); assert.equal(run.outputBytes, 153600760);
    assert.equal(run.sha256, "8295fda722e8b578b18fa88bad0e9c6ae24ec35a27942900c998ddd6848f0dd2");
    assert.equal(run.peakWasmMemoryBytes, 16777216);
    assert.equal(run.mediaProbe.withinValidation.passed, true);
    assert.equal(run.mediaProbe.withinValidation.sha256, proof.fixture.decodedPcmSha256);
    assert.equal(run.mediaProbe.withinArtworkValidation.sha256, proof.fixture.artwork.sha256);
    for (const [key, value] of Object.entries(proof.fixture.expectedTags)) assert.equal(run.mediaProbe.format.tags[key], value);
  }
  const previous = JSON.parse(await read("evidence/2026-10-10T08-31-05-604Z-aiff-id3-direct-handle-stress.json"));
  assert.equal(previous.reportSummary.passed, false);
  assert.equal(previous.reportSummary.incrementalPrivateMiB, 260.72265625);
  for (const [file, hash] of Object.entries(previous.sourcePins)) assert.equal(proof.sourcePins[file], hash);
});

test("Real bounded CDP data observes nested writer heaps, preserves full snapshots and supports no native/GPU cause claim", async () => {
  assert.equal(observer.sequence, 74); assert.equal(observer.snapshots.length, 74);
  assert.equal(observer.evictedSnapshots, 0); assert.equal(observer.observerClosed, true);
  assert.equal(observer.productionAcceptance, false); assert.equal(observer.noForcedGarbageCollection, true);
  assert.deepEqual(observer.gpuLogs, []);
  for (const run of [1, 2, 3]) {
    const rows = observer.snapshots.filter(row => row.phase === `conversion-${run}`);
    assert.ok(rows.length > 0);
    assert.ok(rows.flatMap(row => row.targets ?? []).some(target => target.type === "worker" &&
      target.url.includes("/assets/direct-file-writer.worker-") && Number.isFinite(target.usedJSHeapBytes)));
    const phase = observer.phases.find(row => row.phase === `conversion-${run}`);
    assert.ok(phase.peakWorkerUsedJSHeapBytes < 2 * 1048576);
    assert.equal(phase.unavailableWorkerHeaps, 0);
    assert.ok(observer.phases.find(row => row.phase === `cleanup-${run}`).peakWorkerUsedJSHeapBytes < 0.6 * 1048576);
  }
  const analysis = JSON.parse(await read("evidence/aiff-id3-direct-diagnostic-analysis-2026-10-10.json"));
  assert.equal(analysis.proof.sha256, sha(proofBytes));
  assert.equal(analysis.sourceSha256, sha(await read("scripts/analyze-aiff-id3-direct-diagnostic.mjs")));
  assert.equal(analysis.workerHeapMeasurementsAvailable, 68); assert.equal(analysis.unavailableWorkerHeapMeasurements, 0);
  assert.equal(analysis.allocationCauseEstablished, false); assert.equal(analysis.sourceOrCodecOrQualityFixImplemented, false);
  assert.deepEqual(analysis.processExclusions, []);
  assert.match(analysis.next, /bounded-renderer-attribution/);
  for (const sample of raw.samples) {
    assert.ok(observer.snapshots.some(row => row.sequence === sample.diagnosticHeaps.sequence));
    if (sample.privateBytes !== null) assert.equal(sample.privateBytes, sample.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  }
});

test("Frozen executed launcher/driver/source hashes, hidden/headless roles, lossless archives and finally cleanup match actual terminal", async () => {
  assert.equal(launch.childExitCode, 0); assert.equal(launch.failure, null);
  assert.equal(launch.diagnosticOnly, true); assert.equal(launch.productionAcceptance, false);
  assert.equal(launch.absence.status, "owned-identity-absent");
  assert.equal(proof.runner.absence.status, "owned-identity-absent");
  for (const helper of proof.helperProof.launches) assert.equal(helper.absence.status, "owned-identity-absent");
  const outer = makeAiffId3DiagnosticLaunchRecipe((await read("scripts/validate-aiff-id3-stress.mjs")).toString(), root);
  assert.equal((await restore(launch.executedLaunch)).toString(), outer.generated);
  const driver = makeAiffId3DiagnosticRecipe((await read("scripts/memory-profile.mjs")).toString(), root, proof.ownedRuntime);
  assert.equal((await restore(proof.executedSource)).toString(), driver.generated);
  assert.equal(driver.generatedSha256, proof.recipeGeneratedSha256);
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), hash, file);
  for (const entry of proof.retainedReports) await restore(entry);
  assert.equal(raw.browser.headless, true); assert.equal(proof.subprocessWindowsHidden, true);
  assert.deepEqual(proof.helperProof.forbiddenRequests, []); assert.equal(raw.cancellationCheck.passed, true);
  assert.equal(proof.assetsRestored, true); assert.equal(proof.ownedRuntimeRemoved, true);
  for (const directory of [proof.ownedRuntime, proof.ownedRawReportDirectory, proof.helperProof.runtime, launch.ownedRuntime])
    await assert.rejects(access(directory), { code: "ENOENT" });
  for (const name of ["within-aiff.mjs", "within-aiff.wasm"])
    assert.equal(sha(await read("dist/client/engines/remux/" + name)), sha(await read("public/engines/remux/" + name)));
});

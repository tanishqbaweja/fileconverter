import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { makeAiffId3NativeAttributionRecipe, makeAiffId3NativeAttributionLaunchRecipe } from "../scripts/lib/aiff-id3-native-attribution-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proof = JSON.parse(await read("evidence/2026-10-10T09-18-16-934Z-aiff-id3-direct-handle-native-attribution.json"));
const launch = JSON.parse(await read("evidence/2026-10-10T09-18-16-877Z-aiff-id3-native-attribution-launch.json"));
async function restore(row) {
  const bytes = await read(row.path); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
  const value = gunzipSync(bytes, { maxOutputLength: 16777216 });
  assert.equal(value.length, row.restoredBytes); assert.equal(sha(value), row.restoredSha256); return value;
}
test("Actual native diagnostic completed three genuine identical outputs and250MiB accounting, but never promotes earlier failed route", async () => {
  assert.equal(proof.failure, null); assert.equal(launch.childExitCode, 0); assert.equal(proof.diagnosticOnly, true);
  for (const field of ["publicAcceptance", "multiGigabyteScalingAcceptance", "speedImprovementProven"]) assert.equal(proof[field], false);
  assert.equal(proof.fixture.bytes, 140922233); assert.equal(proof.fixture.sha256, "cd5b778644222d68e391fcbbe3c4845c6872cab92b7726d85437e7720590fdee");
  const report = JSON.parse(await restore(proof.retainedReports.find(row => row.path.endsWith(".json.gz"))));
  assert.equal(report.runs.length, 3); assert.equal(report.blankBaseline.privateBytes, 270032896);
  assert.equal(report.incrementalPrivateMiB, 249.96484375);
  assert.equal(report.incrementalPrivateMiB, (report.peakPrivateBytes - report.blankBaseline.privateBytes) / 1048576);
  assert.equal(report.cancellationCheck.passed, true);
  for (const run of report.runs) {
    assert.equal(run.outputBytes, 153600760); assert.equal(run.sha256, "8295fda722e8b578b18fa88bad0e9c6ae24ec35a27942900c998ddd6848f0dd2");
    assert.equal(run.mediaProbe.withinValidation.passed, true); assert.equal(run.mediaProbe.withinArtworkValidation.passed, true);
    assert.equal(run.peakWasmMemoryBytes, 16777216); assert.equal(run.maxReadChunkBytes, 262144);
    assert.ok(run.maxWriteChunkBytes <= 262144 && run.peakQueuedBytes <= 262144 && run.peakPendingOperations <= 1);
    assert.ok(run.cleanupDeltaFromLoadedMiB <= 96);
  }
  const previous = JSON.parse(await read("evidence/2026-10-10T08-31-05-604Z-aiff-id3-direct-handle-stress.json"));
  assert.equal(previous.reportSummary.incrementalPrivateMiB, 260.72265625); assert.ok(previous.failure);
  assert.deepEqual(proof.buildProof, previous.buildProof);
  for (const [file, digest] of Object.entries(previous.sourcePins)) assert.equal(proof.sourcePins[file], digest);
});
test("Eight actual bounded allocator dumps preserve distinct GUID intervals, all native accounting and overlapping providers without causal claims", async () => {
  const native = JSON.parse(await restore(proof.nativeAttributionEvidence)), result = native.result;
  assert.equal(native.productionAcceptance, false); assert.equal(native.allocationCauseProven, false); assert.equal(native.error, null);
  assert.equal(result.status, "completed-diagnostic"); assert.equal(result.trace.serializedBytes, 8751110);
  assert.equal(result.trace.events, 2363); assert.equal(result.trace.dataLossOccurred, false); assert.equal(result.trace.overflow, false);
  assert.equal(result.trace.rawRetained, false); assert.equal(result.realmRows.length, 687); assert.equal(result.realmRowsEvicted, 0);
  assert.equal(result.dumps.length, 8); assert.ok(result.dumps.every(row => row.memoryDump.success));
  assert.equal(new Set(result.dumps.map(row => row.memoryDump.dumpGuid)).size, 8);
  for (const phase of result.allocatorSummary) {
    assert.equal(phase.acceptanceMetric, false); assert.equal(phase.summedAllocatorTotal, null); assert.equal(phase.allocatorValuesOverlap, true);
    assert.ok(phase.traceIntervalMicroseconds[1] >= phase.traceIntervalMicroseconds[0]);
  }
  const analysis = JSON.parse(await read("evidence/aiff-id3-native-attribution-analysis-2026-10-10.json"));
  assert.equal(analysis.allocationCauseProven, false); assert.equal(analysis.productionFix, false);
  assert.equal(analysis.previousFailure.remainsFailed, true); assert.equal(analysis.selectedRows.length, 8);
  assert.ok(analysis.peakAccounting.every(row => row.allRowsIncluded && row.validSamples > 0 && row.unavailableSamples === 0));
  assert.equal(analysis.analyzerSha256, sha(await read("scripts/analyze-aiff-id3-native-attribution.mjs")));
});
test("Actual native launcher/driver/source archives match execution; hidden/headless helpers absent, normal assets restored and disposable local data gone", async () => {
  for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), digest, file);
  const generated = makeAiffId3NativeAttributionRecipe((await read("scripts/memory-profile.mjs")).toString(), root, proof.ownedRuntime);
  assert.equal(sha(await restore(proof.executedSource)), generated.generatedSha256);
  const outer = makeAiffId3NativeAttributionLaunchRecipe((await read("scripts/validate-aiff-id3-stress.mjs")).toString(), root);
  assert.equal(sha(await restore(launch.executedLaunch)), outer.generatedSha256);
  for (const archive of [...proof.retainedReports, proof.diagnosticObserverEvidence, proof.nativeAttributionEvidence]) await restore(archive);
  assert.equal(proof.browserMode, "headless"); assert.equal(proof.subprocessWindowsHidden, true); assert.equal(launch.subprocessWindowsHidden, true);
  assert.equal(proof.assetsRestored, true); assert.equal(proof.ownedRuntimeRemoved, true); assert.equal(proof.ownedRawReportsRemoved, true);
  assert.equal(proof.runner.absence.status, "owned-identity-absent"); assert.equal(launch.absence.status, "owned-identity-absent");
  assert.deepEqual(proof.helperProof.forbiddenRequests, []);
  for (const role of proof.helperProof.launches) assert.equal(role.absence.status, "owned-identity-absent");
  for (const directory of [proof.ownedRuntime, proof.ownedRawReportDirectory, launch.ownedRuntime]) await assert.rejects(access(directory), { code: "ENOENT" });
  for (const name of ["within-aiff.mjs", "within-aiff.wasm"])
    assert.equal(sha(await read(`dist/client/engines/remux/${name}`)), sha(await read(`public/engines/remux/${name}`)));
});

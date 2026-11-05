// Offline receipt checks only: these never repeat a browser conversion.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import { analyzeVp9NativeAllocation } from "../scripts/lib/vp9-native-allocation-analysis.mjs";
const root = new URL("../", import.meta.url), base = "evidence/2026-11-05-webcodecs-vp9-fallback-native-allocation";
const read = file => readFile(new URL(file, root)), sha = bytes => createHash("sha256").update(bytes).digest("hex");
async function detailed() {
  const report = JSON.parse(await read(base + ".json"));
  if (!report.rawArchive) return report;
  const packed = await read(report.rawArchive.file), raw = gunzipSync(packed, { maxOutputLength: 8388608 });
  assert.equal(sha(packed), report.rawArchive.sha256); assert.equal(sha(raw), report.rawArchive.decodedSha256);
  assert.equal(raw.length, report.rawArchive.decodedBytes); return JSON.parse(raw);
}
test("four actual native dumps narrow categories without changing full-tree failure or inventing allocation causality", async () => {
  const report = await detailed(), result = analyzeVp9NativeAllocation(report);
  assert.equal(result.incrementalPrivateMiB, 266.7109375); assert.equal(result.blankPrivateBytes, 354217984);
  assert.equal(result.simultaneousPeakPrivateBytes, 633884672); assert.equal(result.dominantRenderer.pid, 2608);
  assert.equal(result.counterNodesOverlap, true); assert.equal(result.summedAllocatorTotal, null);
  assert.equal(result.snapshotsAreNotPeakTimeAttribution, true); assert.equal(result.noNativeAllocationStackIdentified, true);
  assert.equal(result.allPrimaryProcessesRetained, true); assert.equal(result.newBrowserRuns, 0);
  assert.deepEqual(result.series.map(x => x.mallocAllocatedObjectsBytes), [17127172, 38997008, 62223652, 65960624]);
  assert.deepEqual(result.series.map(x => x.bufferAllocatedObjectsBytes), [4098848, 11825328, 25051744, 25058752]);
  assert.deepEqual(result.series.map(x => x.v8ReportedSizeBytes), [12818356, 13383808, 13375596, 13375596]);
  assert.equal(result.acceptedOptimization, false); assert.equal(result.publicAcceptance, false);
});
test("missing allocator counters remain null, never converted into a zero delta", async () => {
  const report = await detailed();
  const process = report.nativeAllocation.checkpoints[0].result.summary[0].processes.find(x => x.pid === 2608);
  delete process.liveAllocatorCounters.v8.size;
  const result = analyzeVp9NativeAllocation(report);
  assert.equal(result.series[0].v8ReportedSizeBytes, null); assert.equal(result.loadedIdleToOutputClosedDeltas.v8ReportedSizeBytes, null);
});
test("matching PID alone is insufficient when a checkpoint parent or birth differs", async () => {
  for (const key of ["parentPid", "createdAt"]) {
    const report = await detailed(), process = report.nativeAllocation.checkpoints[1].processSample.processes.find(x => x.pid === 2608);
    process[key] = key === "parentPid" ? 999999 : "2026-11-05T00:00:00Z";
    assert.throws(() => analyzeVp9NativeAllocation(report), /PID\/parent\/birth/);
  }
});
test("primary totals and phase coverage cannot be silently narrowed in the analysis", async () => {
  const report = await detailed(); report.memory.peak.processes.pop(); assert.throws(() => analyzeVp9NativeAllocation(report));
  const changed = await detailed(); changed.nativeAllocation.checkpoints.pop(); assert.throws(() => analyzeVp9NativeAllocation(changed));
});
test("actual diagnostic remains genuine decoded output, perturbed/non-acceptance, with complete cleanup and original integrity", async () => {
  const report = await detailed(); assert.equal(report.executedHead, "91b80f0a674bfc14b590a2413d6427378991fe6a");
  assert.equal(report.browserPin.version, "156.0.8078.80"); assert.equal(report.browserResult.type, "complete");
  assert.equal(report.browserResult.metrics.activeWorkerCount, 1); assert.equal(report.browserResult.metrics.wasmMemoryBytes, 33554432);
  assert.equal(report.fixture.sha256, "4fad7ea6c1dd0d374b1b69201b6af4b68e8518bf2672884d23b1f136f5f2cc46");
  assert.equal(report.exportedBytes, 99405); assert.equal(report.independentFullDecodePassed, true);
  assert.equal(Number(report.outputProbe.streams[0].nb_read_frames), 48); assert.equal(Number(report.outputProbe.format.duration), 1.958);
  assert.equal(report.memory.validSamples, 53); assert.equal(report.memory.unavailableSamples, 0);
  assert.equal(report.diagnosticPerturbsMemoryAndTiming, true); assert.equal(report.speedGainProven, false); assert.equal(report.publicAcceptance, false);
  assert.deepEqual(report.realmSamples.map(x => x.sample.targets.length), [2, 3, 3, 3, 3, 2]);
  assert.ok(report.realmSamples.every(x => x.sample.targets.every(t => t.error === null)));
  assert.equal(report.processCleanup.length, 3); assert.ok(report.processCleanup.every(x => x.status === "owned-identity-absent"));
  assert.equal(report.ownedRuntimeRemoved, true); assert.equal(report.ownedStaticStageRemoved, true);
  assert.equal(report.browserPinFinalCheck, "verified"); assert.deepEqual(report.originalBefore, report.originalAfter);
  assert.equal(report.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.deepEqual(report.forbiddenRequests, []);
  for (const row of report.nativeAllocation.checkpoints) {
    assert.equal(row.error, null); assert.equal(row.result.dataLossOccurred, false);
    const filename = `evidence/2026-11-05-webcodecs-vp9-native-allocation-${row.label}.trace.json.gz`, packed = await read(filename);
    const raw = gunzipSync(packed, { maxOutputLength: 8388608 }); assert.equal(sha(packed), row.result.archive.sha256);
    assert.equal(sha(raw), row.result.archive.restoredSha256); assert.equal(raw.length, row.result.archive.restoredBytes);
  }
});
test("lossless report compaction retains exact failed raw data and independently regenerates the category analysis", async () => {
  const manifest = JSON.parse(await read(base + "-archive.json")), compact = await read(manifest.report);
  assert.equal(sha(compact), manifest.compactSha256); assert.equal(manifest.originalBytes, 4487393);
  assert.equal(manifest.retainedReportBytes, 539838); assert.equal(manifest.allTraceHashesVerified, true);
  assert.equal(manifest.allRoundtripsVerified, true); assert.equal(manifest.convertedFilesRead, false);
  assert.equal(manifest.acceptanceChanged, false);
  const detailedReport = await detailed();
  assert.deepEqual(analyzeVp9NativeAllocation(detailedReport), JSON.parse(await read(manifest.analysis)));
});
test("native diagnostic recipe is reversible and retains exact primary baseline, memory and independent decode gates", async () => {
  const recipe = JSON.parse(await read(base + "-recipe.json")), source = (await read("scripts/test-webcodecs-vp9-smoke.mjs")).toString();
  assert.equal(sha(source), recipe.parentSha256); let generated = source;
  for (const [before, after] of recipe.edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  assert.equal(sha(generated), recipe.generatedSha256);
  assert.equal(gunzipSync(Buffer.from(recipe.generatedSourceGzipBase64, "base64"), { maxOutputLength: 1048576 }).toString(), generated);
  assert.equal(recipe.nativeAllocationDiagnostic, true); assert.equal(recipe.observationPerturbsTimingAndMemory, true);
  assert.equal(recipe.baselineFormulaChanged, false); assert.equal(recipe.baselineWindowOrThresholdChanged, false);
  assert.equal(recipe.publicAcceptance, false); assert.equal(recipe.noForcedGarbageCollection, true);
  assert.ok(generated.includes('assert.equal(report.blankBaseline?.stable, true, "Stable blank baseline remains required'));
  assert.ok(generated.includes('peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250'));
  assert.ok(generated.includes('report.independentFullDecodePassed = true'));
  for (const [before, after] of recipe.edits.toReversed()) { assert.equal(generated.split(after).length, 2); generated = generated.replace(after, before); }
  assert.equal(generated, source);
});

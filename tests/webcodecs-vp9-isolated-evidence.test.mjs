// Authenticate one genuine private small conversion; never replay it for green.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { build } from "esbuild";
const root = new URL("../", import.meta.url), base = "evidence/2026-11-05-webcodecs-vp9-isolated-fallback";
const read = file => readFile(new URL(file, root)), sha = bytes => createHash("sha256").update(bytes).digest("hex");
async function detailed() {
  const compact = JSON.parse(await read(base + ".json")), packed = await read(compact.rawArchive.file);
  const raw = gunzipSync(packed, { maxOutputLength: 4194304 });
  assert.equal(sha(packed), compact.rawArchive.sha256); assert.equal(sha(raw), compact.rawArchive.decodedSha256);
  assert.equal(raw.length, compact.rawArchive.decodedBytes); return JSON.parse(raw);
}
test("one real isolated browser fallback passed exact full-tree memory with genuine independent48-frame decode", async () => {
  const r = await detailed(), result = r.browserResult;
  assert.equal(r.executedHead, "4dcb07cebc776c03d4c6611d20ec8de4150bc9ad"); assert.equal(r.browserPin.version, "156.0.8078.80");
  assert.equal(r.status, "passed-one-small-private-browser-conversion-not-public-or-stress-acceptance");
  assert.equal(r.workerIsolation, true); assert.equal(r.diagnosticPerturbsMemoryAndTiming, undefined);
  assert.equal(r.fixture.bytes, 58389); assert.equal(r.fixture.sha256, "4fad7ea6c1dd0d374b1b69201b6af4b68e8518bf2672884d23b1f136f5f2cc46");
  assert.equal(r.blankBaseline.privateBytes, 345636864); assert.equal(r.memory.peak.privateBytes, 583700480);
  assert.equal(r.memory.incrementalPrivateMiB, (583700480 - 345636864) / 1048576);
  assert.equal(r.memory.incrementalPrivateMiB, 227.03515625); assert.equal(r.memory.validSamples, 21); assert.equal(r.memory.unavailableSamples, 0);
  assert.equal(result.type, "complete"); assert.equal(result.selection.backend, "wasm");
  assert.equal(result.selection.wasmFallbackCore, "single-thread"); assert.match(result.selection.fallbackReason, /2\/2\/1\/1/);
  assert.equal(result.writeAttempts, 3); assert.equal(result.cleanupComplete, true);
  assert.equal(result.metrics.activeWorkerCount, 2); assert.equal(result.metrics.wasmMemoryBytes, 33554432);
  assert.equal(result.metrics.peakPendingOperations, 1); assert.equal(result.metrics.peakQueuedBytes, 98994);
  assert.equal(result.encoder.frames, 0); assert.equal(result.encoder.closed, true); assert.equal(result.encoder.pendingPacketBytes, 0);
  assert.equal(r.exportedBytes, 99405); assert.equal(r.outputProbe.streams[0].codec_name, "vp9");
  assert.equal(Number(r.outputProbe.streams[0].nb_read_frames), 48); assert.equal(Number(r.outputProbe.format.duration), 1.958);
  assert.equal(r.independentFullDecodePassed, true); assert.equal(result.elapsedMs, 1457.2399999946356);
  assert.equal(r.publicAcceptance, false); assert.equal(r.fullStressAcceptance, false); assert.equal(r.speedGainProven, false);
});
test("termination requests are recorded honestly without claiming synchronous realm reclamation", async () => {
  const r = await detailed(); assert.deepEqual(r.browserResult.isolation, { childrenStarted: 2, terminationRequests: 2,
    maximumOwnedChildHandles: 1, coordinatorWorkers: 1, candidateTerminationRequestedBeforeFallback: true,
    synchronousTerminationConfirmed: false, actualPeakWorkerRealms: null });
  assert.equal(r.processCleanup.length, 3); assert.ok(r.processCleanup.every(x => x.status === "owned-identity-absent"));
  assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.ownedStaticStageRemoved, true); assert.equal(r.browserPinFinalCheck, "verified");
  assert.deepEqual(r.forbiddenRequests, []); assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.equal(r.originalAfter.bytes, 2958573265); assert.equal(r.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
});
test("isolated coordinator contains no native engine and the executed private bundle is reproducible from current source", async () => {
  const compiled = await build({ entryPoints: ["workers/webcodecs-vp9-isolated.worker.ts"], bundle: true, format: "esm", platform: "browser", write: false });
  assert.equal(compiled.outputFiles.length, 1); assert.equal(sha(compiled.outputFiles[0].contents), (await detailed()).isolatedWorkerSha256);
  assert.doesNotMatch(compiled.outputFiles[0].text, /WebAssembly|ccall|within_remux|loadWebCodecsVp9Core/);
  assert.match(compiled.outputFiles[0].text, /new Worker\("\/engines\/webcodecs-vp9\/qualification\.mjs"/);
});
test("raw archive and reversible driver retain every baseline, correctness and250MiB gate", async () => {
  const saved = JSON.parse(await read("evidence/2026-11-05-webcodecs-vp9-isolated-control-archive.json")), row = saved.reports[0];
  assert.equal(saved.reports.length, 1); assert.equal(saved.allRoundtripsVerified, true); assert.equal(sha(await read(row.file)), row.compactSha256);
  const recipe = JSON.parse(await read(base + "-recipe.json")), source = (await read("scripts/test-webcodecs-vp9-smoke.mjs")).toString();
  assert.equal(sha(source), recipe.parentSha256); let generated = source;
  for (const [before, after] of recipe.edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  assert.equal(sha(generated), recipe.generatedSha256); assert.equal(recipe.isolatedFallback, true);
  assert.equal(recipe.baselineFormulaChanged, false); assert.equal(recipe.baselineWindowOrThresholdChanged, false);
  assert.ok(generated.includes('assert.equal(report.blankBaseline?.stable, true, "Stable blank baseline remains required'));
  assert.ok(generated.includes('peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250'));
  assert.ok(generated.includes('report.independentFullDecodePassed = true'));
  for (const [before, after] of recipe.edits.toReversed()) generated = generated.replace(after, before);
  assert.equal(generated, source);
});

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeAsyncifyStorageFullCaller, makeAllocationAttemptFullDriver, loadQualifiedAttemptMediaSources, makeQualifiedAttemptFullStager } from "../scripts/lib/asyncify-storage-full-recipe.mjs";
import { makeDurablePacketCacheFullCaller } from "../scripts/lib/durable-packet-cache-full-recipe.mjs";
import { createAttemptPlaneCandidate, verifyAttemptPlaneCandidate } from "../scripts/lib/asyncify-storage-full-candidate.mjs";
import { captureLayeredFullSourcePins, FULL_SOURCE_LAYER_LIMITS } from "../scripts/lib/asyncify-storage-layered-source-archive.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
test("full caller reverses exactly to original durable gates, covers all346 prior sources and changed qualified candidate", async () => {
  const parent = await makeDurablePacketCacheFullCaller(root), next = await makeAsyncifyStorageFullCaller(root);
  let reverse = next.generated; for (const [before, after] of next.asyncifyEdits.toReversed()) reverse = reverse.replaceAll(after, before);
  assert.equal(reverse, parent.generated); syntax(next.generated);
  assert.ok(next.generated.includes("captureLayeredFullSourcePins(root, [...new Set("), "Deduplicate source references, never raise384 cap or omit unique source");
  const previous = JSON.parse(await read("evidence/2026-10-12T10-18-33-321Z-packet-cache-original-full-terminal.json"));
  for (const file of Object.keys(previous.sourcePins)) assert.ok(next.extraFiles.includes(file));
  for (const token of ["requestedRuns: 3", "21600000", "primaryLimitMiB: 250", "nativeBitRate: 4000000", "32 * 1024 ** 3", "protectedSource()", "finishOwnedCleanup(actions)", "raw.forbiddenRequests, []"])
    assert.ok(next.generated.includes(token), token);
});
test("actual qualified glue/close adapter, candidate and full driver preserve native hashes, original gates and added lifecycle assertions", async () => {
  const runtime = await createOwnedRuntimeScratch("allocation-attempt-full-wrapper-"), candidate = await createOwnedRuntimeScratch("allocation-attempt-media-");
  try {
    const qualified = await loadQualifiedAttemptMediaSources(root), composition = await createAttemptPlaneCandidate(root, candidate.directory);
    assert.deepEqual(composition.manifest, qualified.report.manifest);
    assert.deepEqual(await verifyAttemptPlaneCandidate(root, candidate.directory), qualified.report.manifest);
    const caller = await makeAsyncifyStorageFullCaller(root), files = [...new Set([...caller.extraFiles, ...Object.keys(qualified.proof.sourcePins), qualified.reference.path,
      qualified.proof.generatedArchive.path, qualified.proof.report.archive.path])];
    const snapshot = await captureLayeredFullSourcePins(root, files); assert.ok(snapshot.files.length <= 384); assert.ok(snapshot.additiveRestoredBytes <= 2097152);
    assert.deepEqual(snapshot.limits, FULL_SOURCE_LAYER_LIMITS); assert.equal(snapshot.historicalFilesRetained, 256);
    const driver = await makeAllocationAttemptFullDriver(root, runtime.directory, path.basename(candidate.directory), snapshot.files);
    assert.equal(driver.originalAcceptanceGatesByteExact, true); assert.deepEqual(driver.manifest, qualified.report.manifest);
    assert.deepEqual(driver.adapter, qualified.adapter); syntax(driver.generated);
    for (const token of ["suspension.allocations,1", "suspension.frees,1", "suspension.activeLeases,0", "suspension.reservationBytes,262156", "asyncifyStorageFinalSamples", "startClockFencedNativeBudgetFailureObserver", "native-checkpoint.json", "ssim >= 0.98", "maximumConversionMs", "blankBaseline", "windowsHide: true"])
      assert.ok(driver.generated.includes(token), token);
    const stager = await makeQualifiedAttemptFullStager(root, path.basename(candidate.directory)); syntax(stager.generated);
    let original = stager.generated; for (const [before, after] of stager.asyncifyEdits.toReversed()) original = original.replaceAll(after, before);
    assert.equal(original, qualified.archive.generated.stage);
  } finally { await candidate.close(); await runtime.close(); await assert.rejects(access(candidate.directory), { code: "ENOENT" }); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
});
test("supervisor derivative changes only identity/target/report prefix and preserves hidden detached bounded cleanup", async () => {
  const old = (await read("scripts/launch-durable-packet-cache-supervisor.mjs")).toString(), next = (await read("scripts/launch-asyncify-storage-supervisor.mjs")).toString();
  assert.equal(next.replaceAll("scripts/launch-asyncify-storage-supervisor.mjs", "scripts/launch-durable-packet-cache-supervisor.mjs")
    .replaceAll("scripts/run-asyncify-storage-original-full.mjs", "scripts/run-durable-packet-cache-original-full.mjs")
    .replaceAll("asyncify-storage-supervisor", "packet-cache-supervisor").trimEnd(), old.trimEnd());
  for (const token of ["windowsHide: true", "detached: true", "heartbeatSeconds: 60", "runtime.close()", "noAutomaticRestart: true"])
    assert.ok(next.includes(token), token);
});

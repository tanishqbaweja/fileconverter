import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeInputReadFullCaller, makeInputReadFullDriver, loadQualifiedInputReadMedia, makeInputReadFullStager } from "../scripts/lib/input-read-full-recipe.mjs";
import { makeAsyncifyStorageFullCaller, makeAllocationAttemptFullDriver } from "../scripts/lib/asyncify-storage-full-recipe.mjs";
import { createAttemptPlaneCandidate } from "../scripts/lib/asyncify-storage-full-candidate.mjs";
import { captureLayeredFullSourcePins, verifyPacketCacheLayeredPreimage, FULL_SOURCE_LAYER_LIMITS } from "../scripts/lib/input-read-layered-source-archive.mjs";
import { FULL_SOURCE_LAYER_LIMITS as oldLimits } from "../scripts/lib/asyncify-storage-layered-source-archive.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
function syntax(source) { const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 }); assert.equal(result.status, 0, result.stderr); }
function reverse(recipe) { let value = recipe.generated; for (const [before, after] of recipe.inputReadEdits.toReversed()) value = value.replaceAll(after, before); return value; }
test("full caller retains all365 prior sources, reverses to all old full gates and exposes bounded native read-error records", async () => {
  const parent = await makeAsyncifyStorageFullCaller(root), next = await makeInputReadFullCaller(root);
  assert.equal(reverse(next), parent.generated); syntax(next.generated);
  const prior = JSON.parse(await read("evidence/2026-10-12T14-43-54-627Z-asyncify-storage-original-full-terminal.json"));
  for (const file of Object.keys(prior.sourcePins)) assert.ok(next.extraFiles.includes(file));
  for (const token of ["requestedRuns: 3", "21600000", "primaryLimitMiB: 250", "nativeBitRate: 4000000", "32 * 1024 ** 3", "protectedSource()", "finishOwnedCleanup(actions)", "raw.forbiddenRequests, []", "inputReadFailureSamples.length <= 6"])
    assert.ok(next.generated.includes(token), token);
});
test("actual162-source qualified read helper/stager, unchanged native artifacts and fresh full driver preserve old gates", async () => {
  const runtime = await createOwnedRuntimeScratch("allocation-attempt-full-wrapper-"), candidate = await createOwnedRuntimeScratch("allocation-attempt-media-");
  try {
    const qualified = await loadQualifiedInputReadMedia(root), composition = await createAttemptPlaneCandidate(root, candidate.directory);
    assert.deepEqual(composition.manifest, qualified.report.manifest);
    const caller = await makeInputReadFullCaller(root), files = [...new Set([...caller.extraFiles, ...Object.keys(qualified.proof.sourcePins), qualified.reference.path,
      qualified.proof.generatedArchive.path, qualified.proof.report.archive.path])];
    const snapshot = await captureLayeredFullSourcePins(root, files); assert.ok(snapshot.files.length <= 384); assert.ok(snapshot.additiveRestoredBytes <= 2097152);
    assert.deepEqual(snapshot.limits, oldLimits); assert.deepEqual(FULL_SOURCE_LAYER_LIMITS, oldLimits); assert.equal(snapshot.historicalFilesRetained, 256);
    const name = path.basename(candidate.directory), driver = await makeInputReadFullDriver(root, runtime.directory, name, snapshot.files);
    const parent = await makeAllocationAttemptFullDriver(root, runtime.directory, name, snapshot.files);
    assert.equal(reverse(driver), parent.generated); assert.deepEqual(driver.adapter, qualified.adapter); syntax(driver.generated);
    for (const token of ["inputReadFailureSamples", "WITHIN_INPUT_READ_FAILURE", "A completed conversion must have no input read failures", "suspension.frees,1", "ssim >= 0.98", "maximumConversionMs", "blankBaseline", "native-checkpoint.json", "windowsHide: true"])
      assert.ok(driver.generated.includes(token), token);
    assert.ok(!driver.generated.includes("__WITHIN_INPUT_READ_CONTROL__"), "The full driver cannot enable injected faults");
    const stager = await makeInputReadFullStager(root, name); syntax(stager.generated); assert.equal(reverse(stager), qualified.archive.generated.stage);
    const terminal = "evidence/2026-10-12T14-43-54-627Z-asyncify-storage-original-full-terminal.json";
    const reference = snapshot.additiveSourcePreimages[terminal]; assert.equal(reference.encoding, "qualified-external-json");
    assert.deepEqual(await verifyPacketCacheLayeredPreimage(root, terminal, reference), await read(terminal));
    await assert.rejects(verifyPacketCacheLayeredPreimage(root, terminal, { ...reference, sha256: "0".repeat(64) }));
    await assert.rejects(verifyPacketCacheLayeredPreimage(root, terminal, { ...reference, encoding: "qualified-external-gzip" }));
  } finally { await candidate.close(); await runtime.close(); await assert.rejects(access(candidate.directory), { code: "ENOENT" }); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
});
test("hidden supervisor differs only in owned identity/target/report prefix; external archive caps unchanged", async () => {
  const old = (await read("scripts/launch-asyncify-storage-supervisor.mjs")).toString(), next = (await read("scripts/launch-input-read-supervisor.mjs")).toString();
  assert.equal(next.replaceAll("scripts/launch-input-read-supervisor.mjs", "scripts/launch-asyncify-storage-supervisor.mjs")
    .replaceAll("scripts/run-input-read-original-full.mjs", "scripts/run-asyncify-storage-original-full.mjs")
    .replaceAll("input-read-supervisor", "asyncify-storage-supervisor").trimEnd(), old.trimEnd());
  for (const token of ["windowsHide: true", "detached: true", "heartbeatSeconds: 60", "runtime.close()", "noAutomaticRestart: true"])
    assert.ok(next.includes(token), token);
});

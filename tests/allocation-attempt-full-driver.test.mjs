import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { loadHistoricalFullSourceBase } from "../scripts/lib/layered-full-source-archive.mjs";
import { makeAllocationAttemptFullDriver } from "../scripts/lib/allocation-attempt-full-driver.mjs";
const root = path.resolve(import.meta.dirname, "..");
const additions = ["scripts/lib/allocation-attempt-full-driver.mjs", "tests/allocation-attempt-full-driver.test.mjs",
  "scripts/lib/layered-full-source-archive.mjs", "scripts/lib/qualified-attempt-full-stager.mjs", "scripts/lib/composite-allocation-failure-record.mjs", "scripts/stage-allocation-attempt-full.mjs", "tests/layered-full-preparation.test.mjs"];
async function requested() { const media = JSON.parse(await readFile(path.join(root, "evidence/2026-10-11T13-23-21-737Z-allocation-attempt-media.json"))); return [...Object.keys(media.sourcePins), ...additions]; }
test("new full driver reverses EXACT executed old driver, retains every original stress/quality/memory gate, and hashes all306 layered files", async () => {
  const base = await loadHistoricalFullSourceBase(root), recipe = await makeAllocationAttemptFullDriver(root, path.join(root, "work/allocation-attempt-full-wrapper-UNITONLY"), "allocation-attempt-media-UNITONLY", await requested());
  let reversed = recipe.generated;
  for (const { before, after, count } of recipe.edits.toReversed()) { assert.equal(reversed.split(after).length - 1, count); reversed = reversed.replaceAll(after, before); }
  assert.equal(reversed, base.archive.generated); assert.equal(sha(recipe.generated), recipe.generatedSha256);
  assert.equal(recipe.sourceFiles.length, 306); assert.equal(recipe.additiveFiles.length, 50); assert.equal(recipe.historicalFilesRetained, 256);
  assert.equal(recipe.originalAcceptanceGatesByteExact, true); assert.equal(recipe.publicAcceptance, false); assert.equal(recipe.fullOriginalAcceptance, false);
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
  for (const token of ["const expectedSourceBytes = 2958573265;", "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34",
    "const diagnosticOnly = false;", '"maximumConversionMs":21600000', "run.incrementalPrivateMiB <= 250", "requestedRuns: diagnosticOnly ? 1 : 3",
    "validateCompositeAllocationFailureRecord(row);", "await verifyAttemptPlaneCandidate(root, candidate);", "await stopNativeObserverEvenAfterPhaseFailure", "assert.ok(additiveSourceFiles.length<=128)"])
    assert.ok(recipe.generated.includes(token), token);
  // Assert all validator/baseline/conversion/cleanup code is unchanged, not just
  // selected numeric constants. No unrelated whole-run block is replaceable.
  for (const { before } of recipe.edits) {
    assert.ok(!before.includes("run.incrementalPrivateMiB")); assert.ok(!before.includes("independentValidation"));
    assert.ok(!before.includes("cancelBrowserConversionBeforeCleanup")); assert.ok(!before.includes("stableWindow("));
  }
  const staticFiles = JSON.parse(recipe.generated.match(/^const sourceFiles = (\[[\s\S]*?\]);$/m)[1]);
  assert.ok(staticFiles.length <= 256); assert.ok(staticFiles.includes("scripts/stage-allocation-attempt-full.mjs"));
  for (const file of Object.keys(base.pins)) assert.ok(recipe.sourceFiles.includes(file));
  assert.ok(!recipe.generated.includes("assert.equal(row.failedIndividualAllocationBytes,null);assert.equal(row.heapLiveBytes,null);"));
});
test("full derivation rejects unowned runtime/candidate paths and missing executed-source coverage BEFORE any launch or asset mutation", async () => {
  const files = await requested();
  for (const runtime of [path.join(root, "outside"), path.join(root, "work/foreign-runtime")])
    await assert.rejects(makeAllocationAttemptFullDriver(root, runtime, "allocation-attempt-media-UNITONLY", files));
  await assert.rejects(makeAllocationAttemptFullDriver(root, path.join(root, "work/allocation-attempt-full-wrapper-UNITONLY"), "../../outside", files));
  await assert.rejects(makeAllocationAttemptFullDriver(root, path.join(root, "work/allocation-attempt-full-wrapper-UNITONLY"), "allocation-attempt-media-UNITONLY", files.filter(f => f !== "scripts/stage-allocation-attempt-full.mjs")));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const held = JSON.parse(await read("evidence/2026-10-09T16-02-48-645Z-progress-compositing-original.json"));
const fresh = JSON.parse(await read("evidence/2026-10-09T16-09-36-433Z-progress-control-fresh-checkout.json"));

test("Actual low-RAM preflight stops before any diagnostic/browser/build/media; missing measurements remain null", () => {
  assert.equal(held.status, "failed-or-incomplete"); assert.equal(held.executions, 0);
  assert.equal(held.hostPreflight.freePhysicalBytes, 1449357312); assert.equal(held.hostPreflight.requiredPhysicalBytes, 2147483648);
  assert.equal(held.hostPreflight.safeToStart, false); assert.equal(held.hostPreflight.primaryConversionLimitMiB, 250);
  assert.equal(held.hostPreflight.primaryMemoryFormulaChanged, false); assert.equal(held.hostPreflight.noProcessesKilled, true);
  assert.match(held.failure, /false !== true/);
  for (const field of ["buildProof", "sourceArchive", "candidate", "workWindows", "ownedDriver", "driverAbsent", "wrapperPath", "wrapperAbsent"])
    assert.equal(held[field], null, field);
  assert.deepEqual(held.sourcePins, held.postSourcePins); assert.equal(Object.keys(held.sourcePins).length, 144);
  assert.equal(held.reusedBaseline.noBaselineRerun, true); assert.equal(held.productionRestored, false, "No restoration invoked, not a restoration failure");
  assert.equal(held.completeChromiumMemoryAcceptance, false); assert.equal(held.publicAcceptance, false);
});

test("Three actual recipe tests pass from bounded committed checkout without private cores/dist/dependencies/media; no full-CI claim", async () => {
  assert.equal(fresh.status, "three-recipe-tests-pass-from-isolated-committed-checkout"); assert.equal(fresh.failure, null);
  assert.equal(fresh.tests.passed, 3); assert.equal(fresh.tests.failed, 0); assert.equal(fresh.commit, "1eda9107878265fd5c3271dc8be4b330299c5e62");
  assert.equal(Object.keys(fresh.sourcePins).length, 11); assert.equal(fresh.copiedBytes, 714073);
  assert.equal(Object.values(fresh.sourcePins).reduce((sum, row) => sum + row.bytes, 0), fresh.copiedBytes);
  assert.ok(fresh.copiedBytes < 2 * 1024 ** 2); assert.equal(fresh.ownedRuntimeAbsent, true);
  assert.equal(fresh.noLocalNodeModulesOrDistOrCoreOrProtectedFixture, true); assert.equal(fresh.windowsHidden, true);
  assert.equal(fresh.noBrowserLaunch, true); assert.equal(fresh.noConversion, true); assert.equal(fresh.platform, "win32");
  for (const field of ["fullRepositoryCiAcceptance", "linuxAcceptance", "conversionAcceptance"]) assert.equal(fresh[field], false);
  for (const [file, record] of Object.entries(fresh.sourcePins)) {
    // References only committed, explicitly retained small source/report blobs.
    const bytes = await read(file); assert.equal(bytes.length, record.bytes); assert.equal(sha(bytes), record.sha256, file);
    assert.ok(!file.startsWith("work/") && !file.startsWith("dist/") && file !== "test.mkv");
  }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeSingleIdleFullDriver, verifySingleIdleAbortQualification } from "../scripts/lib/single-idle-full-recipe.mjs";
import { deriveDriverSourcePinFiles } from "../scripts/lib/driver-source-pin-union.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const receipt = JSON.parse(await read("evidence/2026-10-09T16-55-27-062Z-progress-compositing-original-full-completion.json"));
const previous = JSON.parse(gunzipSync(await read(receipt.sourceArchive.path), { maxOutputLength: 8388608 }));
const branch = JSON.parse(await read("evidence/mpeg2-single-idle-build-branch-2026-10-10.json"));
const qualification = JSON.parse(await read("evidence/mpeg2-single-idle-abort-layout-2026-10-10.json"));
test("Actual new allocator ABI qualification is byte-exact while only pool-return/parameter-set policy changes", async () => {
  verifySingleIdleAbortQualification(qualification);
  const compressed = await read(qualification.archive.path); assert.equal(sha(compressed), qualification.archive.sha256);
  const raw = gunzipSync(compressed); assert.equal(sha(raw), qualification.archive.restoredSha256);
  const bodies = JSON.parse(raw);
  for (const row of bodies.functions) { const bytes = Buffer.from(row.base64, "base64"); assert.equal(bytes.length, row.bodyBytes); assert.equal(sha(bytes), row.bodySha256); }
  for (const mutate of [p => { p.allocator.address++; }, p => { p.functions[0].bodySha256 = "0".repeat(64); }, p => { p.binary.sha256 = "0".repeat(64); }]) {
    const bad = structuredClone(qualification); mutate(bad); assert.throws(() => verifySingleIdleAbortQualification(bad));
  }
  assert.equal(qualification.wasmFunctionsExecuted, 0); assert.equal(qualification.dynamicFreeCapacityMeasured, false);
});
test("New full driver reverses exactly to executed full gate, retaining original/three repeats/quality250 and six-hour per-run deadline", () => {
  const recipe = makeSingleIdleFullDriver(previous, root, path.join(root, "work/full-prepare-only"), branch);
  let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, previous.generated);
  for (const token of ['number <= 3', 'minimumMs: 300000', 'run.incrementalPrivateMiB <= 250', 'assert.ok(ssim >= 0.98)',
    'maximumTimestampErrorSeconds <= 0.001', 'blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes',
    'expectedSourceBytes = 2958573265', '31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34',
    '"maximumConversionMs":21600000', '"partialOutputStopEnabled":false', 'Never kill an unrelated or reused PID',
    'await verifySource(); cleanup.protectedFixtureUnchanged = true', 'metrics.peakPendingOperations <= 1', '"--headless=new"',
    'scripts/stage-mpeg2-single-idle-abort.mjs', '020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837']) assert.ok(recipe.generated.includes(token), token);
  assert.ok(!recipe.generated.includes('["scripts/stage-mpeg2-late-allocator-abort.mjs", "stage"]'));
  assert.ok(!recipe.generated.includes('headless: false') && !recipe.generated.includes('windowsHide: false'));
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr);
  const coverage = deriveDriverSourcePinFiles(recipe.generated, Object.keys(receipt.sourcePins)); assert.ok(coverage.driverUniqueSourceFiles > 132);
});
test("New stager uses exact controlled observer only after new-binary/root/map qualification, with original exclusive writes/restoration", async () => {
  const stager = (await read("scripts/stage-mpeg2-single-idle-abort.mjs")).toString();
  assert.ok(stager.indexOf("verifySingleIdleAbortQualification(qualification)") < stager.indexOf("makeLateAllocatorAbortAdapter({"));
  for (const token of ["qualification.sourcePins", "qualification.binary.sha256", "qualification.mapSha256", "18330",
    "020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837", "makeSingleIdleBrowserRecipe", "await runtime.close()"])
    assert.ok(stager.includes(token), token);
  assert.ok(!stager.includes("control_pool_") && !stager.includes("control_unref"));
});

test("Full caller covers real build shell/patch inputs separately without weakening frozen source union safety", async () => {
  const source = (await read("scripts/run-single-idle-original-full.mjs")).toString();
  assert.ok(source.includes('...coverage.files, ...Object.keys(build.manifest.sources)'));
  assert.ok(source.includes('file.split("/").every(part => part && part !== "." && part !== "..")'));
  assert.ok(source.includes('if (build.manifest.sources[file] && file !== branch.workflow.path) assert.equal(pins[file], build.manifest.sources[file], file)'));
  assert.ok(source.includes('bytes.length <= 2097152'));
  assert.ok(source.includes('Existing same-candidate driver live; never restart'));
  assert.ok(source.includes('if (done && child?.exitCode === null && child?.signalCode === null) await done'));
});

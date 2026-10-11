import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { HEVC_PLANE_FULL_FILES, qualifiedStagerRecipe, failureRecordRecipe, fullDriverFactoryRecipe,
  makeHevcPlaneFullCaller, makeHevcPlaneStagerCaller, loadQualifiedAttemptMediaSources,
  makeAllocationAttemptFullDriver, validateCompositeAllocationFailureRecord } from "../scripts/lib/hevc-plane-full-recipe.mjs";
import { loadHistoricalFullSourceBase, captureLayeredFullSourcePins } from "../scripts/lib/layered-full-source-archive.mjs";
const root = path.resolve(import.meta.dirname, "..");
function check(recipe) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  for (const [before] of recipe.edits) {
    for (const gate of ["run.incrementalPrivateMiB", "independentValidation", "stableWindow(", "cancelBrowserConversionBeforeCleanup"])
      assert.ok(!before.includes(gate), gate);
  }
}
test("qualified derivatives parse and change only reversible identities/imports, not acceptance gates", async () => {
  for (const recipe of await Promise.all([qualifiedStagerRecipe(), failureRecordRecipe(), fullDriverFactoryRecipe(), makeHevcPlaneFullCaller(), makeHevcPlaneStagerCaller()])) check(recipe);
  const caller = (await makeHevcPlaneFullCaller()).generated;
  for (const gate of ["32 * 1024 ** 3", "proof.launchHostPreflight.safeToStart", "await protectedSource()", "await done", "requestedRuns: 3",
    "maximumConversionMsPerRun: 21600000", "primaryLimitMiB: 250", "assert.deepEqual(raw.sourceHashes, snapshot.pins)", "await candidateRuntime.close()"])
    assert.ok(caller.includes(gate), gate);
});
test("actual158 browser witness and all historical256 sources qualify the new full driver within unchanged layered caps", async () => {
  const media = await loadQualifiedAttemptMediaSources(root);
  assert.equal(media.reference.sourceCount, 158);
  assert.equal(media.report.manifest.artifacts["within-mpeg2-split.wasm"], "07ff8c19e9f58205f21a9cd10f6d7f0e0fb8f1e7086b810818724846117d51e4");
  const caller = (await makeHevcPlaneFullCaller()).generated;
  const oldFiles = JSON.parse(caller.match(/const callerFiles = (\[[\s\S]*?\]);/)[1]
    .replace("media.reference.path", JSON.stringify(media.reference.path))
    .replace("media.proof.generatedArchive.path", JSON.stringify(media.proof.generatedArchive.path))
    .replace("media.proof.report.archive.path", JSON.stringify(media.proof.report.archive.path)));
  const snapshot = await captureLayeredFullSourcePins(root, [...Object.keys(media.proof.sourcePins), ...oldFiles]);
  for (const file of HEVC_PLANE_FULL_FILES) assert.ok(snapshot.files.includes(file));
  assert.ok(snapshot.files.length <= 384); assert.ok(snapshot.additiveFiles.length <= 128); assert.ok(snapshot.additiveRestoredBytes <= 2097152);
  const recipe = await makeAllocationAttemptFullDriver(root, path.join(root, "work/allocation-attempt-full-wrapper-UNITONLY"), "allocation-attempt-media-UNITONLY", snapshot.files);
  let reversed = recipe.generated;
  for (const { before, after } of recipe.edits.toReversed()) reversed = reversed.replaceAll(after, before);
  assert.equal(reversed, (await loadHistoricalFullSourceBase(root)).archive.generated);
  assert.equal(recipe.qualifiedMedia.path, media.reference.path); assert.equal(recipe.originalAcceptanceGatesByteExact, true);
  check({ generated: recipe.generated, edits: recipe.edits.map(row => [row.before, row.after]) });
  assert.match(recipe.generated, /private-mpeg2-hevc-plane-full-native-100ms/);
  assert.match(recipe.generated, /stage-hevc-plane-full\.mjs/);
  assert.equal(recipe.publicAcceptance, false); assert.equal(recipe.fullOriginalAcceptance, false);
});
test("new decoder failure validator accepts actual new control and rejects old decoder identity", async () => {
  const proof = JSON.parse(await readFile(path.join(root, "evidence/2026-10-11T23-31-32-593Z-hevc-plane-abort-control.json")));
  const row = proof.result.terminal.emitted;
  validateCompositeAllocationFailureRecord(row);
  assert.throws(() => validateCompositeAllocationFailureRecord({ ...row, qualifiedBinarySha256: "9ce-not-new-binary" }));
});

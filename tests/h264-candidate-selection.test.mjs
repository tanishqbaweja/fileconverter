import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { candidateDirectory, verifyCandidateRecipe, H264_SPEED_BASELINE_COMMIT,
  H264_SPEED_BASELINE_RECIPE_SHA256 } from "../scripts/lib/h264-candidate-selection.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("private tool selection accepts only explicitly owned candidate/baseline directories", () => {
  assert.equal(candidateDirectory(root), path.join(root, "work/h264-candidate-output"));
  assert.equal(candidateDirectory(root, "h264-speed-baseline-37157670815"), path.join(root, "work/h264-speed-baseline-37157670815"));
  for (const invalid of ["../public", root, "..", "work/h264-candidate-output", "h264-dimension-baseline-37155139021"]) {
    assert.throws(() => candidateDirectory(root, invalid), /Unknown private H264 tool/);
  }
});
test("historical recipe verification reads exact pinned Git bytes instead of trusting stale current indexes", async () => {
  assert.deepEqual(await verifyCandidateRecipe(root, "a".repeat(64), "a".repeat(64)), { kind: "current", sha256: "a".repeat(64) });
  assert.deepEqual(await verifyCandidateRecipe(root, H264_SPEED_BASELINE_RECIPE_SHA256, "b".repeat(64)),
    { kind: "historical", commit: H264_SPEED_BASELINE_COMMIT, sha256: H264_SPEED_BASELINE_RECIPE_SHA256 });
  await assert.rejects(verifyCandidateRecipe(root, "c".repeat(64), "b".repeat(64)), /Unrecognized historical/);
});

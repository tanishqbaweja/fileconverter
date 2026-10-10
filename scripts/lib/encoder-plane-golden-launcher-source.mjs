// Reconstruct exact historical launcher after reversing only identity/import edits.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export const BASE_SINGLE_IDLE_GOLDEN_LAUNCHER_SHA256 = "2652024ad9f333c51eada50f971a314301a3af0dcfc9eb072a1be3ab9d7d0315";
export function makeEncoderPlaneGoldenLauncher(source) {
  assert.equal(sha(source), BASE_SINGLE_IDLE_GOLDEN_LAUNCHER_SHA256);
  const edits = [
    ['import { makeSingleIdleBrowserRecipe, verifySingleIdleBuildEvidence, verifySingleIdleGoldenReport,\n  FROZEN_BROWSER_SOURCES, SINGLE_IDLE_SLOT, SINGLE_IDLE_RUN } from "./lib/single-idle-browser-recipe.mjs";',
      'import { makeEncoderPlaneBrowserRecipe as makeSingleIdleBrowserRecipe, verifyEncoderPlaneBuildEvidence as verifySingleIdleBuildEvidence,\n  verifyEncoderPlaneGoldenReport as verifySingleIdleGoldenReport, FROZEN_BROWSER_SOURCES,\n  ENCODER_PLANE_SLOT as SINGLE_IDLE_SLOT, ENCODER_PLANE_RUN as SINGLE_IDLE_RUN } from "./lib/encoder-plane-browser-recipe.mjs";'],
    ['"evidence/mpeg2-single-idle-build-branch-2026-10-10.json"', '"evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"'],
    ['`evidence/mpeg2-single-idle-build-${SINGLE_IDLE_RUN}.json`', '`evidence/mpeg2-encoder-plane-build-${SINGLE_IDLE_RUN}.json`'],
    ['"scripts/validate-mpeg2-single-idle-goldens.mjs", "scripts/lib/single-idle-browser-recipe.mjs", "tests/mpeg2-single-idle-browser.test.mjs",',
      '"scripts/validate-mpeg2-encoder-plane-goldens.mjs", "scripts/lib/encoder-plane-browser-recipe.mjs",\n  "scripts/lib/encoder-plane-golden-launcher-source.mjs", "tests/mpeg2-encoder-plane-browser.test.mjs",'],
    ['createOwnedRuntimeScratch("single-idle-browser-goldens-")', 'createOwnedRuntimeScratch("encoder-plane-browser-goldens-")'],
    ['makeSingleIdleBrowserRecipe(sources, root, runtime.directory, stamp, branch)', 'makeSingleIdleBrowserRecipe(sources, root, runtime.directory, stamp, branch, build)'],
    ['verifySingleIdleGoldenReport(report, baseline)', 'verifySingleIdleGoldenReport(report, baseline, build)'],
    ['const file = `outputs/reports/${stamp}-single-idle-${suffix}.gz`;', 'const file = `outputs/reports/${stamp}-encoder-plane-${suffix}.gz`;'],
    ['const proofPath = `evidence/${stamp}-single-idle-browser-goldens.json`;', 'const proofPath = `evidence/${stamp}-encoder-plane-browser-goldens.json`;'],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let restored = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(restored.split(after).length, 2); restored = restored.replace(after, before); }
  assert.equal(restored, source); return generated;
}

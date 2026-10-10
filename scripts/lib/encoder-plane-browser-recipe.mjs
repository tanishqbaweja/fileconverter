// Reuse the executed five-case suite; only verified candidate identity changes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { makeSingleIdleBrowserRecipe, verifySingleIdleGoldenReport, SINGLE_IDLE_SLOT,
  SINGLE_IDLE_DECODER_SHA, FROZEN_BROWSER_SOURCES } from "./single-idle-browser-recipe.mjs";
export { FROZEN_BROWSER_SOURCES };
export const ENCODER_PLANE_RUN = "38044000567";
export const ENCODER_PLANE_SLOT = "mpeg2-encoder-planes-" + ENCODER_PLANE_RUN;
export function verifyEncoderPlaneBuildEvidence(proof, branch) {
  assert.equal(String(proof.run.databaseId), ENCODER_PLANE_RUN);
  assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.run.headSha, branch.commit); assert.equal(branch.commit, "7b6dd8223d4a71b7f067017c6c8b5a7fa960e0c1");
  assert.equal(proof.artifact.workflow_run.head_sha, branch.commit);
  assert.equal(proof.manifest.artifacts["within-mpeg2-split.wasm"], SINGLE_IDLE_DECODER_SHA);
  assert.equal(proof.manifest.artifacts["split-encoder.wasm"], proof.encoderManifest.artifacts["split-encoder.wasm"]);
  assert.notEqual(proof.manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.equal(proof.manifest.provenance.encoder.commit, branch.commit);
  assert.equal(proof.manifest.provenance.encoder.workflowSha256, branch.workflow.generatedSha256);
  assert.equal(proof.manifest.provenance.decoder.run, 37986418102);
  assert.equal(proof.manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(proof.manifest.allowMemoryGrowth, false);
  assert.deepEqual(proof.manifest.memories.encoder, [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }]);
  assert.deepEqual(proof.manifest.memories.decoderMux, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.deepEqual(proof.smoke, proof.encoderManifest.smoke);
  assert.equal(proof.smoke.status, "passed"); assert.equal(proof.smoke.selectorConfigurations, 80);
  assert.equal(proof.smoke.sequentialReuses, 200000); assert.equal(proof.smoke.sequentialFreshAllocations, 1);
  assert.equal(proof.smoke.maximumIdleEntriesPerSelectedPool, 1); assert.equal(proof.smoke.conversionsPerformed, 0);
  for (const key of ["liveReferencesUnchanged", "uninitWithLiveReferencesPassed", "allocatorCallbackFailurePassed", "zeroEveryAcquisitionPassed", "nonselectedCacheUnchanged"])
    assert.equal(proof.smoke[key], true);
  assert.equal(proof.encoderManifest.privateFactoryDeclarationPresent, true);
  assert.equal(proof.encoderManifest.actualSourceReversalsPassed, true);
  assert.equal(proof.downloadRuntimeRemoved, true); assert.equal(proof.hostedCleanupStepPassed, true);
  assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.publicAcceptance, false);
}
export function makeEncoderPlaneBrowserRecipe(sources, root, runtime, stamp, branch, build) {
  verifyEncoderPlaneBuildEvidence(build, branch);
  const decoderBranch = JSON.parse(readFileSync(path.join(root, "evidence/mpeg2-single-idle-build-branch-2026-10-10.json")));
  const original = makeSingleIdleBrowserRecipe(sources, root, runtime, stamp, decoderBranch), result = {};
  for (const [key, value] of Object.entries(original)) {
    const replaced = value.replaceAll(SINGLE_IDLE_SLOT, ENCODER_PLANE_SLOT);
    assert.equal(replaced.replaceAll(ENCODER_PLANE_SLOT, SINGLE_IDLE_SLOT), value);
    result[key] = replaced;
  }
  // The compound manifest retains each actual component's workflow separately;
  // its source map must not pretend both were compiled from one workflow tree.
  const before = `assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], ${JSON.stringify(SINGLE_IDLE_DECODER_SHA)});`;
  const after = before + "\n" +
    `assert.equal(manifest.artifacts["split-encoder.wasm"], ${JSON.stringify(build.encoderManifest.artifacts["split-encoder.wasm"])});\n` +
    `assert.equal(manifest.provenance.encoder.commit, ${JSON.stringify(branch.commit)});\n` +
    `assert.equal(manifest.provenance.encoder.workflowSha256, ${JSON.stringify(branch.workflow.generatedSha256)});\n` +
    'assert.equal(Object.hasOwn(manifest.sources, ".github/workflows/reproduce-ffmpeg-nondocker.yml"), false);';
  assert.equal(result.stage.split(before).length, 2); result.stage = result.stage.replace(before, after);
  assert.equal(result.stage.replace(after, before).replaceAll(ENCODER_PLANE_SLOT, SINGLE_IDLE_SLOT), original.stage);
  return result;
}
export function verifyEncoderPlaneGoldenReport(report, baseline, build) {
  assert.equal(report.candidateName, ENCODER_PLANE_SLOT);
  assert.equal(report.manifest.artifacts["split-encoder.wasm"], build.encoderManifest.artifacts["split-encoder.wasm"]);
  assert.equal(report.manifest.provenance.encoder.commit, build.run.headSha);
  // Identity-only projection. Raw row objects, pixels, clocks, audio and all
  // independent assertions are unchanged; raw report remains unmodified.
  return { ...verifySingleIdleGoldenReport({ ...report, candidateName: SINGLE_IDLE_SLOT }, baseline),
    candidateIdentitySeparatelyVerified: true, rawRowsUnmodified: true, encoderChangedOnly: true };
}

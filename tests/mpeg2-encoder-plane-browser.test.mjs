import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { makeEncoderPlaneBrowserRecipe, verifyEncoderPlaneBuildEvidence, verifyEncoderPlaneGoldenReport,
  FROZEN_BROWSER_SOURCES, ENCODER_PLANE_SLOT } from "../scripts/lib/encoder-plane-browser-recipe.mjs";
import { SINGLE_IDLE_DECODER_SHA } from "../scripts/lib/single-idle-browser-recipe.mjs";
import { makeEncoderPlaneGoldenLauncher } from "../scripts/lib/encoder-plane-golden-launcher-source.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const branch = JSON.parse(await read("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"));
const sources = {}; for (const file of Object.keys(FROZEN_BROWSER_SOURCES)) sources[file] = (await read(file)).toString();
// Deliberately synthetic unit fixture, not retained evidence of an actual build.
function unitProof() {
  const encoderHash = "f".repeat(64), smoke = { status: "passed", selectorConfigurations: 80, sequentialReuses: 200000,
    sequentialFreshAllocations: 1, maximumIdleEntriesPerSelectedPool: 1, conversionsPerformed: 0,
    liveReferencesUnchanged: true, uninitWithLiveReferencesPassed: true, allocatorCallbackFailurePassed: true,
    zeroEveryAcquisitionPassed: true, nonselectedCacheUnchanged: true };
  return { run: { databaseId: 38044000567, status: "completed", conclusion: "success", headSha: branch.commit },
    artifact: { workflow_run: { head_sha: branch.commit } }, manifest: { artifacts: { "within-mpeg2-split.wasm": SINGLE_IDLE_DECODER_SHA,
      "split-encoder.wasm": encoderHash }, provenance: { encoder: { commit: branch.commit, workflowSha256: branch.workflow.generatedSha256 },
      decoder: { run: 37986418102 } }, aggregateWasmMemoryBytes: 50331648, allowMemoryGrowth: false,
      memories: { encoder: [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }],
        decoderMux: [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }] } },
    encoderManifest: { artifacts: { "split-encoder.wasm": encoderHash }, smoke, privateFactoryDeclarationPresent: true,
      actualSourceReversalsPassed: true }, smoke, downloadRuntimeRemoved: true, hostedCleanupStepPassed: true,
    browserConversionsPerformed: 0, publicAcceptance: false };
}
test("Synthetic guard negatives reject live/failed/wrong-commit/unbounded/unchanged-encoder data; not an actual build acceptance claim", () => {
  verifyEncoderPlaneBuildEvidence(unitProof(), branch);
  for (const change of [p => p.run.status = "in_progress", p => p.run.conclusion = "failure", p => p.run.headSha = "0".repeat(40),
    p => p.manifest.allowMemoryGrowth = true, p => p.smoke.maximumIdleEntriesPerSelectedPool = 2,
    p => p.manifest.artifacts["split-encoder.wasm"] = "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242"]) {
    const bad = unitProof(); change(bad); assert.throws(() => verifyEncoderPlaneBuildEvidence(bad, branch));
  }
});
test("Same five-case generated browser spec/independent validators and birth-bound cleanup; only separately verified candidate identity changes", () => {
  const proof = unitProof(), generated = makeEncoderPlaneBrowserRecipe(sources, root, path.join(root, "work/prepare-only"), "2026-10-10T00-00-00-000Z", branch, proof);
  assert.ok(generated.stage.includes('/^mpeg2-encoder-planes-38044000567$/'));
  assert.ok(generated.stage.includes(proof.encoderManifest.artifacts["split-encoder.wasm"]));
  assert.ok(generated.stage.includes(branch.commit) && generated.stage.includes("manifest.provenance.encoder.workflowSha256"));
  assert.ok(generated.spec.includes("headless: true") && !generated.spec.includes("headless: false"));
  assert.equal((generated.driver.match(/windowsHide: true/g) ?? []).length, 6);
  for (const token of ['toBeGreaterThanOrEqual(0.98)', 'validateSmallMatroskaMp4Timeline', 'sourceDecodedAudioHashes',
    'audioHashes(source)', 'Preserve compatible container metadata', 'peakPendingOperations', 'cancel-after-direct-output']) assert.ok(generated.spec.includes(token), token);
  assert.ok(generated.driver.includes("Never stop an unrelated or reused PID") && generated.driver.includes("observeOwnedProcessExit"));
  for (const key of ["stage", "driver", "config"]) {
    const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated[key], encoding: "utf8", windowsHide: true });
    assert.equal(checked.status, 0, checked.stderr);
  }
  const compiled = ts.transpileModule(generated.spec, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true });
  assert.deepEqual(compiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), []);
});
test("Actual launcher reconstructs historical complete gates after reversing identity/import edits, with original SHA/disk/RAM/cleanup guards", async () => {
  const prior = (await read("scripts/validate-mpeg2-single-idle-goldens.mjs")).toString();
  const generated = makeEncoderPlaneGoldenLauncher(prior);
  assert.equal(generated, (await read("scripts/validate-mpeg2-encoder-plane-goldens.mjs")).toString());
  assert.throws(() => makeEncoderPlaneGoldenLauncher(prior + "\n"));
  for (const token of ["2147483648", "Keep2GiB host guard", "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34",
    "Preserve failure; no automatic retry", "await runtime.close()", "postSourcePins", "normalAppAndCssUnchanged"]) assert.ok(generated.includes(token), token);
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr);
});
test("Identity-only projection leaves raw golden rows unchanged; changed output/audio/fidelity/cleanup or compiled identity is rejected", async () => {
  const prior = JSON.parse(await read("evidence/mpeg2-late-abort-goldens-2026-10-08.json")), baseline = prior.reports[0].report;
  const proof = unitProof(), report = structuredClone(baseline);
  report.candidateName = ENCODER_PLANE_SLOT; report.manifest = proof.manifest;
  const before = JSON.stringify(report), result = verifyEncoderPlaneGoldenReport(report, baseline, proof);
  assert.equal(JSON.stringify(report), before); assert.equal(result.genuineConversions, 3); assert.equal(result.completeChromiumMemoryAcceptance, false);
  for (const field of ["outputSha256", "ssim", "outputBytes", "sourceFrameTimes"]) {
    const bad = structuredClone(report); bad.rows.find(row => !row.kind && row.status === "passed")[field] = "changed";
    assert.throws(() => verifyEncoderPlaneGoldenReport(bad, baseline, proof));
  }
  const bad = structuredClone(report); bad.rows.find(row => row.kind === "independent-decoded-audio").outputDecodedAudioHashes = ["changed"];
  assert.throws(() => verifyEncoderPlaneGoldenReport(bad, baseline, proof));
});

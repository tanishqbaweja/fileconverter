import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { makeSingleIdleBrowserRecipe, verifySingleIdleBuildEvidence, verifySingleIdleGoldenReport,
  FROZEN_BROWSER_SOURCES, SINGLE_IDLE_DECODER_SHA, SINGLE_IDLE_SLOT } from "../scripts/lib/single-idle-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const build = JSON.parse(await read("evidence/mpeg2-single-idle-build-37986418102.json"));
const branch = JSON.parse(await read("evidence/mpeg2-single-idle-build-branch-2026-10-10.json"));
const sources = {}; for (const file of Object.keys(FROZEN_BROWSER_SOURCES)) sources[file] = (await read(file)).toString();
const recipe = () => makeSingleIdleBrowserRecipe(sources, root, path.join(root, "work/prepare-only"), "2026-10-10T00-00-00-000Z", branch);
test("Actual changed hosted build binds run/commit/decoder/fixed heaps and compiled lifetime success; no browser acceptance", () => {
  verifySingleIdleBuildEvidence(build, branch);
  for (const field of ["publicAcceptance", "speedImprovementProven", "actualLatePoolOomResolved"]) assert.equal(build[field], false);
  const bad = structuredClone(build); bad.run.headSha = "0".repeat(40); assert.throws(() => verifySingleIdleBuildEvidence(bad, branch));
  const wrongUnit = structuredClone(build); wrongUnit.smoke.sequentialFreshAllocations = 2;
  assert.throws(() => verifySingleIdleBuildEvidence(wrongUnit, branch));
  assert.equal(build.reusableToolBytes, 9631422);
  for (const [file, digest] of Object.entries(build.manifest.artifacts)) assert.equal(build.files.find(row => row.file === file)?.sha256, digest);
});
test("Frozen stager derivative accepts only new exact slot; only workflow digest has isolated/canonical binding", () => {
  const generated = recipe(); assert.ok(generated.stage.includes(SINGLE_IDLE_DECODER_SHA));
  assert.ok(generated.stage.includes(branch.workflow.generatedSha256)); assert.ok(generated.stage.includes(branch.workflow.canonicalSha256));
  assert.ok(generated.stage.includes('/^mpeg2-single-idle-37986418102$/'));
  assert.ok(generated.stage.includes('else assert.equal(await hash(path.join(root, file)), digest, file)'));
  assert.throws(() => makeSingleIdleBrowserRecipe({ ...sources, "scripts/stage-mpeg2-split-direct.mjs": sources["scripts/stage-mpeg2-split-direct.mjs"] + "\n" },
    root, path.join(root, "work/prepare-only"), "2026-10-10T00-00-00-000Z", branch));
});
test("Same five-case browser spec and validator assertions; explicitly headless/hidden, birth-bound cleanup", () => {
  const generated = recipe();
  assert.ok(generated.spec.includes('headless: true') && !generated.spec.includes('headless: false'));
  assert.equal((generated.driver.match(/windowsHide: true/g) ?? []).length, 6);
  for (const token of ['toBeGreaterThanOrEqual(0.98)', 'validateSmallMatroskaMp4Timeline', 'sourceDecodedAudioHashes',
    'audioHashes(source)', 'Preserve compatible container metadata', 'peakPendingOperations', 'cancel-after-direct-output']) assert.ok(generated.spec.includes(token), token);
  assert.ok(generated.driver.includes('Never stop an unrelated or reused PID') && generated.driver.includes('observeOwnedProcessExit'));
  for (const key of ["stage", "driver", "config"]) {
    const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated[key], encoding: "utf8", windowsHide: true });
    assert.equal(checked.status, 0, checked.stderr);
  }
  const compiled = ts.transpileModule(generated.spec, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true });
  assert.deepEqual(compiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), []);
});
test("Independent byte-exact golden join rejects changed pixels/output/audio/cleanup; never certifies small-file memory", async () => {
  const prior = JSON.parse(await read("evidence/mpeg2-late-abort-goldens-2026-10-08.json")), baseline = prior.reports[0].report;
  const candidate = structuredClone(baseline); candidate.candidateName = SINGLE_IDLE_SLOT; candidate.manifest.artifacts["within-mpeg2-split.wasm"] = SINGLE_IDLE_DECODER_SHA;
  const result = verifySingleIdleGoldenReport(candidate, baseline); assert.equal(result.genuineConversions, 3); assert.equal(result.completeChromiumMemoryAcceptance, false);
  for (const field of ["outputSha256", "ssim", "outputBytes"]) {
    const bad = structuredClone(candidate), row = bad.rows.find(row => !row.kind && row.status === "passed"); row[field] = "changed";
    assert.throws(() => verifySingleIdleGoldenReport(bad, baseline));
  }
  const audioBad = structuredClone(candidate); audioBad.rows.find(row => row.kind === "independent-decoded-audio").outputDecodedAudioHashes = ["changed"];
  assert.throws(() => verifySingleIdleGoldenReport(audioBad, baseline));
  const cleanupBad = structuredClone(candidate); cleanupBad.rows.find(row => row.kind === "cancel-after-direct-output").partialBytes = [1];
  assert.throws(() => verifySingleIdleGoldenReport(cleanupBad, baseline));
});

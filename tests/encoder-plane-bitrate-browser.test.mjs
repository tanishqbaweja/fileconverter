import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { FROZEN_BROWSER_SOURCES } from "../scripts/lib/encoder-plane-browser-recipe.mjs";
import { makeEncoderPlaneQualityBrowserRecipe } from "../scripts/lib/encoder-plane-quality-browser-recipe.mjs";
import { auditNativeBitrateConfiguration, makeEncoderPlaneBitrateBrowserRecipe, compareBitrateDiagnostics } from "../scripts/lib/encoder-plane-bitrate-browser-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sources = {};
for (const file of Object.keys(FROZEN_BROWSER_SOURCES)) sources[file] = await readFile(path.join(root, file), "utf8");
const branch = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json")));
const build = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-encoder-plane-build-38044000567.json")));

test("both bitrate recipes reverse exactly and retain all original correctness/queue/fidelity assertions", () => {
  const args = [sources, root, path.join(root, "work/UNIT-ONLY"), "2026-10-11T00-00-00-000Z", branch, build];
  const original = makeEncoderPlaneQualityBrowserRecipe(...args);
  for (const bitRate of [2000000, 4000000]) {
    const recipe = makeEncoderPlaneBitrateBrowserRecipe(...args, bitRate);
    let stage = recipe.stage, spec = recipe.spec;
    for (const [before, after] of recipe.stageEdits.toReversed()) stage = stage.replace(after, before);
    for (const [before, after] of recipe.bitrateSpecEdits.toReversed()) spec = spec.replace(after, before);
    assert.equal(stage, original.stage); assert.equal(spec, original.spec);
    assert.equal(recipe.driver, original.driver); assert.equal(recipe.config, original.config);
    assert.ok(recipe.spec.includes("expect(ordinalSsim).toBeGreaterThanOrEqual(0.98);"));
    assert.ok(recipe.stage.includes(`mapped[9] = ${bitRate};`));
    const result = ts.transpileModule(recipe.spec, { reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    assert.deepEqual(result.diagnostics, []);
    // Parsing only; this does not execute or stage any assets.
    assert.doesNotThrow(() => new Function(recipe.stage.slice(recipe.stage.indexOf("const adapter = "), recipe.stage.indexOf("const replacing = "))));
  }
});

test("actual Playwright discovery selects one real HEVC direct case per bitrate, no browser launch", async () => {
  const runtime = await createOwnedRuntimeScratch("bitrate-discovery-unit-");
  try {
    for (const bitRate of [2000000, 4000000]) {
      const recipe = makeEncoderPlaneBitrateBrowserRecipe(sources, root, runtime.directory, "2026-10-11T00-00-00-000Z", branch, build, bitRate);
      await writeFile(path.join(runtime.directory, "candidate.spec.ts"), recipe.spec);
      const config = path.join(runtime.directory, "playwright.config.mjs"); await writeFile(config, recipe.config);
      const listed = spawnSync(process.execPath, [createRequire(import.meta.url).resolve("@playwright/test/cli"), "test", "--config", config, "--list"],
        { cwd: root, env: runtime.env, windowsHide: true, encoding: "utf8", timeout: 30000, maxBuffer: 1048576 });
      assert.equal(listed.status, 0, listed.stderr); assert.match(listed.stdout, /Total: 1 test in 1 file/);
      assert.match(listed.stdout, /private split MPEG2 hevc to mp4 via direct:/);
    }
  } finally { await runtime.close(); }
});

test("native initialization audit requires actual settings match, fixed geometry, default quantizers and exact bitrate", () => {
  const HEAPU8 = new Uint8Array(16777216), pointer = 128, view = new DataView(HEAPU8.buffer, pointer, 96);
  const initial = [1, 1920, 804, 0, 1, 24, 24, 1, 4000000, 4, 20];
  initial.forEach((value, i) => view.setUint32(i * 4, value, true));
  const encoder = { HEAPU8, _within_split_encoder_config: () => pointer, _within_split_encoder_settings_match: () => 1 };
  assert.equal(auditNativeBitrateConfiguration(encoder, 4000000).words[8], 4000000);
  assert.throws(() => auditNativeBitrateConfiguration(encoder, 2000000));
  assert.throws(() => auditNativeBitrateConfiguration({ ...encoder, _within_split_encoder_settings_match: () => 0 }, 4000000));
  for (const [index, value] of [[1, 640], [9, 2], [10, 12], [6, 30]]) {
    view.setUint32(index * 4, value, true); assert.throws(() => auditNativeBitrateConfiguration(encoder, 4000000));
    view.setUint32(index * 4, initial[index], true);
  }
});

test("comparison refuses unequal input bytes or any native-setting change other than bitrate", () => {
  const words = Array(24).fill(0); words[8] = 2000000;
  const control = { bitRate: 2000000, input: { bytes: 4457906, sha256: "a".repeat(64) }, nativeConfiguration: { words },
    qualityThreshold: 0.98, publicAcceptance: false, completeChromiumMemoryAcceptance: false, elapsedMs: 2000,
    ordinalSsim: 0.972072, caseStatus: "failed", outputBytes: 1265310 };
  const candidate = structuredClone(control); candidate.bitRate = 4000000; candidate.nativeConfiguration.words[8] = 4000000;
  candidate.elapsedMs = 2200; candidate.ordinalSsim = 0.981; candidate.caseStatus = "passed";
  const compared = compareBitrateDiagnostics(control, candidate);
  assert.equal(compared.retainedForFullQualification, true); assert.equal(compared.speedImprovementProven, false);
  for (const change of [c => { c.input.sha256 = "b".repeat(64); }, c => { c.nativeConfiguration.words[9] = 2; },
    c => { c.qualityThreshold = 0.97; }, c => { c.publicAcceptance = true; }]) {
    const wrong = structuredClone(candidate); change(wrong); assert.throws(() => compareBitrateDiagnostics(control, wrong));
  }
});

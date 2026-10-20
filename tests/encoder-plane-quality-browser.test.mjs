import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { makeEncoderPlaneTitleBrowserRecipe } from "../scripts/lib/encoder-plane-title-browser-recipe.mjs";
import { FROZEN_BROWSER_SOURCES } from "../scripts/lib/encoder-plane-browser-recipe.mjs";
import { makeEncoderPlaneQualityBrowserRecipe } from "../scripts/lib/encoder-plane-quality-browser-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sources = {};
for (const file of Object.keys(FROZEN_BROWSER_SOURCES)) sources[file] = await readFile(path.join(root, file), "utf8");
const branch = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json")));
const build = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-encoder-plane-build-38044000567.json")));
test("quality diagnostic keeps production stage/driver/0.98 gate and captures numeric result before assertion", () => {
  const args = [sources, root, path.join(root, "work/UNIT-ONLY"), "2026-10-11T00-00-00-000Z", branch, build];
  const old = makeEncoderPlaneTitleBrowserRecipe(...args), next = makeEncoderPlaneQualityBrowserRecipe(...args);
  assert.equal(next.stage, old.stage); assert.equal(next.driver, old.driver);
  let reversed = next.spec;
  for (const [before, after] of next.qualityEdits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, old.spec);
  assert.ok(next.spec.includes('expect(ordinalSsim).toBeGreaterThanOrEqual(0.98);'));
  assert.ok(next.spec.includes('rows.push({ kind: "bounded-ssim-summary-before-assertion", ordinal, diagnostic });'));
  assert.ok(next.spec.includes('noise=alls=4:allf=t+u:all_seed=20261011'));
  assert.equal(next.config.replace(',grep:/private split MPEG2 hevc to mp4 via direct:/', ''), old.config);
  const filter = /private split MPEG2 hevc to mp4 via direct:/;
  assert.equal(filter.test("Chrome candidate.spec.ts private split MPEG2 hevc to mp4 via direct: genuine encode"), true);
  assert.equal(filter.test("Chrome candidate.spec.ts private split MPEG2 hevc to mp4 via opfs: genuine encode"), false);
  const result = ts.transpileModule(next.spec, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(next.fullOriginalAcceptance, false); assert.equal(next.completeChromiumMemoryAcceptance, false);
});

test("actual Playwright discovery selects exactly the direct HEVC diagnostic without launching a browser", async () => {
  const runtime = await createOwnedRuntimeScratch("quality-discovery-unit-");
  try {
    const recipe = makeEncoderPlaneQualityBrowserRecipe(sources, root, runtime.directory, "2026-10-11T00-00-00-000Z", branch, build);
    await writeFile(path.join(runtime.directory, "candidate.spec.ts"), recipe.spec, { flag: "wx" });
    const config = path.join(runtime.directory, "playwright.config.mjs");
    await writeFile(config, recipe.config, { flag: "wx" });
    const listed = spawnSync(process.execPath, [createRequire(import.meta.url).resolve("@playwright/test/cli"),
      "test", "--config", config, "--list"], { cwd: root, env: runtime.env, windowsHide: true,
      encoding: "utf8", timeout: 30000, maxBuffer: 1048576 });
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /Total: 1 test in 1 file/);
    assert.match(listed.stdout, /private split MPEG2 hevc to mp4 via direct:/);
  } finally { await runtime.close(); }
});

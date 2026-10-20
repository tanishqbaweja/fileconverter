import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { FROZEN_BROWSER_SOURCES } from "../scripts/lib/encoder-plane-browser-recipe.mjs";
import { makeEncoderPlaneBitrateBrowserRecipe } from "../scripts/lib/encoder-plane-bitrate-browser-recipe.mjs";
import { makeEncoderPlaneRecoveryBrowserRecipe } from "../scripts/lib/encoder-plane-recovery-browser-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sources = {};
for (const file of Object.keys(FROZEN_BROWSER_SOURCES)) sources[file] = await readFile(path.join(root, file), "utf8");
const branch = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json")));
const build = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-encoder-plane-build-38044000567.json")));
test("same-page recovery retains exact bitrate adapter and complete independent correctness assertions", () => {
  const args = [sources, root, path.join(root, "work/UNIT-ONLY"), "2026-10-11T00-00-00-000Z", branch, build];
  const old = makeEncoderPlaneBitrateBrowserRecipe(...args, 4000000), recipe = makeEncoderPlaneRecoveryBrowserRecipe(...args);
  assert.equal(recipe.stage, old.stage); assert.equal(recipe.driver, old.driver);
  let reversed = recipe.spec; for (const [before, after] of recipe.recoveryEdits.toReversed()) reversed = reversed.replaceAll(after, before);
  assert.equal(reversed, old.spec);
  assert.ok(recipe.spec.includes("expect(ordinalSsim).toBeGreaterThanOrEqual(0.98);"));
  assert.ok(recipe.spec.includes('expect(page.workers()).not.toContain(originalWorker)'));
  assert.ok(recipe.spec.includes('productionReplacementWorkerUsed: true'));
  assert.ok(recipe.spec.includes('fixtures.push({ ...fixtures[1], name: "cancel", seconds: 12 })'));
  const compiled = ts.transpileModule(recipe.spec, { reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  assert.deepEqual(compiled.diagnostics, []);
});
test("actual browser-free discovery selects only two adverse/recovery cases", async () => {
  const runtime = await createOwnedRuntimeScratch("recovery-discovery-unit-");
  try {
    const recipe = makeEncoderPlaneRecoveryBrowserRecipe(sources, root, runtime.directory, "2026-10-11T00-00-00-000Z", branch, build);
    await writeFile(path.join(runtime.directory, "candidate.spec.ts"), recipe.spec, { flag: "wx" });
    const config = path.join(runtime.directory, "playwright.config.mjs"); await writeFile(config, recipe.config, { flag: "wx" });
    const listed = spawnSync(process.execPath, [createRequire(import.meta.url).resolve("@playwright/test/cli"), "test", "--config", config, "--list"],
      { cwd: root, env: runtime.env, windowsHide: true, encoding: "utf8", timeout: 30000, maxBuffer: 1048576 });
    assert.equal(listed.status, 0, listed.stderr); assert.match(listed.stdout, /Total: 2 tests in 1 file/);
    assert.match(listed.stdout, /propagates direct output write failure/); assert.match(listed.stdout, /cancels after genuine direct output/);
  } finally { await runtime.close(); }
});

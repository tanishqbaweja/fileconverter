import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeHeadlessStableUiLauncher } from "../scripts/lib/headless-stable-ui-golden-recipe.mjs";
import { makeHeroWidthGoldenSpec, makeHeroWidthGoldenDriver } from "../scripts/lib/mpeg2-hero-width-golden-recipe.mjs";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
test("Headless next-run launcher preserves executed source exactly and refuses unreviewed modifications", async () => {
  const previous = await read("scripts/validate-stable-progress-ui-goldens.mjs");
  const generated = makeHeadlessStableUiLauncher(previous, root);
  assert.ok(generated.includes('spec = spec.replace("headless: false", "headless: true")'));
  for (const anchor of ['launchHost.safeToStart, true', 'restoredProductionBuild = true', 'protectedPost = await verifyOriginal()',
    'await runtime.close()', 'assert.deepEqual(postSourcePins, sourcePins', 'browserMode: "headless"', 'subprocessWindowsHidden: true']) assert.ok(generated.includes(anchor), anchor);
  assert.throws(() => makeHeadlessStableUiLauncher(previous + "\n", root));
});
test("Actual generated suite requests no visible browser and retains all five tests and hidden native/driver subprocesses", async () => {
  const source = await read("tests/browser/mpeg2-split-direct-candidate.spec.ts");
  const prior = makeHeroWidthGoldenSpec(source, root, "2026-10-08T13-00-00-000Z-matrix-goldens", createHash("sha256").update(source).digest("hex"));
  assert.equal(prior.split("headless: false").length, 2);
  const headless = prior.replace("headless: false", "headless: true");
  assert.equal(headless.replace("headless: true", "headless: false"), prior);
  assert.ok(!headless.includes("headless: false"));
  assert.ok(headless.includes('viewport: { width: 1280, height: 900 }'));
  assert.ok(headless.includes('windowsHide: true, maxBuffer: 4 * 1024 * 1024'));
  const driver = makeHeroWidthGoldenDriver(await read("scripts/validate-mpeg2-split-direct.mjs"), root, path.join(root, "work", "unused-config.mjs"));
  assert.equal((driver.match(/windowsHide: true/g) ?? []).length, 6);
  assert.ok(headless.includes('for (const adapter of adapters)'));
  for (const name of ['"private split MPEG2 propagates direct output write failure and removes partial output"', '"private split MPEG2 cancels after genuine direct output and removes partial output"'])
    assert.ok(headless.includes(name), name);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeUiLargestBlinkControl, makeOffscreenRenderedMatrixDriver } from "../scripts/lib/ui-offscreen-navigation-recipe.mjs";
test("responsive navigation derivative discloses hidden link, uses native fragment and records actual rendered-memory state", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8");
  const control = makeUiLargestBlinkControl(source, root, "file:///approved/attribution.mjs");
  assert.ok(control.includes('cssCandidate.navbarLinkVisible = await formatLink.isVisible()'));
  assert.ok(control.includes('location.hash = "formats"')); assert.equal(control.includes('force: true'), false);
  assert.ok(control.includes('await snapshot("offscreen-matrix-actually-rendered")'));
  assert.ok(control.includes('assert.equal(rendered.length, 405)')); assert.ok(control.includes('for (let i = 0; i < 60; i++)'));
  const driver = await readFile(path.join(root, "scripts/diagnose-ui-largest-blink.mjs"), "utf8");
  assert.ok(makeOffscreenRenderedMatrixDriver(driver, root).includes('ui-offscreen-rendered-matrix-experiment-2026-10-07.json'));
  assert.throws(() => makeOffscreenRenderedMatrixDriver(driver + "\n", root));
});

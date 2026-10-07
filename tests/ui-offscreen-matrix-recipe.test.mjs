import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeUiLargestBlinkControl, makeOffscreenMatrixDriver, OFFSCREEN_MATRIX_CSS } from "../scripts/lib/ui-offscreen-matrix-recipe.mjs";
test("offscreen candidate intercepts only small static CSS, preserves405card markup and verifies genuine navigation after measurement", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8");
  const generated = makeUiLargestBlinkControl(source, root, "file:///approved/attribution.mjs");
  for (const token of ['context.route(origin + "/assets/*.css"', 'Buffer.byteLength(css) <= 1048576',
    'for (let i = 0; i < 60; i++)', 'cssCandidate.matrixCards, 405', 'publishedCssModified: false',
    'cssCandidate.allCardsAvailable = true', 'name: "Verified formats"', 'await verifySource()', 'jobState, "idle"'])
    assert.ok(generated.includes(token), token);
  assert.ok(generated.indexOf('await snapshot("ui-control-settled-3s")') < generated.indexOf('name: "Verified formats"'));
  assert.equal(OFFSCREEN_MATRIX_CSS.includes('hidden'), false);
  assert.equal(generated.includes('Memory.startSampling'), false);
  const driver = await readFile(path.join(root, "scripts/diagnose-ui-largest-blink.mjs"), "utf8");
  assert.ok(makeOffscreenMatrixDriver(driver, root).includes('evidence/ui-offscreen-matrix-experiment-2026-10-07.json'));
  assert.throws(() => makeOffscreenMatrixDriver(driver + "\n", root));
});

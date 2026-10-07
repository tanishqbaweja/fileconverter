import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeUiCompleteBlinkControl } from "../scripts/lib/ui-complete-blink-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("complete heap derivative preserves real inspected source/60 UI selections, deadlines and finally ownership", async () => {
  const source = await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8");
  const control = makeUiCompleteBlinkControl(source, root, "file:///approved/attribution.mjs");
  for (const token of ['for (let i = 0; i < 60; i++)', 'await verifySource();', 'await delay(250);',
    'await page.locator(\'[data-testid="format-select"]\').selectOption', 'jobState, "idle"',
    'await runtime.close()', 'await attribution.dump(phase, tree.processes)', 'await attribution.stop()', 'realms?.close()'])
    assert.ok(control.includes(token), token);
  assert.equal(control.includes('cdp.send("Memory.startSampling"'), false);
  assert.equal(control.includes('cdp.send("Memory.getSamplingProfile"'), false);
  assert.equal(control.includes('cdp.send("Memory.stopSampling"'), false);
  assert.ok(control.includes('conversionsPerformed: 0'));
  assert.ok(control.includes('completedReport = report'));
});
test("modified baseline or non-file helper is refused rather than silently changing executed workflow", async () => {
  const source = await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8");
  assert.throws(() => makeUiCompleteBlinkControl(source + "\n", root, "file:///approved/attribution.mjs"));
  assert.throws(() => makeUiCompleteBlinkControl(source, root, "https://example.invalid/attribution.mjs"));
});

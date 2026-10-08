import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DYNAMIC_FLEX_CSS } from "../scripts/lib/ui-flex-layout-recipe.mjs";
import { MATRIX_FLEX_CSS, makeUiMatrixFlexLayoutControl } from "../scripts/lib/ui-matrix-flex-layout-recipe.mjs";

test("matrix pair keeps all cards, source inspection, trace caps and protected cleanup", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8");
  for (const candidate of [false, true]) {
    const generated = makeUiMatrixFlexLayoutControl(source, root, "file:///helper.mjs", candidate);
    assert.ok(generated.includes(JSON.stringify(DYNAMIC_FLEX_CSS + (candidate ? MATRIX_FLEX_CSS : ""))));
    for (const constraint of ['layoutExperiment.matrixCards, 405', 'traceReports.length < 2', 'for (let i = 0; i < 60; i++)',
      'assert.equal(state.jobState, "idle"', 'await verifySource(); cleanup.protectedFixtureUnchanged = true;', 'value.rows.length < 256'])
      assert.ok(generated.includes(constraint), constraint);
    assert.ok(generated.includes('.matrix article:last-child'));
    const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
  assert.ok(!/content-visibility|contain:|visibility:|display:none|order:/.test(MATRIX_FLEX_CSS));
  assert.throws(() => makeUiMatrixFlexLayoutControl(source + "\n", root, "file:///helper.mjs", true));
});

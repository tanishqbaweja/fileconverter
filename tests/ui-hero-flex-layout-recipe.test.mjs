import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeUiHeroFlexLayoutControl, HERO_FLEX_CSS } from "../scripts/lib/ui-hero-flex-layout-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("ancestor hero pair keeps matrix fully rendered, fixed trace/geometry caps and protected finally checks", async () => {
  const source = await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8");
  for (const candidate of [false, true]) {
    const generated = makeUiHeroFlexLayoutControl(source, root, "file:///owned/helper.mjs", candidate);
    for (const token of ['layoutExperiment.matrixCards, 405', 'traceReports.length < 2', 'value.rows.length < 256',
      'for (let i = 0; i < 60; i++)', 'await verifySource(); cleanup.protectedFixtureUnchanged = true;', '".hero", ".hero-copy", ".converter-card"']) assert.ok(generated.includes(token), token);
    assert.equal(generated.includes('.hero-copy{flex:.86'), candidate);
    const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
  assert.doesNotMatch(HERO_FLEX_CSS, /content-visibility|visibility:|display:none|order:/);
  assert.throws(() => makeUiHeroFlexLayoutControl(source + "\n", root, "file:///owned/helper.mjs", true));
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { assertHeroWidthSourceCss, HERO_WIDTH_FLEX_CSS, makeUiHeroWidthFlexLayoutControl } from "../scripts/lib/ui-hero-width-flex-layout-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");

test("corrected border-box hero basis keeps actual source, all405cards and bounded diagnostic assertions", async () => {
  const source = await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8");
  for (const candidate of [false, true]) {
    const generated = makeUiHeroWidthFlexLayoutControl(source, root, "file:///owned/helper.mjs", candidate);
    for (const token of ['layoutExperiment.matrixCards, 405', 'traceReports.length < 2', 'value.rows.length < 256',
      'for (let i = 0; i < 60; i++)', 'await verifySource(); cleanup.protectedFixtureUnchanged = true;', '".hero", ".hero-copy", ".converter-card"']) assert.ok(generated.includes(token), token);
    assert.equal(generated.includes('.hero-copy{flex:0 1 auto'), candidate);
    assert.equal(generated.includes('.hero-copy{flex:.86 1 0'), false);
    assert.ok(generated.includes(candidate ? 'mode: "hero-width-flex"' : 'mode: "hero-width-grid"'));
    const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
  assert.doesNotMatch(HERO_WIDTH_FLEX_CSS, /content-visibility|visibility:|display:none|order:/);
  assert.throws(() => makeUiHeroWidthFlexLayoutControl(source + "\n", root, "file:///owned/helper.mjs", true));
});

test("weighted widths represent canonical .86:1 tracks, including the card minimum; not browser acceptance", async () => {
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  assertHeroWidthSourceCss(css);
  for (const changed of [css.replace('box-sizing: border-box', 'box-sizing: content-box'),
    css.replace('0.86fr', '.9fr'), css.replace('gap: clamp(3rem, 8vw, 8rem)', 'gap: 4rem')]) assert.throws(() => assertHeroWidthSourceCss(changed));
  const [, left, right] = HERO_WIDTH_FLEX_CSS.match(/\*([.\d]+)\)[\s\S]*?\*([.\d]+)\)/);
  assert.ok(Math.abs(Number(left) - .86 / 1.86) < 1e-15);
  assert.ok(Math.abs(Number(right) - 1 / 1.86) < 1e-15);
  for (const available of [600, 800, 1047.421875, 1144, 1250]) {
    const card = Math.max(480, available * Number(right));
    const copy = available - card;
    assert.ok(Math.abs(copy - (card === 480 ? available - 480 : available * .86 / 1.86)) < 1e-10);
    assert.ok(Math.abs(copy + card - available) < 1e-10);
  }
});

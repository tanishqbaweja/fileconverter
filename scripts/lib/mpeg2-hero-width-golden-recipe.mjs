// Add only the geometry-verified private hero CSS to the executed genuine suite.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { makeMatrixGoldenDriver, makeMatrixGoldenSpec } from "./mpeg2-matrix-golden-recipe.mjs";
import { DYNAMIC_FLEX_CSS } from "./ui-flex-layout-recipe.mjs";
import { MATRIX_FLEX_CSS } from "./ui-matrix-flex-layout-recipe.mjs";
import { assertHeroWidthSourceCss, HERO_WIDTH_FLEX_CSS } from "./ui-hero-width-flex-layout-recipe.mjs";

export function makeHeroWidthGoldenSpec(source, root, screenshotPrefix, expectedSourceHash) {
  assertHeroWidthSourceCss(readFileSync(path.join(root, "app/globals.css"), "utf8"));
  const prior = makeMatrixGoldenSpec(source, root, screenshotPrefix, expectedSourceHash);
  const css = DYNAMIC_FLEX_CSS + MATRIX_FLEX_CSS;
  const patches = [
    [`const matrixCss = ${JSON.stringify(css)};`, `const matrixCss = ${JSON.stringify(css + HERO_WIDTH_FLEX_CSS)};`],
    ['".conversion-plan", ".matrix"]', '".conversion-plan", ".matrix", ".hero", ".hero-copy", ".converter-card"]'],
  ];
  let result = prior;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result;
  for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior, "Only geometry-verified hero CSS and three ancestor observations; all golden/quality/I-O/cancellation/write-failure/finally thresholds retained");
  return result;
}

export const makeHeroWidthGoldenDriver = makeMatrixGoldenDriver;

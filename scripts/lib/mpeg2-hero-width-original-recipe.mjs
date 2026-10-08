// Sole functional change: the geometry/golden/recovery-verified ancestor hero CSS.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { makeMatrixOriginalDriver } from "./mpeg2-matrix-original-recipe.mjs";
import { DYNAMIC_FLEX_CSS } from "./ui-flex-layout-recipe.mjs";
import { MATRIX_FLEX_CSS } from "./ui-matrix-flex-layout-recipe.mjs";
import { assertHeroWidthSourceCss, HERO_WIDTH_FLEX_CSS } from "./ui-hero-width-flex-layout-recipe.mjs";

export function makeHeroWidthOriginalDriver(...args) {
  assertHeroWidthSourceCss(readFileSync(path.join(args[1], "app/globals.css"), "utf8"));
  const prior = makeMatrixOriginalDriver(...args);
  const css = DYNAMIC_FLEX_CSS + MATRIX_FLEX_CSS;
  const patches = [
    [`const cssCandidate = { css: ${JSON.stringify(css)},`, `const cssCandidate = { css: ${JSON.stringify(css + HERO_WIDTH_FLEX_CSS)},`],
    ['const sourceFiles = ["scripts/mpeg2-matrix-original-memory.mjs",',
      'const sourceFiles = ["scripts/mpeg2-hero-width-original-memory.mjs","scripts/lib/mpeg2-hero-width-original-recipe.mjs",'+
      '"scripts/lib/ui-hero-width-flex-layout-recipe.mjs","scripts/lib/ui-hero-flex-layout-recipe.mjs",'+
      '"scripts/validate-mpeg2-hero-width-goldens.mjs","scripts/lib/mpeg2-hero-width-golden-recipe.mjs","scripts/freeze-mpeg2-hero-width-goldens.mjs",'+
      '"evidence/2026-10-08T11-43-06-973Z-mpeg2-hero-width-golden-validation.json",'+
      '"evidence/2026-10-08T11-39-44-157Z-ui-hero-width-flex-layout-analysis.json","scripts/mpeg2-matrix-original-memory.mjs",'],
    ['-private-mpeg2-matrix-original-native-100ms', '-private-mpeg2-hero-width-original-native-100ms'],
    ['"mpeg2-matrix-original-runtime-"', '"mpeg2-hero-width-original-runtime-"'],
    ['Full protected original with fully rendered405card matrix flex PLUS prior dynamic flex CSS/compiled3e744 pending-pool and bounded allocator-header fatal observer;',
      'Full protected original with equivalent border-box hero width flex PLUS fully rendered405card matrix/dynamic flex CSS/compiled3e744 pending-pool and bounded allocator-header fatal observer;'],
  ];
  let result = prior;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result;
  for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior, "Only verified hero CSS/provenance/names; protected FULL source/SHA/disk/defaults/codec/quality/fixed32+16MiB/lower stable blank/ALL Chromium250MiB/three repeats/validators/recovery/finally unchanged");
  assert.doesNotMatch(HERO_WIDTH_FLEX_CSS, /content-visibility|visibility:|display:none|order:/);
  return result;
}

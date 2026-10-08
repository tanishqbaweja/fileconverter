// Private fully rendered ancestor layout test; no content/engine/default changes.
import assert from "node:assert/strict";
import { makeUiMatrixFlexLayoutControl } from "./ui-matrix-flex-layout-recipe.mjs";
import { MATRIX_FLEX_CSS } from "./ui-matrix-flex-layout-recipe.mjs";
import { DYNAMIC_FLEX_CSS } from "./ui-flex-layout-recipe.mjs";

export const HERO_FLEX_CSS = `
.hero{display:flex}
.hero-copy{flex:.86 1 0;min-width:0}
.hero>.converter-card{flex:1 1 0;min-width:30rem}
@media(max-width:980px){.hero{flex-direction:column;align-items:stretch}.hero-copy{flex:none;width:100%}.hero>.converter-card{flex:none;min-width:0}}
`;

export function makeUiHeroFlexLayoutControl(source, root, helperUrl, candidate) {
  assert.equal(typeof candidate, "boolean");
  const prior = makeUiMatrixFlexLayoutControl(source, root, helperUrl, true);
  const mode = candidate ? "hero-flex" : "hero-grid";
  const baseCss = DYNAMIC_FLEX_CSS + MATRIX_FLEX_CSS;
  const patches = [
    [`mode: "matrix-flex", css: ${JSON.stringify(baseCss)}`, `mode: ${JSON.stringify(mode)}, css: ${JSON.stringify(baseCss + (candidate ? HERO_FLEX_CSS : ""))}`],
    ['".matrix article:nth-child(-n+6)>*"]', '".matrix article:nth-child(-n+6)>*", ".hero", ".hero-copy", ".converter-card"]'],
    ['"scripts/diagnose-ui-matrix-flex-layout.mjs",', '"scripts/diagnose-ui-hero-flex-layout.mjs", "scripts/lib/ui-hero-flex-layout-recipe.mjs", "scripts/diagnose-ui-matrix-flex-layout.mjs",'],
    ['-ui-matrix-flex-layout.json', `-ui-${mode}-layout.json`],
    ['createOwnedRuntimeScratch("ui-matrix-flex-layout-")', `createOwnedRuntimeScratch("ui-${mode}-layout-")`],
    ['Paired fully rendered matrix grid/flex with identical dynamic flex controls:',
      'Paired fully rendered ancestor hero grid/flex with identical matrix and dynamic flex controls:'],
  ];
  let result = prior;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result; for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior, "Only declared ancestor CSS/geometry/provenance changes; all actual workflow/caps/source/cleanup assertions retained");
  assert.doesNotMatch(HERO_FLEX_CSS, /content-visibility|visibility:|display:none|order:/);
  return result;
}

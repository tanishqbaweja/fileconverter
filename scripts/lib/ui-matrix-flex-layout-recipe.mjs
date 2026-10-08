// Private fully rendered matrix experiment; never defer/remove public cards.
import assert from "node:assert/strict";
import { DYNAMIC_FLEX_CSS, makeUiFlexLayoutControl } from "./ui-flex-layout-recipe.mjs";

export const MATRIX_FLEX_CSS = `
.matrix{display:flex;flex-wrap:wrap}
.matrix>article{flex:0 0 calc((100% - 1.5rem)/3);min-width:0;display:flex;flex-wrap:wrap}
.matrix>article>span{flex:1 1 0;min-width:0}
.matrix>article>b{flex:0 0 auto}
.matrix>article>small{flex:0 0 100%;min-width:0}
.matrix>.matrix-empty{flex:0 0 100%}
@media(max-width:980px){.matrix>article{flex-basis:calc((100% - .75rem)/2)}}
@media(max-width:680px){.matrix>article{flex-basis:100%}}
`;

export function makeUiMatrixFlexLayoutControl(source, root, helperUrl, candidate) {
  assert.equal(typeof candidate, "boolean");
  // BOTH modes retain the previously measured dynamic-control flex candidate.
  const prior = makeUiFlexLayoutControl(source, root, helperUrl, false);
  const css = DYNAMIC_FLEX_CSS + (candidate ? MATRIX_FLEX_CSS : "");
  const mode = candidate ? "matrix-flex" : "matrix-grid";
  const patches = [
    ['mode: "grid", css: ""', `mode: ${JSON.stringify(mode)}, css: ${JSON.stringify(css)}`],
    ['".conversion-plan>ul>li>span"]', '".conversion-plan>ul>li>span", ".matrix", ".matrix article:nth-child(-n+6)", ".matrix article:last-child", ".matrix article:nth-child(-n+6)>*"]'],
    ['"scripts/diagnose-ui-flex-layout.mjs",', '"scripts/diagnose-ui-matrix-flex-layout.mjs", "scripts/lib/ui-matrix-flex-layout-recipe.mjs", "scripts/diagnose-ui-flex-layout.mjs",'],
    ['-ui-grid-layout.json', `-ui-${mode}-layout.json`],
    ['createOwnedRuntimeScratch("ui-grid-layout-")', `createOwnedRuntimeScratch("ui-${mode}-layout-")`],
    ['Paired private dynamic-control flex/grid layout:', 'Paired fully rendered matrix grid/flex with identical dynamic flex controls:'],
  ];
  let result = prior;
  for (const [before, after] of patches) {
    assert.equal(result.split(before).length, 2, before);
    result = result.replace(before, after);
  }
  let reversed = result;
  for (const [before, after] of [...patches].reverse()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior, "Only declared matrix stylesheet/geometry/provenance changes");
  assert.ok(!/content-visibility|contain:|visibility:|display:none|order:/.test(css));
  return result;
}

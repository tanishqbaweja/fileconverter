// Correct the rejected zero-basis hero candidate without altering its frozen source.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HERO_FLEX_CSS, makeUiHeroFlexLayoutControl } from "./ui-hero-flex-layout-recipe.mjs";

export const HERO_WIDTH_FLEX_CSS = `
.hero{display:flex}
.hero-copy{flex:0 1 auto;width:calc((100% - clamp(3rem,8vw,8rem))*.4623655913978495);min-width:0}
.hero>.converter-card{flex:0 0 auto;width:calc((100% - clamp(3rem,8vw,8rem))*.5376344086021505);min-width:30rem}
@media(max-width:980px){.hero{flex-direction:column;align-items:stretch}.hero-copy{flex:none;width:100%}.hero>.converter-card{flex:none;min-width:0;width:100%}}
`;

export function assertHeroWidthSourceCss(css) {
  assert.match(css, /\*\s*\{\s*box-sizing:\s*border-box;/);
  const hero = css.match(/\.hero\s*\{([^}]+)\}/)?.[1];
  assert.ok(hero, "Canonical hero declaration required");
  assert.match(hero, /display:\s*grid;/);
  assert.match(hero, /gap:\s*clamp\(3rem,\s*8vw,\s*8rem\);/);
  assert.match(hero, /grid-template-columns:\s*minmax\(0,\s*0\.86fr\)\s*minmax\(30rem,\s*1fr\);/);
  assert.match(css, /@media\s*\(max-width:\s*980px\)/);
}

export function makeUiHeroWidthFlexLayoutControl(source, root, helperUrl, candidate) {
  assertHeroWidthSourceCss(readFileSync(path.join(root, "app/globals.css"), "utf8"));
  const prior = makeUiHeroFlexLayoutControl(source, root, helperUrl, candidate);
  const mode = candidate ? "hero-flex" : "hero-grid";
  const correctedMode = candidate ? "hero-width-flex" : "hero-width-grid";
  const patches = [
    ...(candidate ? [[JSON.stringify(HERO_FLEX_CSS).slice(1, -1), JSON.stringify(HERO_WIDTH_FLEX_CSS).slice(1, -1)]] : []),
    [`mode: ${JSON.stringify(mode)}, css:`, `mode: ${JSON.stringify(correctedMode)}, css:`],
    [`-ui-${mode}-layout.json`, `-ui-${correctedMode}-layout.json`],
    [`createOwnedRuntimeScratch("ui-${mode}-layout-")`, `createOwnedRuntimeScratch("ui-${correctedMode}-layout-")`],
    ['"scripts/diagnose-ui-hero-flex-layout.mjs",', '"scripts/diagnose-ui-hero-width-flex-layout.mjs", "scripts/lib/ui-hero-width-flex-layout-recipe.mjs", "scripts/diagnose-ui-hero-flex-layout.mjs",'],
    ["Paired fully rendered ancestor hero grid/flex with identical matrix and dynamic flex controls:",
      "Paired border-box-weighted ancestor hero grid/flex with identical matrix and dynamic flex controls:"],
  ];
  let result = prior;
  for (const [before, after] of patches) {
    assert.equal(result.split(before).length, 2, before);
    result = result.replace(before, after);
  }
  let reversed = result;
  for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior, "Only hero border-box basis/width/provenance changed; ALL source/trace/geometry/cleanup caps retained");
  assert.doesNotMatch(HERO_WIDTH_FLEX_CSS, /content-visibility|visibility:|display:none|order:/);
  return result;
}

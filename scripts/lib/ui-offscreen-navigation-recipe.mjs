// Preserve the actual failed CSS experiment. Change ONLY the unavailable
// responsive-navbar interaction, add its disclosure and a post-render snapshot.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeUiLargestBlinkControl as oldControl, makeOffscreenMatrixDriver as oldDriver } from "./ui-offscreen-matrix-recipe.mjs";
const change = (source, before, after) => {
  assert.equal(source.split(before).length, 2, before); const result = source.replace(before, after);
  assert.equal(result.replace(after, before), source); return result;
};
export function makeUiLargestBlinkControl(source, root, helperUrl) {
  let result = oldControl(source, root, helperUrl);
  result = change(result, '  await page.getByRole("link", { name: "Verified formats", exact: true }).click();',
    `  const formatLink = page.locator('a[href="#formats"]').first();
  assert.equal(await formatLink.count(), 1);
  cssCandidate.navbarLinkVisible = await formatLink.isVisible();
  cssCandidate.viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  if (cssCandidate.navbarLinkVisible) {
    await formatLink.click(); cssCandidate.navigationMode = "visible-user-link-click";
  } else {
    // Native fragment navigation, exactly as typing #formats in the address
    // bar. NOT a forced hidden click or bypassed renderer/layout assertion.
    await page.evaluate(() => { location.hash = "formats"; });
    cssCandidate.navigationMode = "native-fragment-navigation-responsive-link-hidden";
  }`);
  result = change(result, '  cssCandidate.allCardsAvailable = true; assert.deepEqual(forbidden, []);',
    '  cssCandidate.allCardsAvailable = true; assert.deepEqual(forbidden, []);\n  await snapshot("offscreen-matrix-actually-rendered");');
  result = change(result, '"scripts/diagnose-ui-offscreen-matrix.mjs",',
    '"scripts/diagnose-ui-offscreen-rendered-matrix.mjs", "scripts/lib/ui-offscreen-navigation-recipe.mjs", "scripts/diagnose-ui-offscreen-matrix.mjs",');
  return change(result, '-ui-offscreen-matrix.json', '-ui-offscreen-rendered-matrix.json');
}
export function makeOffscreenRenderedMatrixDriver(source, root) {
  let result = oldDriver(source, root);
  const url = name => JSON.stringify(pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href);
  result = change(result, `from ${url("ui-offscreen-matrix-recipe")};`, `from ${url("ui-offscreen-navigation-recipe")};`);
  return change(result, 'evidence/ui-offscreen-matrix-experiment-2026-10-07.json', 'evidence/ui-offscreen-rendered-matrix-experiment-2026-10-07.json');
}

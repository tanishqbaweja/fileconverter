// Private CSS-only experiment. Intercept ONE small static stylesheet; never
// intercept a file, engine or output, and never alter published dist/source.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeUiLargestBlinkControl as baseline } from "./ui-largest-blink-recipe.mjs";
export const OFFSCREEN_MATRIX_CSS = ".formats-section{content-visibility:auto;contain-intrinsic-block-size:auto 20000px}";
const change = (source, before, after) => {
  assert.equal(source.split(before).length, 2, before); const result = source.replace(before, after);
  assert.equal(result.replace(after, before), source); return result;
};
export function makeUiLargestBlinkControl(source, root, helperUrl) {
  let result = baseline(source, root, helperUrl);
  const patches = [
    ['const traceReports = [];', `const traceReports = [];
const cssCandidate = { css: ${JSON.stringify(OFFSCREEN_MATRIX_CSS)}, staticAssets: [], interceptionError: null,
  matrixMarkupSha256: null, matrixCards: null, formatAnchorWorked: false, allCardsAvailable: false,
  publishedCssModified: false, enginesModified: false, publicAcceptance: false };`],
    ['  await snapshot("blank-ui-control-only");', `  await context.route(origin + "/assets/*.css", async route => {
    try {
      assert.ok(cssCandidate.staticAssets.length < 2, "Static stylesheet response cap");
      const response = await route.fetch(), css = await response.text();
      assert.ok(Buffer.byteLength(css) <= 1048576, "Small STATIC stylesheet only, never user input");
      assert.ok(css.includes(".formats-section") && css.includes(".matrix"));
      const body = css + "\\n" + cssCandidate.css;
      cssCandidate.staticAssets.push({ url: route.request().url(), beforeBytes: Buffer.byteLength(css),
        beforeSha256: sha(css), afterBytes: Buffer.byteLength(body), afterSha256: sha(body) });
      await route.fulfill({ response, body });
    } catch (error) { cssCandidate.interceptionError = String(error).slice(0, 512); await route.abort("failed"); }
  });
  await snapshot("blank-ui-control-only");`],
    ['  const fileCdp = await context.newCDPSession(page);', `  assert.equal(cssCandidate.interceptionError, null); assert.equal(cssCandidate.staticAssets.length, 1);
  assert.equal(await page.evaluate(() => CSS.supports("content-visibility", "auto") &&
    CSS.supports("contain-intrinsic-block-size", "auto 20000px")), true);
  assert.equal(await page.locator("#formats").evaluate(e => getComputedStyle(e).contentVisibility), "auto");
  const matrix = await page.locator("#formats").innerHTML(); assert.ok(Buffer.byteLength(matrix) < 262144);
  cssCandidate.matrixMarkupSha256 = sha(matrix); cssCandidate.matrixCards = await page.locator("#formats .matrix article").count();
  assert.equal(cssCandidate.matrixCards, 405);
  assert.equal(cssCandidate.matrixMarkupSha256, "4d2f0c1da04db1bbd47e2bee964503f510cc31c001b619bc454fe6780df8f7c1");
  const fileCdp = await context.newCDPSession(page);`],
    ['  await delay(3000); await snapshot("ui-control-settled-3s"); assert.deepEqual(forbidden, []);',
      `  await delay(3000); await snapshot("ui-control-settled-3s"); assert.deepEqual(forbidden, []);
  // User navigation and rendered-card checks AFTER memory snapshots; forcing
  // offscreen descendant layout earlier would invalidate this experiment.
  await page.getByRole("link", { name: "Verified formats", exact: true }).click();
  await page.locator("#formats h2").waitFor({ state: "visible" });
  await delay(500);
  const visible = await page.locator("#formats").evaluate(e => { const r = e.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height, viewport: innerHeight }; });
  assert.ok(visible.top < visible.viewport && visible.bottom > 0 && visible.height > 1000);
  cssCandidate.formatAnchorWorked = true;
  const rendered = await page.locator("#formats .matrix article").evaluateAll(cards => cards.map(e => ({
    text: e.textContent, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })));
  assert.equal(rendered.length, 405); assert.ok(rendered.every(c => c.text && c.width > 0 && c.height > 0));
  assert.equal(sha(await page.locator("#formats").innerHTML()), cssCandidate.matrixMarkupSha256);
  cssCandidate.allCardsAvailable = true; assert.deepEqual(forbidden, []);`],
    ['"scripts/diagnose-ui-largest-blink.mjs",',
      '"scripts/diagnose-ui-offscreen-matrix.mjs", "scripts/lib/ui-offscreen-matrix-recipe.mjs", "app/globals.css", "scripts/diagnose-ui-largest-blink.mjs",'],
    ['scope: "Actual production UI source inspection and60format-selection changes; two independent single detailed largest64 Blink sessions only"',
      'scope: "Private static-CSS offscreen-matrix experiment; real production source inspection/60selections/two single detailed largest64 sessions, no conversion or publication"'],
    ['rows, traceReports, forbidden,', 'rows, traceReports, cssCandidate, forbidden,'],
    ['-ui-largest-blink.json', '-ui-offscreen-matrix.json'],
    ['await createOwnedRuntimeScratch("ui-largest-blink-")', 'await createOwnedRuntimeScratch("ui-offscreen-matrix-")'],
  ];
  for (const [before, after] of patches) result = change(result, before, after);
  let reversed = result;
  for (const [before, after] of [...patches].reverse()) reversed = reversed.replace(after, before);
  assert.equal(reversed, baseline(source, root, helperUrl)); return result;
}
export function makeOffscreenMatrixDriver(source, root) {
  assert.equal(createHash("sha256").update(source).digest("hex"), "c9e20cd64efde4fe445d19421cf482873df4a903a092af05b76be14f2679e180");
  const url = name => JSON.stringify(pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href);
  const patches = [
    ['const root = path.resolve(import.meta.dirname, ".."), sha', `const root = ${JSON.stringify(root)}, sha`],
    ...["owned-runtime-scratch", "largest-blink-attribution-recipe", "ui-largest-blink-join"].map(name =>
      [`from "./lib/${name}.mjs";`, `from ${url(name)};`]),
    ['from "./lib/ui-largest-blink-recipe.mjs";', `from ${url("ui-offscreen-matrix-recipe")};`],
    ['"ui-largest-blink-driver-"', '"ui-offscreen-matrix-driver-"'],
    ['forbidden: report.forbidden,', 'cssCandidate: report.cssCandidate, forbidden: report.forbidden,'],
    ['evidence/ui-largest-blink-types-2026-10-07.json', 'evidence/ui-offscreen-matrix-experiment-2026-10-07.json'],
  ];
  let result = source; for (const [before, after] of patches) result = change(result, before, after);
  let reversed = result; for (const [before, after] of [...patches].reverse()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source); return result;
}

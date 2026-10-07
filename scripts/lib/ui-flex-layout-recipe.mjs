// Private A/B: change only dynamic control layout, never hide content or change engines.
import assert from "node:assert/strict";
import { makeUiLargestBlinkControl as baseline } from "./ui-largest-blink-recipe.mjs";
export const DYNAMIC_FLEX_CSS = `
.control-grid,.encoding-options-grid,.source-inspection dl,.live-metrics{display:flex;flex-wrap:wrap}
.control-grid>*{flex:0 0 calc((100% - .8rem)/2);min-width:0}
.encoding-options-grid>*{flex:0 0 calc((100% - 1.3rem)/3);min-width:0}
.source-inspection dl>*{flex:0 0 calc((100% - 1rem)/2);min-width:0}
.live-metrics>*{flex:0 0 calc((100% - 1.4rem)/3);min-width:0}
.conversion-plan>ul{display:flex;flex-direction:column}
.conversion-plan>ul>li{display:flex;align-items:flex-start}
.conversion-plan>ul>li>span:first-child{flex:0 0 5.25rem}
.conversion-plan>ul>li>span:last-child{display:flex;flex:1;flex-direction:column;min-width:0}
@media(max-width:680px){.control-grid>*,.encoding-options-grid>*{flex-basis:100%}.live-metrics>*{flex-basis:calc((100% - .7rem)/2)}}
`;
export function makeUiFlexLayoutControl(source, root, helperUrl, candidate) {
  assert.equal(typeof candidate, "boolean");
  const prior = baseline(source, root, helperUrl), mode = candidate ? "flex" : "grid";
  const patches = [
    ['const traceReports = [];', `const traceReports = [];
const layoutExperiment = { mode: ${JSON.stringify(mode)}, css: ${JSON.stringify(candidate ? DYNAMIC_FLEX_CSS : "")}, staticAssets: [], interceptionError: null,
  geometry: [], matrixCards: null, matrixMarkupSha256: null, choices: null,
  changedPublishedFiles: false, conversionsPerformed: 0, publicAcceptance: false };
async function recordGeometry(profileId, viewport) {
  await page.setViewportSize(viewport);
  await page.locator('[data-testid="format-select"]').selectOption(profileId);
  await delay(250);
  const value = await page.evaluate(() => {
    const selectors = [".control-grid", ".encoding-options-grid", ".source-inspection dl", ".conversion-plan>ul", ".conversion-plan>ul>li", ".conversion-plan>ul>li>span"];
    return { viewport: { width: innerWidth, height: innerHeight },
      rows: selectors.flatMap(selector => [...document.querySelectorAll(selector)].map((e, index) => {
        const r = e.getBoundingClientRect();
        return { selector, index, tag: e.tagName, html: e.innerHTML, display: getComputedStyle(e).display,
          x: r.x, y: r.y, width: r.width, height: r.height };
      })),
      controls: [...document.querySelectorAll('.converter-card button,.converter-card input,.converter-card select,.converter-card summary')].map(e =>
        ({ tag: e.tagName, testId: e.getAttribute('data-testid'), text: e.textContent, aria: e.getAttribute('aria-label'), disabled: e.disabled ?? false })),
      overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.ok(value.rows.length > 0 && value.rows.length < 256);
  assert.equal(value.overflow, false, "No horizontal viewport overflow");
  for (const row of value.rows) {
    assert.ok(Buffer.byteLength(row.html) < 262144); row.htmlSha256 = sha(row.html); delete row.html;
    assert.ok(row.width > 0 && row.height > 0, "All inspected controls remain laid out");
  }
  layoutExperiment.geometry.push({ profileId, ...value });
}`],
    ['  await snapshot("blank-ui-control-only");', `  // Identical interception in BOTH modes; baseline stylesheet is byte unchanged.
  await context.route(origin + "/assets/*.css", async route => {
    try {
      assert.equal(layoutExperiment.staticAssets.length, 0);
      const response = await route.fetch(), css = await response.text();
      assert.ok(Buffer.byteLength(css) < 1048576 && css.includes(".control-grid"));
      const body = css + layoutExperiment.css;
      layoutExperiment.staticAssets.push({ url: route.request().url(), beforeBytes: Buffer.byteLength(css), beforeSha256: sha(css),
        afterBytes: Buffer.byteLength(body), afterSha256: sha(body) });
      await route.fulfill({ response, body });
    } catch (error) { layoutExperiment.interceptionError = String(error).slice(0, 512); await route.abort("failed"); }
  });
  await snapshot("blank-ui-control-only");`],
    ['  const fileCdp = await context.newCDPSession(page);', `  assert.equal(layoutExperiment.interceptionError, null); assert.equal(layoutExperiment.staticAssets.length, 1);
  const matrix = await page.locator("#formats").innerHTML(); assert.ok(Buffer.byteLength(matrix) < 262144);
  layoutExperiment.matrixMarkupSha256 = sha(matrix); layoutExperiment.matrixCards = await page.locator("#formats .matrix article").count();
  assert.equal(layoutExperiment.matrixCards, 405);
  assert.equal(layoutExperiment.matrixMarkupSha256, "4d2f0c1da04db1bbd47e2bee964503f510cc31c001b619bc454fe6780df8f7c1");
  const fileCdp = await context.newCDPSession(page);`],
    ['  const alternate = choices.find(value => value && value !== "mkv-to-mp4"); assert.ok(alternate);',
      '  layoutExperiment.choices = choices;\n  const alternate = choices.find(value => value && value !== "mkv-to-mp4"); assert.ok(alternate);'],
    ['  await delay(3000); await snapshot("ui-control-settled-3s"); assert.deepEqual(forbidden, []);',
      `  await delay(3000); await snapshot("ui-control-settled-3s"); assert.deepEqual(forbidden, []);
  // Identical responsive/encoding-control checks AFTER both traces; no deferral.
  for (const profileId of ["mkv-to-mp4", "mkv-to-mp4-mpeg4", "mkv-to-wav"]) {
    assert.ok(choices.includes(profileId));
    for (const viewport of [{ width:758,height:482 },{ width:1280,height:900 },{ width:390,height:844 }])
      await recordGeometry(profileId, viewport);
  }
  assert.equal(sha(await page.locator("#formats").innerHTML()), layoutExperiment.matrixMarkupSha256);
  assert.equal(await page.locator("#formats .matrix article").count(), 405);
  assert.deepEqual(forbidden, []);`],
    ['"scripts/diagnose-ui-largest-blink.mjs",', '"scripts/diagnose-ui-flex-layout.mjs", "scripts/lib/ui-flex-layout-recipe.mjs", "app/globals.css", "scripts/diagnose-ui-largest-blink.mjs",'],
    ['scope: "Actual production UI source inspection and60format-selection changes; two independent single detailed largest64 Blink sessions only"',
      'scope: "Paired private dynamic-control flex/grid layout: unchanged actual source inspection/60selections/two independent detailed largest64 sessions; no conversion"'],
    ['rows, traceReports, forbidden,', 'rows, traceReports, layoutExperiment, forbidden,'],
    ['-ui-largest-blink.json', `-ui-${mode}-layout.json`],
    ['await createOwnedRuntimeScratch("ui-largest-blink-")', `await createOwnedRuntimeScratch("ui-${mode}-layout-")`],
  ];
  let result = prior;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result; for (const [before, after] of [...patches].reverse()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior, "Only declared paired staticCSS/provenance/post-measurement geometry changes");
  // Original teardown assertions are preserved; independent identity cleanup runs later.
  assert.ok(result.includes('assert.equal(state.jobState, "idle"'));
  assert.ok(!DYNAMIC_FLEX_CSS.includes("content-visibility") && !DYNAMIC_FLEX_CSS.includes("display:none"));
  return result.replace('from "@playwright/test";', `from ${JSON.stringify(import.meta.resolve("@playwright/test"))};`);
}

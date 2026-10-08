// Extend the executed five-test suite with private CSS and bounded UI observations.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DYNAMIC_FLEX_CSS } from "./ui-flex-layout-recipe.mjs";
import { MATRIX_FLEX_CSS } from "./ui-matrix-flex-layout-recipe.mjs";

const sha = data => createHash("sha256").update(data).digest("hex");
const transform = (source, patches) => {
  let result = source;
  for (const [before, after, occurrences = 1] of patches) {
    assert.equal(result.split(before).length, occurrences + 1, before);
    result = result.replaceAll(before, after);
  }
  let reversed = result;
  for (const [before, after] of patches.toReversed()) reversed = reversed.replaceAll(after, before);
  assert.equal(reversed, source, "Every original conversion/quality/AVIO/recovery/finally assertion preserved");
  return result;
};

export function makeMatrixGoldenSpec(source, root, screenshotPrefix, expectedSourceHash) {
  assert.equal(sha(source), expectedSourceHash);
  assert.match(screenshotPrefix, /^\d{4}-\d{2}-\d{2}T[0-9TZ-]+-matrix-goldens$/);
  const css = DYNAMIC_FLEX_CSS + MATRIX_FLEX_CSS;
  assert.doesNotMatch(css, /content-visibility|visibility:|display:none|order:/);
  const observe = `
const matrixCss = ${JSON.stringify(css)};
let stylesheetRecords: Array<Record<string, unknown>> = [];
let uiScreenshotNumber = 0;
async function observeMatrixUi(page: import("@playwright/test").Page, phase: string, capture: boolean) {
  const value = await page.evaluate(() => {
    const selectors = [".control-grid", ".encoding-options-grid", ".live-metrics", ".conversion-plan", ".matrix"];
    const state = window.__WITHIN_TEST__?.getState();
    return { viewport: { width: innerWidth, height: innerHeight }, overflow: document.documentElement.scrollWidth > innerWidth,
      jobState: state?.jobState ?? null, metrics: state?.metrics ?? null, phase: state?.phase ?? null,
      matrixCards: document.querySelectorAll(".matrix article").length,
      rows: selectors.flatMap(selector => [...document.querySelectorAll(selector)].map(e => {
        const r = e.getBoundingClientRect(); return { selector, display: getComputedStyle(e).display,
          x: r.x, y: r.y, width: r.width, height: r.height };
      })) };
  });
  expect(value.matrixCards).toBe(405); expect(value.overflow).toBe(false);
  expect(value.rows.length).toBeLessThan(32);
  for (const row of value.rows) { expect(row.width).toBeGreaterThan(0); expect(row.height).toBeGreaterThan(0); }
  const markup = await page.locator("#formats").innerHTML(); expect(Buffer.byteLength(markup)).toBeLessThan(262144);
  const matrixSha256 = createHash("sha256").update(markup).digest("hex");
  expect(matrixSha256).toBe("4d2f0c1da04db1bbd47e2bee964503f510cc31c001b619bc454fe6780df8f7c1");
  let screenshot: { path: string; bytes: number; sha256: string } | null = null;
  if (capture) {
    expect(uiScreenshotNumber).toBeLessThan(8);
    const file = path.join(root, "output/playwright", ${JSON.stringify(screenshotPrefix)} + "-" + (++uiScreenshotNumber) + ".png");
    const image = await page.screenshot({ path: file }); expect(image.length).toBeLessThan(2 * 1048576);
    screenshot = { path: path.relative(root, file).replaceAll("\\\\", "/"), bytes: image.length,
      sha256: createHash("sha256").update(image).digest("hex") };
  }
  rows.push({ kind: "matrix-ui-observation", observationPhase: phase, ...value, matrixSha256, screenshot });
}
`;
  return transform(source, [
    ['const root = path.resolve(import.meta.dirname, "../..");', `const root = ${JSON.stringify(root)};`],
    ...["copied-audio-timing", "small-matroska-mp4-timeline"].map(name => [
      `from "../../scripts/lib/${name}.mjs";`, `from ${JSON.stringify(pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href)};`]),
    ['test.use({ channel: process.env.WITHIN_BROWSER_CHANNEL || undefined, serviceWorkers: "block" });',
      'test.use({ channel: process.env.WITHIN_BROWSER_CHANNEL || undefined, serviceWorkers: "block", headless: false, viewport: { width: 1280, height: 900 } });'],
    ['test.beforeEach(async ({ context, browser, page }) => {', observe + `
test.beforeEach(async ({ context, browser, page }) => {
  stylesheetRecords = [];
  await context.route("**/assets/*.css", async route => {
    const response = await route.fetch(), css = await response.text();
    expect(Buffer.byteLength(css)).toBeLessThan(1048576); expect(css).toContain(".matrix");
    expect(stylesheetRecords.length).toBe(0);
    const body = css + matrixCss;
    stylesheetRecords.push({ url: route.request().url(), beforeBytes: Buffer.byteLength(css),
      beforeSha256: createHash("sha256").update(css).digest("hex"), afterBytes: Buffer.byteLength(body),
      afterSha256: createHash("sha256").update(body).digest("hex") });
    await route.fulfill({ response, body });
  });`],
    ['  rows.push({ cleanupRemovedEntries: entries });', `  rows.push({ cleanupRemovedEntries: entries });
  expect(stylesheetRecords).toHaveLength(1);
  rows.push({ kind: "matrix-static-stylesheet", records: [...stylesheetRecords] });
  await observeMatrixUi(page, "terminal-after-cleanup", true);`],
    ['    const beforeCancel = await page.evaluate(() => window.__WITHIN_TEST__!.getState());',
      '    await observeMatrixUi(page, "real-output-before-cancel", true);\n    const beforeCancel = await page.evaluate(() => window.__WITHIN_TEST__!.getState());'],
  ]);
}

export function makeMatrixGoldenDriver(source, root, configPath) {
  assert.equal(sha(source), "b4cb70a6977f664337e6c80e8f296f58d2f50297b599e96a21cff91b84d0a9c4");
  return transform(source, [
    ['const root = path.resolve(import.meta.dirname, ".."), exec =', `const root = ${JSON.stringify(root)}, exec =`],
    ['from "./lib/owned-runtime-scratch.mjs";', `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/owned-runtime-scratch.mjs")).href)};`],
    ['"mpeg2-split-direct-runtime-"', '"mpeg2-matrix-golden-runtime-"'],
    ['"scripts/stage-mpeg2-split-direct.mjs"', '"scripts/stage-mpeg2-late-allocator-abort.mjs"', 3],
    ['{ ...runtime.env, WRANGLER_SEND_METRICS: "false",', '{ ...runtime.env, WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: "mpeg2-split-pipeline-37739125738", WRANGLER_SEND_METRICS: "false",'],
    ['"tests/browser/mpeg2-split-direct-candidate.spec.ts", "--reporter=line"', `"--config", ${JSON.stringify(configPath)}, "--reporter=line", "--output=" + path.join(runtime.directory,"artifacts")`],
    ['  await finishOwnedCleanup([() => stop(runner), () => stop(server)]);',
      '  try { await finishOwnedCleanup([() => stop(runner), () => stop(server)]); }\n  catch(error) { process.stderr.write(String(error)+"\\n"); process.exitCode=1; }'],
    ['{ cwd: root, env: runtime?.env, windowsHide: true });', '{ cwd: root, env: { ...runtime?.env, WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: "mpeg2-split-pipeline-37739125738" }, windowsHide: true });'],
  ]);
}

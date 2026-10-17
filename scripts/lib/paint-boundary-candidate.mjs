// Private CSS-only candidate; no codec, module transport, UI state or progress edits.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeCompiledCacheApp } from "./compiled-cache-candidate.mjs";
import { deriveWarmCacheDriver, deriveWarmCacheCaller } from "./warm-cache-qualification.mjs";
export const PAINT_WRAP_CSS = "\n.progress-panel,.warning,.error{overflow-wrap:anywhere}\n";
// New stacking contexts on individual panels changed text rasterization and
// were rejected. The card already has a stacking context: scope layout there.
export const PAINT_BOUNDARY_CSS = "\n.converter-card{contain:layout style}\n.progress-panel,.warning,.error{overflow-wrap:anywhere}\n";
export const PAINT_VISUAL_PROOF = "evidence/2026-10-17-card-layout-settled-visual.json";
const buildPath = "evidence/2026-10-17T04-01-20-706Z-compiled-cache-build.json";
const root = path.resolve(import.meta.dirname, "../..");
const buildBytes = await readFile(path.join(root, buildPath));
assert.equal(sha(buildBytes), "c1c2c581a8bde2d45573bfb0225bd92017286fc684272c568beab96a3e8688ba");
const style = JSON.parse(buildBytes).stylesheet, zipped = await readFile(path.join(root, style.archive.path));
assert.equal(sha(zipped), style.archive.sha256);
export const PAINT_BASE_CSS = gunzipSync(zipped, { maxOutputLength: 1048576 }).toString();
assert.equal(sha(PAINT_BASE_CSS), style.sha256);
const files = ["scripts/lib/paint-boundary-candidate.mjs", "scripts/validate-paint-boundary-visual.mjs", "scripts/qualify-paint-boundary.mjs",
  "tests/paint-boundary-candidate.test.mjs", buildPath, style.archive.path, PAINT_VISUAL_PROOF];
export function renderStatusPanels(app, values) {
  const candidate = makeCompiledCacheApp(app).generated;
  const source = ts.createSourceFile("ConverterApp.tsx", candidate, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sections = [];
  const visit = node => {
    if (ts.isJsxExpression(node)) {
      const text = node.getText(source);
      if ((text.startsWith("{metrics ? (") && text.includes('className="progress-panel"')) || text.startsWith("{warnings.map(") || text.startsWith("{error ? (")) sections.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source); assert.equal(sections.length, 3);
  const helpers = source.statements.filter(node => ts.isFunctionDeclaration(node) && ["formatBytes", "formatDuration"].includes(node.name?.text)).map(node => node.getText(source)).join("\n");
  const fragment = `function View(p){const {metrics,phase,progress,throughput,selectedProfile,estimatedRemainingMs,jobState,peakJsHeap,warnings,error}=p;
    return <main><section className="converter-card">${sections.join("\n")}<button className="convert-button">Continue</button></section></main>;}
    ${helpers}\nView;`;
  const result = ts.transpileModule(fragment, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, reportDiagnostics: true });
  assert.deepEqual(result.diagnostics, []);
  const View = runInNewContext(result.outputText, { exports: {}, require: id => { assert.equal(id, "react/jsx-runtime"); return jsxRuntime; } }, { timeout: 1000 });
  return { markup: renderToStaticMarkup(createElement(View, values)), sectionsSha256: sha(sections.join("\n")), helpersSha256: sha(helpers),
    scope: "actual-component-sections-only-no-simulated-conversion" };
}
export function derivePaintBoundaryDriver(...args) {
  const parent = deriveWarmCacheDriver(...args);
  const match = parent.generated.match(/^const cssCandidate = \{ css: ("(?:\\.|[^"\\])*")/m); assert.ok(match);
  const previousCss = JSON.parse(match[1]), nextCss = previousCss + PAINT_BOUNDARY_CSS;
  const oldBinding = { url: "/assets/index-CxGQ2N3s.css", bytes: 26354, sha256: "3c4c62c528d98b5bd03492134f40bdca249e9c2896a5b607a63ca29ae46c34a6",
    afterBytes: 27940, afterSha256: "81862974af7b02ede01b5122b4a8bc372600fb6f528bd11fabee2687ea78e311", matrixCssBytes: 1586, matrixCssSha256: "37257965a98bdeede4bdcba5677e0f75f42431b7405530169fcfeb2ef106022a" };
  assert.equal(sha(PAINT_BASE_CSS + previousCss), oldBinding.afterSha256);
  const nextBinding = { ...oldBinding, afterBytes: Buffer.byteLength(PAINT_BASE_CSS + nextCss), afterSha256: sha(PAINT_BASE_CSS + nextCss),
    matrixCssBytes: Buffer.byteLength(nextCss), matrixCssSha256: sha(nextCss) };
  const result = exactPatch(parent.generated, [[match[0], 'const cssCandidate = { css: ' + JSON.stringify(nextCss)],
    [JSON.stringify(oldBinding), JSON.stringify(nextBinding)],
    ['  loadedIdle = await stable("loaded-idle");',
      '  assert.equal(await page.evaluate(()=>CSS.supports("contain","layout style")),true);\n  progressProbe.paintBoundaryCandidate={css:' + JSON.stringify(PAINT_BOUNDARY_CSS) + ',cssSha256:' + JSON.stringify(sha(PAINT_BOUNDARY_CSS)) + ',nativeChanged:false,progressChanged:false,publicAcceptance:false};\n  loadedIdle = await stable("loaded-idle");'],
  ]);
  return { ...result, cssBinding: nextBinding, publicAcceptance: false };
}
export function derivePaintBoundaryCaller(source, root) {
  const parent = deriveWarmCacheCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const result = exactPatch(parent.generated, [
    [`import {deriveWarmCacheDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("warm-cache-qualification.mjs"))};`,
      `import {derivePaintBoundaryDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("paint-boundary-candidate.mjs"))};`],
    ['  const ownFiles=[', `  const ownFiles=[${files.map(JSON.stringify).join(",")},`],
  ]);
  return { generated: result.generated.replaceAll('${stamp}-warm-cache-control-', '${stamp}-paint-boundary-control-')
    .replace('|warm-cache-control|memoized-handoff-control)', '|warm-cache-control|paint-boundary-control|lifecycle-warm-control|memoized-handoff-control)'), publicAcceptance: false };
}

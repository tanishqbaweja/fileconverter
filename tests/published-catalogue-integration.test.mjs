import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement, memo, useMemo } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { build } from "esbuild";
import { conversionProfiles, formatById } from "../lib/capability-registry.ts";
import { readPreCatalogueUi } from "./helpers/historical-published-ui.mjs";

const normalize = text => text.replaceAll("\r\n", "\n");
const app = normalize(await readFile("app/converter/ConverterApp.tsx", "utf8"));
const oldApp = normalize(await readPreCatalogueUi("app/converter/ConverterApp.tsx"));
const component = normalize(await readFile("app/converter/PublishedFormatsCatalogue.tsx", "utf8"));
const oldComponent = normalize(await readPreCatalogueUi("app/converter/PublishedFormatsCatalogue.tsx"));
const model = await build({ entryPoints: ["lib/published-catalogue.ts"], bundle: true, format: "esm", write: false });
const { cataloguePage, CATALOGUE_QUERY_LIMIT } = await import("data:text/javascript;base64," + Buffer.from(model.outputFiles[0].contents).toString("base64"));
const published = conversionProfiles.filter(profile => profile.public && profile.automatedTestStatus === "passed");
const compile = source => ts.transpileModule(source, { fileName: "catalogue.tsx", compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const requireJsx = name => { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; };
const articleHtml = html => (html.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) ?? []).map(card =>
  card.replace(/ data-profile-id="[^"]+"/, "").replaceAll("<!-- -->", ""));

test("current application mounts the bounded component with explicit lifecycle and localhost qualification integration", () => {
  // Account for ONLY reviewed lifecycle/private-option integration. Each hunk is
  // unique and reversible; the complete historical UI comparison below remains
  // mandatory and still catches every unrelated change.
  const codeOwnerEdits = [
    ['            <strong>App-owned temporary storage</strong>\n            <p data-testid="opfs-private-mode-notice">\n              Use a normal browser window for large jobs. Private/Incognito\n              browser storage can be RAM-backed and is not qualified for\n              large-file temporary storage. Your files still stay on this device.\n            </p>\n',
      '            <strong>App-owned temporary storage</strong>\n'],
    ['    supportsVideoEncodingOptions(selectedProfile);\n  const privateMpeg2Options = selectedProfile?.id === MPEG2_JOB_PROFILE;\n',
      '    supportsVideoEncodingOptions(selectedProfile);\n'],
    ['              {videoEncodingOptionsEnabled ? (\n                <fieldset\n                  data-testid="video-encoding-options"\n',
      '              {videoEncodingOptionsEnabled ? (\n                <fieldset\n'],
    ['                    {privateMpeg2Options\n                      ? "Qualification-only controls: automatic retains the current private MPEG-2 policy; broader memory and fidelity gates remain open."\n                      : "Automatic retains the fastest certified profile."} Width and\n',
      '                    Automatic retains the fastest certified profile. Width and\n'],
    ['                        data-testid="video-codec-select"\n                        disabled={privateMpeg2Options}\n', '                        data-testid="video-codec-select"\n'],
    ['                          {privateMpeg2Options ? "MPEG-2 (fixed)" : `Automatic (${selectedProfile?.output === "webm-vp9"\n',
      '                          Automatic ({selectedProfile?.output === "webm-vp9"\n'],
    ['                              : "MPEG-4 Part 2"})`}', '                              : "MPEG-4 Part 2"})'],
    ['                        {privateMpeg2Options ? null : selectedProfile?.output === "ogv" ? (', '                        {selectedProfile?.output === "ogv" ? ('],
    ['                        <option value="automatic">{privateMpeg2Options ? "Automatic" : "Automatic (fastest certified)"}</option>',
      '                        <option value="automatic">Automatic (fastest certified)</option>'],
    ['                        <option value="higher">{privateMpeg2Options ? "Higher quality" : "Higher visual quality"}</option>',
      '                        <option value="higher">Higher visual quality</option>'],
    ['import { createMpeg2CompiledCoreSlot } from "../../lib/mpeg2-compiled-core";\nimport { MPEG2_JOB_PROFILE } from "../../lib/mpeg2-stage-policy";\n',
      'import { createMpeg2CompiledCoreSlot } from "../../lib/mpeg2-compiled-core";\n'],
    ['          batch.profile.id !== "m2v-to-ogv" &&\n          batch.profile.id !== MPEG2_JOB_PROFILE\n',
      '          batch.profile.id !== "m2v-to-ogv"\n'],
    ['      if (batch.testMode && !batch.testDirectoryMode && batch.profile.id !== MPEG2_JOB_PROFILE) {',
      '      if (batch.testMode && !batch.testDirectoryMode) {'],
    ['      destinationDirectoryHandle: testDirectoryMode || (testMode && selectedProfile.id === MPEG2_JOB_PROFILE)\n',
      '      destinationDirectoryHandle: testDirectoryMode\n'],
    ['  if (action === "reject") return "Reject";\n  if (action === "verify") return "Native check";\n',
      '  if (action === "reject") return "Reject";\n'],
    ['import { createStagedWorkerCoordinator } from "../../lib/staged-worker-coordinator";\nimport { createVpxCompiledCoreSlot } from "../../lib/vpx-compiled-core";\nimport { createMpeg2CompiledCoreSlot } from "../../lib/mpeg2-compiled-core";\n',
      'import { createStagedWorkerCoordinator } from "../../lib/staged-worker-coordinator";\n'],
    ['    let replacementTimer = 0;\n    // Retain only immutable static code across coordinator replacement. Worker\n    // instances, memories and all user-file/destination state still retire.\n    const staticCodeSlot = createVpxCompiledCoreSlot();\n    const mpeg2CodeSlot = createMpeg2CompiledCoreSlot();\n',
      '    let replacementTimer = 0;\n'],
    ['        () => new Worker(new URL("../../workers/staged-save.worker.ts", import.meta.url), { name: "within-final-save" }),\n        staticCodeSlot,\n        mpeg2CodeSlot,\n      );',
      '        () => new Worker(new URL("../../workers/staged-save.worker.ts", import.meta.url), { name: "within-final-save" }),\n      );'],
    ['      workerRef.current?.terminate();\n      staticCodeSlot.dispose();\n      mpeg2CodeSlot.dispose();\n      workerRef.current = null;',
      '      workerRef.current?.terminate();\n      workerRef.current = null;'],
  ];
  let withoutCodeOwner = app;
  for (const [current, historical] of codeOwnerEdits) {
    assert.equal(withoutCodeOwner.split(current).length, 2, "Unique exact code-owner hunk");
    withoutCodeOwner = withoutCodeOwner.replace(current, historical);
  }
  let reconstructed = withoutCodeOwner;
  for (const [current, historical] of [...codeOwnerEdits].reverse()) {
    assert.equal(reconstructed.split(historical).length, 2, "Unique exact reverse code-owner hunk");
    reconstructed = reconstructed.replace(historical, current);
  }
  assert.equal(reconstructed, app);
  const begin = oldApp.indexOf("  // The compiled registry is immutable; progress must not rebuild its static display.");
  const end = oldApp.indexOf("\n  return (\n    <main>", begin);
  assert.ok(begin > 0 && end > begin);
  const restored = withoutCodeOwner.replace('import { PublishedFormatsCatalogue } from "./PublishedFormatsCatalogue";\n', "")
    .replace('import { isVpxDecoderProfile } from "../../lib/vpx-decoder-policy";\n', "")
    .replace('import { runVpxQualificationJob, validateVpxQualificationRequest } from "../../lib/vpx-qualification-job";\n', "")
    .replace('import { createStagedWorkerCoordinator } from "../../lib/staged-worker-coordinator";\n', "")
    .replace('import { runMpeg2QualificationJob, validateMpeg2QualificationRequest, type Mpeg2QualificationResult } from "../../lib/mpeg2-qualification-job";\n', "")
    .replace('  StartConversionMessage,\n', "")
    .replace('  runQualificationJob: (request: StartConversionMessage) => Promise<Mpeg2QualificationResult>;\n', "")
    .replace('    const lifetime = new AbortController();\n', "")
    .replace(/      runQualificationJob: async request => {[\s\S]*?      },\n(?=      getState:)/, "")
    .replace('      lifetime.abort(new DOMException("Qualification view closed", "AbortError"));\n', "")
    .replace('      const worker = createStagedWorkerCoordinator(\n        () => new Worker(new URL("../../workers/conversion.worker.ts", import.meta.url), { name: "within-conversion" }),\n        () => new Worker(new URL("../../workers/staged-save.worker.ts", import.meta.url), { name: "within-final-save" }),\n      );', '      const worker = new Worker(\n        new URL("../../workers/conversion.worker.ts", import.meta.url),\n        { name: "within-conversion" },\n      );')
    .replace('    if (jobIdRef.current || activeBatchRef.current) return;\n', "")
    .replace('    // Destination preflight above awaits browser APIs. Another start may have\n    // acquired this lifecycle while those checks were pending.\n    if (jobIdRef.current || activeBatchRef.current || workerRef.current !== worker) return;\n', "")
    .replace("  const publishedFormatsSection = <PublishedFormatsCatalogue />;\n", oldApp.slice(begin, end));
  assert.equal(restored, oldApp);
  assert.equal(app.split("<PublishedFormatsCatalogue />").length, 2);
  assert.ok(app.includes("{publishedFormatsSection}"));
});

test("current component reuses only stateless display slots and preserves the tested search/pagination implementation", () => {
  const restored = component.replace("// Bounded registry display. This does not certify a conversion's memory budget.",
    "// Private candidate until full production-browser memory/recovery qualification.")
    .replace("        {/* Display-only slots have no local state; reuse their DOM on pagination. */}\n", "")
    .replace("view.profiles.map((profile, slot) => (", "view.profiles.map(profile => (")
    .replace("<article key={slot} data-profile-id={profile.id}>", "<article key={profile.id} data-profile-id={profile.id}>");
  assert.equal(restored, oldComponent);
  const card = component.slice(component.indexOf("<article "), component.indexOf("</article>") + "</article>".length);
  assert.doesNotMatch(card, /<(?:input|button|select|textarea|[A-Z])\b|\bon[A-Z]\w*=|\bref=|dangerouslySetInnerHTML/);
});

test("all405 current registry cards retain exactly the old rendered content and order over bounded pages", () => {
  const tree = ts.createSourceFile("old.tsx", oldApp, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression, formatter;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "publishedFormatsSection") expression = node.initializer.arguments[0].body.getText(tree);
    if (ts.isFunctionDeclaration(node) && node.name?.text === "formatBytes") formatter = node.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree); assert.ok(expression && formatter);
  const Reference = runInNewContext(compile(`${formatter}\nfunction Reference(){return ${expression};}\nReference;`),
    { exports: {}, conversionProfiles, formatById, require: requireJsx });
  const expected = articleHtml(renderToStaticMarkup(createElement(Reference)));
  const source = component.replace(/^import .*;\n/gm, "").replace("export const PublishedFormatsCatalogue", "const PublishedFormatsCatalogue");
  const code = compile(source + "\nPublishedFormatsCatalogue;");
  const render = (query, page) => {
    let calls = 0;
    const Component = runInNewContext(code, { exports: {}, memo, useMemo, cataloguePage, CATALOGUE_QUERY_LIMIT, formatById,
      useState: () => [calls++ === 0 ? query : page, () => {}], require: requireJsx });
    return renderToStaticMarkup(createElement(Component));
  };
  const observed = [];
  for (let page = 0; page < cataloguePage("", 0).pages; page++) {
    const cards = articleHtml(render("", page)); assert.ok(cards.length > 0 && cards.length <= 24); observed.push(...cards);
  }
  assert.equal(expected.length, 405); assert.deepEqual(observed, expected);
  for (const query of ["PNG", "NO_MATCH_音楽", "   "]) {
    const html = render(query, 0), view = cataloguePage(query, 0);
    assert.equal(articleHtml(html).length, view.profiles.length);
    assert.ok(html.includes("aria-live=\"polite\"")); assert.ok(html.includes('maxLength="128"'));
    assert.equal(view.publishedTotal, published.length);
  }
});

test("historical preimages keep their recorded hashes and cannot silently read current UI", async () => {
  assert.notEqual(app, oldApp); assert.notEqual(component, oldComponent);
  const currentCss = normalize(await readFile("app/globals.css", "utf8")), oldCss = normalize(await readPreCatalogueUi("app/globals.css"));
  const isolatedProgress = "\n.progress-panel {\n  contain: layout paint;\n", historicalProgress = "\n.progress-panel {\n";
  assert.equal(currentCss.split(isolatedProgress).length - 1, 1);
  const css = currentCss.replace(isolatedProgress, historicalProgress);
  assert.equal(css.replace(historicalProgress, isolatedProgress), currentCss);
  const begin = css.indexOf("\n.catalogue-search {"), end = css.indexOf("\nfooter {", begin);
  assert.ok(begin > 0 && end > begin); assert.equal(css.slice(0, begin) + css.slice(end), oldCss);
  await assert.rejects(readPreCatalogueUi("workers/media-remux.ts"), /three explicit historical UI sources/);
});

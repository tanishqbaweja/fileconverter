import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { transform } from "esbuild";
import * as jsxRuntime from "react/jsx-runtime";
import { createElement, useMemo, useState, memo } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { formatById } from "../lib/capability-registry.ts";
import { makeCatalogueSlotReuse, deriveCatalogueSlotUiHarness } from "../scripts/lib/catalogue-slot-reuse.mjs";
const require = createRequire(import.meta.url), root = process.cwd();
test("positional key reuses only exact stateless card; controls, JSX body, CSS and file data untouched", async () => {
  const source = await readFile("app/converter/PublishedFormatsCatalogue.tsx", "utf8"), result = makeCatalogueSlotReuse(source);
  let reversed = result.generated; for (const [before, after] of result.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source); assert.equal(result.edits.length, 2); assert.equal(result.cardBodyChanged, false);
  assert.equal(result.conversionControlsChanged, false); assert.equal(result.publicAcceptance, false);
  assert.throws(() => makeCatalogueSlotReuse(source.replace("<small>", "<small onClick={()=>{}}>")));
  await transform(result.generated, { loader: "tsx" });
});
test("actual React markup is byte-identical for multiple full/partial/empty pages and changing card values", async () => {
  const source = await readFile("app/converter/PublishedFormatsCatalogue.tsx", "utf8");
  function compile(text, page) {
    const stripped = text.replace(/^import .*;\n/gm, "").replace("export const PublishedFormatsCatalogue", "const PublishedFormatsCatalogue");
    const code = ts.transpileModule(stripped + "\nPublishedFormatsCatalogue;", { fileName: "view.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    return runInNewContext(code, { exports: {}, memo, useMemo, useState, formatById, CATALOGUE_QUERY_LIMIT: 128,
      cataloguePage: () => ({ profiles: page, first: page.length ? 1 : 0, last: page.length, total: page.length, publishedTotal: 405, page: 0, pages: 1 }),
      require: id => { assert.equal(id, "react/jsx-runtime"); return jsxRuntime; } });
  }
  const { conversionProfiles } = await import("../lib/capability-registry.ts");
  const published = conversionProfiles.filter(row => row.public && row.automatedTestStatus === "passed");
  for (const rows of [published.slice(0, 24), published.slice(24, 48), published.slice(-21), [],
    [{ ...published[0], route: "re-encode", maxTestedBytes: null }]]) {
    assert.equal(renderToStaticMarkup(createElement(compile(makeCatalogueSlotReuse(source).generated, rows))), renderToStaticMarkup(createElement(compile(source, rows))));
  }
});
test("headless UI gate requires actual node identity and zero newly created articles across all405routes", async () => {
  const result = deriveCatalogueSlotUiHarness(await readFile("scripts/validate-bounded-catalogue.mjs", "utf8"), root);
  for (const token of ["sameArticles,true", "sameChildren,true", "slotMutations.addedArticles,0", "slotMutations.removedArticles,3",
    "await slotHandle.dispose()", "assert.deepEqual(observed, expected", "keyboardNavigation: true", "Browser.close"])
    assert.ok(result.generated.includes(token), token);
  assert.equal(result.maximumRetainedTestSlots, 24); assert.equal(result.publicAcceptance, false);
  assert.equal(/^import[^\r\n]*"\.\.?\//m.test(result.generated), false, "Relocate actual static imports");
  assert.ok(result.generated.includes('from "./app/converter/PublishedFormatsCatalogue"'), "Leave nested browser-bundle imports relative to their explicit resolveDir");
  await transform(result.generated, { loader: "js" });
  assert.ok(require.resolve("react"));
});

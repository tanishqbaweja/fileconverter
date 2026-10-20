import { readPreCatalogueUi } from "./helpers/historical-published-ui.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { conversionProfiles } from "../lib/capability-registry.ts";
import { makeBoundedCatalogueApp } from "../scripts/lib/bounded-catalogue-candidate.mjs";
const require = createRequire(import.meta.url);
const modelBundle = await build({ entryPoints: ["lib/published-catalogue.ts"], bundle: true, write: false, format: "esm" });
const { cataloguePage, CATALOGUE_PAGE_SIZE, CATALOGUE_QUERY_LIMIT } = await import(
  `data:text/javascript;base64,${Buffer.from(modelBundle.outputFiles[0].text).toString("base64")}`);
const published = conversionProfiles.filter(profile => profile.public && profile.automatedTestStatus === "passed");
test("every published route remains available exactly once with at most24 cards per page", () => {
  const all = [];
  for (let page = 0; page < cataloguePage("", 0).pages; page++) {
    const result = cataloguePage("", page);
    assert.ok(result.profiles.length <= CATALOGUE_PAGE_SIZE); all.push(...result.profiles);
  }
  assert.deepEqual(all, published); assert.equal(new Set(all.map(row => row.id)).size, published.length);
  assert.equal(CATALOGUE_PAGE_SIZE, 24); assert.equal(CATALOGUE_QUERY_LIMIT, 128);
});
test("search finds every exact profile id and format without exposing private or failed profiles", () => {
  for (const profile of published) assert.ok(cataloguePage(profile.id, 0).profiles.some(row => row.id === profile.id), profile.id);
  for (const format of new Set(published.map(row => row.input))) {
    const pages = cataloguePage(format, 0).pages, results = [];
    for (let page = 0; page < pages; page++) results.push(...cataloguePage(format, page).profiles);
    for (const profile of published.filter(row => row.input === format)) assert.ok(results.some(row => row.id === profile.id));
    assert.ok(results.every(row => row.public && row.automatedTestStatus === "passed"));
  }
  assert.equal(cataloguePage("NO_MATCH_音楽".repeat(15), 50).total, 0);
  assert.deepEqual(cataloguePage("  PNG  ", 0), cataloguePage("png", 0));
  for (const page of [-100, NaN, Infinity]) assert.equal(cataloguePage("", page).page, 0);
  assert.equal(cataloguePage("", 100000).page, cataloguePage("", 0).pages - 1);
});
test("historical private overlay changes only catalogue against its immutable pre-integration source", async () => {
  const source = await readPreCatalogueUi("app/converter/ConverterApp.tsx"), result = makeBoundedCatalogueApp(source);
  let reversed = result.generated;
  for (const [before, after] of result.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.ok(reversed.includes(result.originalSection)); assert.equal(result.conversionSettingsChanged, false);
  assert.equal(result.maximumMountedCards, 24); assert.equal(result.publicAcceptance, false);
});
test("actual React component has labelled bounded search, live results and native pagination", async () => {
  const bundle = await build({ entryPoints: ["app/converter/PublishedFormatsCatalogue.tsx"], bundle: true, write: false,
    platform: "node", format: "cjs", jsx: "automatic", external: ["react", "react/jsx-runtime"] });
  const loaded = { exports: {} };
  runInNewContext(bundle.outputFiles[0].text, { module: loaded, exports: loaded.exports, require }, { timeout: 1000 });
  const html = renderToStaticMarkup(createElement(loaded.exports.PublishedFormatsCatalogue));
  assert.equal((html.match(/data-profile-id=/g) ?? []).length, 24);
  assert.ok(html.includes('maxLength="128"')); assert.ok(html.includes('aria-live="polite"'));
  assert.ok(html.includes('aria-label="Supported format pages"')); assert.ok(html.includes("Previous formats"));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { makeBoundedCatalogueBuilder, deriveBoundedCatalogueDriver, deriveBoundedCatalogueCaller } from "../scripts/lib/bounded-catalogue-control.mjs";
import { normalizeCatalogueCardHtml } from "../scripts/lib/catalogue-card-html.mjs";
const root = process.cwd(), read = file => readFile(path.join(root, file), "utf8");
test("hydration comparison ignores only literal empty React separators, not text/attributes/spacing/comments", () => {
  const client = '<article><small>stream · tested to 256 MiB</small></article>';
  const hydrated = '<article><small>stream<!-- --> · tested to<!-- --> <!-- -->256 MiB</small></article>';
  assert.equal(normalizeCatalogueCardHtml(hydrated), client);
  for (const change of ['<article title="changed"><small>stream · tested to 256 MiB</small></article>',
    client.replace("256", "128"), client.replace(" · ", "·"), client.replace("</small>", "<!--meaningful--></small>")])
    assert.notEqual(normalizeCatalogueCardHtml(change), client);
  assert.throws(() => normalizeCatalogueCardHtml("x".repeat(4097)));
});
test("private build preserves native cores/writer and truthfully labels changed catalogue JSX", async () => {
  const builder = makeBoundedCatalogueBuilder(await read("scripts/build-staged-handoff-candidate.mjs"), root);
  for (const token of ["makeBoundedCatalogueApp as makeStagedHandoffApp", "originalJsxAndControlsPreserved:false",
    "maximumMountedCatalogueCards:24", "4f2ef88023d984d79d2eb04bdaa8628fc48b71b927369c0c2b8f864b28ab49ab", "PublishedFormatsCatalogue.tsx"])
    assert.ok(builder.includes(token), token);
  await transform(builder, { loader: "js" });
});
test("qualification visits all routes before memory idle; retains exact6outputs/adverse/budget/source/cleanup gates", async () => {
  const old = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const driver = deriveBoundedCatalogueDriver(old.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", []);
  for (const token of ["minimumMs: 300000", "<=250", "successfulFixtureValidations,6", 'row.event==="reused").length,16',
    "qualifyCatalogueOnPage(page,root)", "originalJsxAndControlsPreserved,false", "requestedCompletedConversions:0"])
    assert.ok(driver.generated.includes(token), token);
  assert.ok(driver.generated.indexOf("qualifyCatalogueOnPage(page,root)") < driver.generated.indexOf('loadedIdle = await stable("loaded-idle")'));
  await transform(driver.generated, { loader: "js" });
  const caller = deriveBoundedCatalogueCaller(await read("scripts/run-updated-chrome-full.mjs"), root);
  for (const token of ['${stamp}-bounded-catalogue-control-live.json', '"scripts/build-bounded-catalogue.mjs",stamp,"--for-browser"', "await verifyStoppedTree()"])
    assert.ok(caller.generated.includes(token), token);
  await transform(caller.generated, { loader: "js" });
});

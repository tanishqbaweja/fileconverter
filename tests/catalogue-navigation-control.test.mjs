import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { deriveCatalogueNavigationDriver, deriveCatalogueNavigationCaller } from "../scripts/lib/catalogue-navigation-control.mjs";
const root = process.cwd();
test("UI-only diagnostic retains full production assets, baseline, entire tree and owned cleanup; never converts", async () => {
  const archive = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const result = deriveCatalogueNavigationDriver(archive.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", []);
  for (const token of ["minimumMs: 300000", "qualifyCatalogueOnPage(page,root)", "maximumMountedCatalogueCards,24", "requestedSmallCompletedConversions:0", "noForcedGc:true", "after-thirty-second-idle"])
    assert.ok(result.generated.includes(token), token);
  assert.equal(result.generated.split("qualifyCatalogueOnPage(page,root)").length, 3);
  assert.equal(result.generated.split("await catalogueAttribution.capture(").length, 6);
  assert.equal(result.generated.includes("completedSaveControl.run(page)"), false);
  assert.equal(result.generated.includes("completedSaveControl=await prepareCompletedSaveControl"), false);
  assert.ok(result.generated.includes("catalogueAttribution.close()"));
  await transform(result.generated, { loader: "js" });
});
test("caller reports diagnostic only and preserves frozen builder/source replay/birth-safe cleanup", async () => {
  const result = deriveCatalogueNavigationCaller(await readFile("scripts/run-updated-chrome-full.mjs", "utf8"), root);
  for (const token of ['${stamp}-catalogue-navigation-control-live.json', '"scripts/build-bounded-catalogue.mjs",stamp,"--for-browser"', "await verifyStoppedTree()", "checkpoints.length,5"])
    assert.ok(result.generated.includes(token), token);
  assert.equal(result.conversions, 0); assert.equal(result.mediaFixtures, 0); assert.equal(result.publicAcceptance, false);
  await transform(result.generated, { loader: "js" });
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { deriveCatalogueScrollDriver, deriveCatalogueScrollCaller, SCROLL_POLICY_CSS } from "../scripts/lib/catalogue-scroll-control.mjs";
const root = process.cwd();
test("same-pageABA changes only scroll animation, compares complete content/layout, restores default and never converts", async () => {
  const archive = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const result = deriveCatalogueScrollDriver(archive.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", []);
  assert.equal(SCROLL_POLICY_CSS, "html{scroll-behavior:auto}");
  for (const token of ['measureNavigation("default-before")', 'measureNavigation("auto")', 'measureNavigation("default-after")',
    "assert.deepEqual(await visibleLayout(),referenceLayout", "scrollStyle.evaluate(node=>node.remove())", "minimumMs: 300000", "requestedSmallCompletedConversions:0"])
    assert.ok(result.generated.includes(token), token);
  assert.equal(result.generated.split("await catalogueAttribution.capture(").length, 7);
  assert.equal(result.generated.includes("completedSaveControl.run(page)"), false);
  await transform(result.generated, { loader: "js" });
});
test("caller binds six snapshots/third complete catalogue proof and original cleanup/source replay", async () => {
  const result = deriveCatalogueScrollCaller(await readFile("scripts/run-updated-chrome-full.mjs", "utf8"), root);
  for (const token of ['${stamp}-catalogue-scroll-control-live.json', "checkpoints.length,6", "thirdCatalogueNavigation.routeCount,405", "await verifyStoppedTree()"])
    assert.ok(result.generated.includes(token), token);
  assert.equal(result.publicAcceptance, false); assert.equal(result.conversions, 0);
  await transform(result.generated, { loader: "js" });
});

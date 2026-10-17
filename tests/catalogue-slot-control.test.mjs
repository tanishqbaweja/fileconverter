import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { makeCatalogueSlotBuilder, deriveCatalogueSlotDriver, deriveCatalogueSlotCaller } from "../scripts/lib/catalogue-slot-control.mjs";
const root = process.cwd();
test("private module overlay loads exact stateless card change without editing original sources or workers", async () => {
  const result = makeCatalogueSlotBuilder(await readFile("scripts/build-staged-handoff-candidate.mjs", "utf8"), root);
  for (const token of ["slotRecipe=makeCatalogueSlotReuse(slotSource)", "Actual catalogue overlay loaded", "catalogueSlotsReused:true", "statelessCardsOnly:true",
    "cssRecipe, slotRecipe", "4f2ef88023d984d79d2eb04bdaa8628fc48b71b927369c0c2b8f864b28ab49ab"])
    assert.ok(result.includes(token), token);
  await transform(result, { loader: "js" });
});
test("real qualification keeps six genuine outputs, every fault/validator/all-process250MiB/lower blank and removes counter before conversion", async () => {
  const archive = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const result = deriveCatalogueSlotDriver(archive.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", []);
  for (const token of ["qualifySlotCatalogueOnPage as qualifyCatalogueOnPage", "minimumMs: 300000", "successfulFixtureValidations,6", 'row.event==="reused").length,16', "<=250", "catalogueSlotsReused,true"])
    assert.ok(result.generated.includes(token), token);
  await transform(result.generated, { loader: "js" });
  const caller = deriveCatalogueSlotCaller(await readFile("scripts/run-updated-chrome-full.mjs", "utf8"), root);
  for (const token of ['${stamp}-catalogue-slot-control-live.json', '"scripts/build-catalogue-slot.mjs",stamp,"--for-browser"', "await verifyStoppedTree()"])
    assert.ok(caller.generated.includes(token), token);
  await transform(caller.generated, { loader: "js" });
  const own = await readFile("scripts/lib/catalogue-slot-control.mjs", "utf8");
  assert.ok(own.includes("{ addedArticles: 24, removedArticles: 24 }"));
  assert.ok(own.includes("delete window.__WITHIN_SLOT_COUNTER__")); assert.ok(own.includes("finally {"));
});

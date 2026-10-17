import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeBoundedCatalogueBuilder, deriveBoundedCatalogueDriver, deriveBoundedCatalogueCaller, qualifyCatalogueOnPage } from "./bounded-catalogue-control.mjs";
const builderFiles = ["scripts/lib/catalogue-slot-control.mjs", "scripts/lib/catalogue-slot-reuse.mjs", "scripts/build-catalogue-slot.mjs",
  "scripts/qualify-catalogue-slot.mjs", "tests/catalogue-slot-control.test.mjs"];
const uiProof = "evidence/2026-10-17T18-20-55-174Z-catalogue-slot-ui.json.gz";
const files = [...builderFiles, "scripts/validate-catalogue-slot-reuse.mjs", "tests/catalogue-slot-reuse.test.mjs", uiProof];

export async function qualifySlotCatalogueOnPage(page, root) {
  const zipped = await readFile(path.join(root, uiProof)); assert.equal(sha(zipped), "f56a66bb24007e44ad12b7fa0f6d49bdeaa6532616000ad6474875803e8cced7");
  const raw = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(sha(raw), "080ea70e98995302a5ec08689cccd1bc144b3d5dc93becd1dd477692774cab33");
  const proof = JSON.parse(raw); assert.equal(proof.status, "passed-component-only-all-routes-exact-reused-slots");
  for (const [file, record] of Object.entries(proof.sources)) assert.equal(sha(await readFile(path.join(root, file))), record.sha256, file);
  for (const row of proof.cases) { assert.equal(row.slotMutations.addedArticles, 0); assert.equal(row.reusedArticleComparisons, 381); assert.equal(row.reusedChildComparisons, 1524); }
  await page.evaluate(() => {
    const counts = { addedArticles: 0, removedArticles: 0 };
    const consume = records => { for (const record of records) {
      for (const node of record.addedNodes) if (node.nodeType === 1 && node.tagName === "ARTICLE") counts.addedArticles++;
      for (const node of record.removedNodes) if (node.nodeType === 1 && node.tagName === "ARTICLE") counts.removedArticles++;
    } };
    const observer = new MutationObserver(consume); observer.observe(document.querySelector(".matrix"), { childList: true });
    window.__WITHIN_SLOT_COUNTER__ = { counts, observer, consume };
  });
  try {
    const result = await qualifyCatalogueOnPage(page, root);
    const counts = await page.evaluate(() => { const row = window.__WITHIN_SLOT_COUNTER__; row.consume(row.observer.takeRecords()); return row.counts; });
    // All24 additions must be the final reset after the independently checked empty search.
    // The21last-page nodes plus3partial-page removals account for all24 removals.
    assert.deepEqual(counts, { addedArticles: 24, removedArticles: 24 });
    return { ...result, slotReuse: { uiProof, counts, pageArticlesCreated: 0, constantCounterOnly: true, testCounterRemovedBeforeConversion: true } };
  } finally {
    await page.evaluate(() => { const row = window.__WITHIN_SLOT_COUNTER__; row?.observer.disconnect(); delete window.__WITHIN_SLOT_COUNTER__; });
  }
}

export function makeCatalogueSlotBuilder(source, root) {
  const parent = makeBoundedCatalogueBuilder(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  return exactPatch(parent, [
    ['const files = [', `import {makeCatalogueSlotReuse} from ${JSON.stringify(uri("catalogue-slot-reuse.mjs"))};
const slotFile="app/converter/PublishedFormatsCatalogue.tsx",slotSource=await readFile(path.join(root,slotFile),"utf8"),slotRecipe=makeCatalogueSlotReuse(slotSource);
overlays.set(path.join(root,slotFile).toLowerCase(),slotRecipe.generated);originals.set(slotFile,slotSource);
const files = [${builderFiles.map(JSON.stringify).join(",")},`],
    ['JSON.stringify({ sourcePins, preimages, appRecipe, workerRecipe, cssRecipe })', 'JSON.stringify({ sourcePins, preimages, appRecipe, workerRecipe, cssRecipe, slotRecipe })'],
    ['[[appFile, appRecipe.generated], [workerFile, workerRecipe.generated]]', '[[appFile, appRecipe.generated], [workerFile, workerRecipe.generated], [slotFile,slotRecipe.generated]]'],
    ['maximumMountedCatalogueCards:24,', 'maximumMountedCatalogueCards:24,catalogueSlotsReused:true,statelessCardsOnly:true,privateCatalogueEdits:slotRecipe.edits.length,'],
    ['  const assets = [];', '  assert.ok(loads.some(row=>path.resolve(row.id.split("?")[0]).toLowerCase()===path.join(root,slotFile).toLowerCase()),"Actual catalogue overlay loaded");\n  const assets = [];'],
  ]).generated;
}

export function deriveCatalogueSlotDriver(...args) {
  const parent = deriveBoundedCatalogueDriver(...args), root = args[1];
  return exactPatch(parent.generated, [
    [`import {qualifyCatalogueOnPage} from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/bounded-catalogue-control.mjs")).href)};`,
      `import {qualifySlotCatalogueOnPage as qualifyCatalogueOnPage} from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/catalogue-slot-control.mjs")).href)};`],
    ['assert.equal(compiledCacheBuild.maximumMountedCatalogueCards,24);', 'assert.equal(compiledCacheBuild.maximumMountedCatalogueCards,24);assert.equal(compiledCacheBuild.catalogueSlotsReused,true);assert.equal(compiledCacheBuild.statelessCardsOnly,true);'],
  ]);
}
export function deriveCatalogueSlotCaller(source, root) {
  const parent = deriveBoundedCatalogueCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const result = exactPatch(parent.generated, [
    [`import {deriveBoundedCatalogueDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("bounded-catalogue-control.mjs"))};`,
      `import {deriveCatalogueSlotDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("catalogue-slot-control.mjs"))};`],
    ['  const ownFiles=[', `  const ownFiles=[${files.map(JSON.stringify).join(",")},`],
    ['"scripts/build-bounded-catalogue.mjs",stamp,"--for-browser"', '"scripts/build-catalogue-slot.mjs",stamp,"--for-browser"'],
    ['assert.equal(build.maximumMountedCatalogueCards,24);', 'assert.equal(build.maximumMountedCatalogueCards,24);assert.equal(build.catalogueSlotsReused,true);assert.equal(build.statelessCardsOnly,true);'],
  ]);
  return { generated: result.generated.replaceAll('${stamp}-bounded-catalogue-control-', '${stamp}-catalogue-slot-control-')
    .replace('|bounded-catalogue-control|paint-boundary-control', '|bounded-catalogue-control|catalogue-slot-control|paint-boundary-control'), publicAcceptance: false };
}

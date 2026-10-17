import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { conversionProfiles } from "../../lib/capability-registry.ts";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { PAINT_BASE_CSS } from "./paint-boundary-candidate.mjs";
import { CATALOGUE_CSS } from "./bounded-catalogue-candidate.mjs";
import { makeMemoizedCacheBuilder, deriveMemoizedCacheDriver, deriveMemoizedCacheCaller } from "./memoized-cache-candidate.mjs";
import { normalizeCatalogueCardHtml } from "./catalogue-card-html.mjs";
export const CATALOGUE_UI_PROOF = "evidence/2026-10-17T17-22-49-473Z-bounded-catalogue-ui.json.gz";
const files = ["scripts/lib/bounded-catalogue-control.mjs", "scripts/lib/bounded-catalogue-candidate.mjs",
  "lib/published-catalogue.ts", "app/converter/PublishedFormatsCatalogue.tsx", "scripts/build-bounded-catalogue.mjs",
  "scripts/qualify-bounded-catalogue.mjs", "tests/bounded-catalogue.test.mjs", "tests/bounded-catalogue-control.test.mjs",
  "scripts/validate-bounded-catalogue.mjs", "scripts/lib/catalogue-card-html.mjs", CATALOGUE_UI_PROOF, "scripts/lib/paint-boundary-candidate.mjs"];

export async function qualifyCatalogueOnPage(page, root) {
  const zipped = await readFile(path.join(root, CATALOGUE_UI_PROOF));
  assert.equal(sha(zipped), "c42992db525dd3f79237de3814373507825f13fa3923c63cb88e15c5cd776805");
  const raw = gunzipSync(zipped, { maxOutputLength: 2097152 });
  assert.equal(sha(raw), "d9dc66bd206356156046234e804bd1e59d2a48cf987394d2316b59e0d6f20723");
  const proof = JSON.parse(raw); assert.equal(proof.status, "passed-component-only-all-routes-exact-bounded-dom");
  assert.deepEqual(proof.cleanupErrors, []);
  for (const [file, record] of Object.entries(proof.sources)) assert.equal(sha(await readFile(path.join(root, file))), record.sha256, file);
  const profiles = conversionProfiles.filter(profile => profile.public && profile.automatedTestStatus === "passed");
  const cards = [], ids = []; let pages = 0, maxMounted = 0;
  await page.getByRole("searchbox", { name: "Search supported formats" }).waitFor();
  while (true) {
    const rows = await page.locator(".matrix article").evaluateAll(nodes => nodes.map(node => {
      const copy = node.cloneNode(true); copy.removeAttribute("data-profile-id");
      return { id: node.dataset.profileId, html: copy.outerHTML };
    }));
    assert.ok(rows.length > 0 && rows.length <= 24); maxMounted = Math.max(maxMounted, rows.length);
    for (const row of rows) { ids.push(row.id); cards.push(normalizeCatalogueCardHtml(row.html)); }
    pages++; assert.ok(pages <= Math.ceil(profiles.length / 24));
    const next = page.getByRole("button", { name: "Next formats", exact: true });
    if (await next.isDisabled()) break;
    await next.click(); await page.getByRole("status").filter({ hasText: `Page ${pages + 1} of` }).waitFor();
  }
  assert.deepEqual(ids, profiles.map(profile => profile.id));
  assert.equal(sha(JSON.stringify(ids)), proof.registryIdsSha256);
  assert.equal(sha(JSON.stringify(cards)), proof.referenceCardsSha256);
  const search = page.getByRole("searchbox", { name: "Search supported formats" });
  await search.fill("NO_MATCH_音楽"); assert.equal(await page.locator(".matrix article").count(), 0);
  await search.fill(""); assert.equal(await page.locator(".matrix article").count(), 24);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  return { proof: CATALOGUE_UI_PROOF, pagesVisited: pages, routeCount: ids.length, maxMounted,
    finalMounted: 24, everyOriginalCardIdentical: true, everyRegistryIdAvailable: true,
    searchEmptyAndResetVerified: true, nativeChanged: false, conversionControlsChanged: false,
    emptyHydrationCommentsIgnored: true, otherHtmlNormalization: false,
    noForcedGc: true, memoryAcceptance: false, publicAcceptance: false };
}

export function makeBoundedCatalogueBuilder(source, root) {
  const parent = makeMemoizedCacheBuilder(source, root), uri = file => pathToFileURL(path.join(root, file)).href;
  return exactPatch(parent, [
    [`import { makeMemoizedCacheApp as makeStagedHandoffApp } from ${JSON.stringify(uri("scripts/lib/memoized-cache-candidate.mjs"))};`,
      `import { makeBoundedCatalogueApp as makeStagedHandoffApp } from ${JSON.stringify(uri("scripts/lib/bounded-catalogue-candidate.mjs"))};`],
    ['const files = [', `const files = [${files.map(JSON.stringify).join(",")},`],
    ['displayTreeMemoization:true,originalJsxAndControlsPreserved:true,',
      'displayTreeMemoization:true,originalJsxAndControlsPreserved:false,conversionControlsPreserved:true,catalogueCardsPreserved:true,maximumMountedCatalogueCards:24,'],
  ]).generated;
}

export function deriveBoundedCatalogueDriver(...args) {
  const parent = deriveMemoizedCacheDriver(...args), root = args[1];
  const match = parent.generated.match(/^const cssCandidate = \{ css: ("(?:\\.|[^"\\])*")/m); assert.ok(match);
  const beforeCss = JSON.parse(match[1]), css = beforeCss + CATALOGUE_CSS;
  const oldBinding = { url: "/assets/index-CxGQ2N3s.css", bytes: 26354, sha256: "3c4c62c528d98b5bd03492134f40bdca249e9c2896a5b607a63ca29ae46c34a6",
    afterBytes: 27940, afterSha256: "81862974af7b02ede01b5122b4a8bc372600fb6f528bd11fabee2687ea78e311", matrixCssBytes: 1586, matrixCssSha256: "37257965a98bdeede4bdcba5677e0f75f42431b7405530169fcfeb2ef106022a" };
  assert.equal(sha(PAINT_BASE_CSS + beforeCss), oldBinding.afterSha256);
  const binding = { ...oldBinding, afterBytes: Buffer.byteLength(PAINT_BASE_CSS + css), afterSha256: sha(PAINT_BASE_CSS + css),
    matrixCssBytes: Buffer.byteLength(css), matrixCssSha256: sha(css) };
  const marker = `const root = ${JSON.stringify(root)}, MiB = 1024 ** 2;`;
  return exactPatch(parent.generated, [
    [marker, `import {qualifyCatalogueOnPage} from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/bounded-catalogue-control.mjs")).href)};\n` + marker],
    ['assert.equal(compiledCacheBuild.originalJsxAndControlsPreserved,true);',
      'assert.equal(compiledCacheBuild.originalJsxAndControlsPreserved,false);assert.equal(compiledCacheBuild.conversionControlsPreserved,true);assert.equal(compiledCacheBuild.catalogueCardsPreserved,true);assert.equal(compiledCacheBuild.maximumMountedCatalogueCards,24);'],
    [match[0], 'const cssCandidate = { css: ' + JSON.stringify(css)],
    [JSON.stringify(oldBinding), JSON.stringify(binding)],
    ['  loadedIdle = await stable("loaded-idle");', '  progressProbe.boundedCatalogue=await qualifyCatalogueOnPage(page,root);\n  loadedIdle = await stable("loaded-idle");'],
  ]);
}

export function deriveBoundedCatalogueCaller(source, root) {
  const parent = deriveMemoizedCacheCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const result = exactPatch(parent.generated, [
    [`import {deriveMemoizedCacheDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("memoized-cache-candidate.mjs"))};`,
      `import {deriveBoundedCatalogueDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("bounded-catalogue-control.mjs"))};`],
    ['  const ownFiles=[', `  const ownFiles=[${files.map(JSON.stringify).join(",")},`],
    ['"scripts/build-memoized-cache.mjs",stamp,"--for-browser"', '"scripts/build-bounded-catalogue.mjs",stamp,"--for-browser"'],
    ['assert.equal(build.originalJsxAndControlsPreserved,true);',
      'assert.equal(build.originalJsxAndControlsPreserved,false);assert.equal(build.conversionControlsPreserved,true);assert.equal(build.catalogueCardsPreserved,true);assert.equal(build.maximumMountedCatalogueCards,24);'],
  ]);
  return { generated: result.generated.replaceAll('${stamp}-memoized-cache-control-', '${stamp}-bounded-catalogue-control-')
    .replace('|memoized-cache-control|paint-boundary-control', '|memoized-cache-control|bounded-catalogue-control|paint-boundary-control'), publicAcceptance: false };
}

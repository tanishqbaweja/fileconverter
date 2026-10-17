import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { deriveCatalogueNavigationDriver, deriveCatalogueNavigationCaller } from "./catalogue-navigation-control.mjs";
const files = ["scripts/lib/catalogue-scroll-control.mjs", "scripts/diagnose-catalogue-scroll.mjs", "tests/catalogue-scroll-control.test.mjs"];
export const SCROLL_POLICY_CSS = "html{scroll-behavior:auto}";
export function deriveCatalogueScrollDriver(...args) {
  const parent = deriveCatalogueNavigationDriver(...args);
  return exactPatch(parent.generated, [
    ['  loadedIdle=await stable("loaded-before-catalogue");', `  progressProbe.navigationTimings=[];
  const measureNavigation=async(mode)=>{const started=performance.now();const result=await qualifyCatalogueOnPage(page,root);
    progressProbe.navigationTimings.push({mode,elapsedMs:performance.now()-started});return result;};
  const visibleLayout=()=>page.evaluate(()=>({text:document.querySelector("main").textContent,
    boxes:[...document.querySelectorAll("main,main *")].map(node=>{const r=node.getBoundingClientRect();return [node.tagName,r.x,r.y,r.width,r.height];})}));
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),"smooth");
  loadedIdle=await stable("loaded-before-catalogue");`],
    ['progressProbe.boundedCatalogue=await qualifyCatalogueOnPage(page,root);', 'progressProbe.boundedCatalogue=await measureNavigation("default-before");'],
    ['  observer.setPhase("catalogue-second-navigation");', `  const referenceLayout=await visibleLayout();
  const scrollStyle=await page.addStyleTag({content:${JSON.stringify(SCROLL_POLICY_CSS)}});
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),"auto");
  observer.setPhase("catalogue-second-navigation");`],
    ['progressProbe.secondCatalogueNavigation=await qualifyCatalogueOnPage(page,root);', 'progressProbe.secondCatalogueNavigation=await measureNavigation("auto");'],
    ['  await catalogueAttribution.capture("after-thirty-second-idle");', `  await catalogueAttribution.capture("after-thirty-second-idle");
  assert.deepEqual(await visibleLayout(),referenceLayout,"Changing only scroll animation preserves every visible text and box");
  await scrollStyle.evaluate(node=>node.remove());
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),"smooth");
  observer.setPhase("catalogue-restored-navigation");
  progressProbe.thirdCatalogueNavigation=await measureNavigation("default-after");
  await takeSample("catalogue-restored-navigation");
  await catalogueAttribution.capture("after-restored-default-navigation");
  progressProbe.scrollPolicyComparison={css:${JSON.stringify(SCROLL_POLICY_CSS)},order:["smooth","auto","smooth"],
    samePage:true,referenceLayoutPreserved:true,defaultRestored:true,engineChanges:false,acceptance:false};`],
    ['"catalogue-navigation-allocation-diagnostic-not-acceptance"', '"catalogue-scroll-policy-aba-diagnostic-not-acceptance"'],
    ['"failed-catalogue-navigation-diagnostic"', '"failed-catalogue-scroll-policy-diagnostic"'],
    [parent.generated.match(/scope: "UI-only diagnostic[^\r\n]+/)[0],
      'scope: "UI-only same-page smooth/auto/smooth scroll-policy comparison. Three complete405-route traversals; six bounded light allocation snapshots; exact text/geometry and default restoration. No media fixtures/conversions/forced GC/browser flag changes or public/memory/speed acceptance. Tracing perturbs memory; all Chromium descendants retained.",'],
  ]);
}
export function deriveCatalogueScrollCaller(source, root) {
  const parent = deriveCatalogueNavigationCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const recipe = exactPatch(parent.generated, [
    [`import {deriveCatalogueNavigationDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("catalogue-navigation-control.mjs"))};`,
      `import {deriveCatalogueScrollDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("catalogue-scroll-control.mjs"))};`],
    ['  const ownFiles=[', `  const ownFiles=[${files.map(JSON.stringify).join(",")},`],
    ['assert.equal(row.status,"catalogue-navigation-allocation-diagnostic-not-acceptance");', 'assert.equal(row.status,"catalogue-scroll-policy-aba-diagnostic-not-acceptance");'],
    ['assert.equal(row.progressProbe.catalogueAttribution.checkpoints.length,5);', 'assert.equal(row.progressProbe.catalogueAttribution.checkpoints.length,6);assert.equal(row.progressProbe.thirdCatalogueNavigation.routeCount,405);assert.equal(row.progressProbe.scrollPolicyComparison.defaultRestored,true);'],
    ['"catalogue-navigation-diagnostic-finished-pending-audit-not-acceptance"', '"catalogue-scroll-diagnostic-finished-pending-audit-not-acceptance"'],
  ]);
  return { generated: recipe.generated.replaceAll('${stamp}-catalogue-navigation-control-', '${stamp}-catalogue-scroll-control-')
    .replace('|catalogue-navigation-control|paint-boundary-control', '|catalogue-navigation-control|catalogue-scroll-control|paint-boundary-control'),
    conversions: 0, publicAcceptance: false };
}

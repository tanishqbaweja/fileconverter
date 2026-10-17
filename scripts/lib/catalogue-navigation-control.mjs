import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { deriveBoundedCatalogueDriver, deriveBoundedCatalogueCaller } from "./bounded-catalogue-control.mjs";
const files = ["scripts/lib/catalogue-navigation-control.mjs", "scripts/diagnose-catalogue-navigation.mjs",
  "tests/catalogue-navigation-control.test.mjs", "scripts/lib/lifecycle-allocation-attribution.mjs",
  "scripts/lib/lifecycle-allocation-observation.mjs"];

export function deriveCatalogueNavigationDriver(...args) {
  const parent = deriveBoundedCatalogueDriver(...args), root = args[1];
  const uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const begin = parent.generated.indexOf("  progressProbe.boundedCatalogue=await qualifyCatalogueOnPage(page,root);");
  const end = parent.generated.indexOf("  assert.deepEqual(forbiddenRequests, []);", begin);
  assert.ok(begin > 0 && end > begin);
  const removedConversionBlock = parent.generated.slice(begin, end);
  assert.ok(removedConversionBlock.includes("completedSaveControl.run(page)"));
  const navigation = `  loadedIdle=await stable("loaded-before-catalogue");
  catalogueAttribution=createLifecycleAttribution({root,reportBase,createSession:()=>browser.newBrowserCDPSession(),
    getProcesses:async()=>{await observer.through(Date.now());return (await sampleChromiumTree(chrome.pid)).processes;},
    getRealms:()=>realms.sample(),getState:()=>page.evaluate(()=>{
      const app=window.__WITHIN_TEST__?.getState();return {jobState:app?.jobState,workerStatus:app?.workerStatus,
        metrics:app?.metrics??null,cards:document.querySelectorAll(".matrix article").length,
        elements:document.getElementsByTagName("*").length,scrollY,innerWidth,innerHeight};})});
  await catalogueAttribution.capture("loaded-before-navigation");
  observer.setPhase("catalogue-first-navigation");
  progressProbe.boundedCatalogue=await qualifyCatalogueOnPage(page,root);
  await takeSample("catalogue-first-navigation");
  await catalogueAttribution.capture("after-first-navigation");
  progressProbe.afterNavigationIdle=await stable("catalogue-after-first-idle");
  await catalogueAttribution.capture("after-first-idle");
  observer.setPhase("catalogue-second-navigation");
  progressProbe.secondCatalogueNavigation=await qualifyCatalogueOnPage(page,root);
  await takeSample("catalogue-second-navigation");
  await catalogueAttribution.capture("after-second-navigation");
  observer.setPhase("catalogue-observation-idle");
  const observationStarted=Date.now();
  while(Date.now()-observationStarted<30000){await takeSample("catalogue-observation-idle");await delay(1000);}
  progressProbe.navigationObservationMs=Date.now()-observationStarted;
  await catalogueAttribution.capture("after-thirty-second-idle");
  assert.equal(progressProbe.compiledCacheEvents.length,0,"No media engines compiled or converted");
  progressProbe.successfulSaveControl={scope:"no-media-conversion-or-fixtures",successfulFixtureValidations:0,rows:[]};
`;
  return exactPatch(parent.generated, [
    ['let completedSaveControl=null;', `let completedSaveControl=null;\nimport {createLifecycleAttribution} from ${JSON.stringify(uri("lifecycle-allocation-attribution.mjs"))};\nlet catalogueAttribution=null;`],
    ['  completedSaveControl=await prepareCompletedSaveControl(root,reportBase);', '  // UI-only attribution: no media fixture generation or conversion control.'],
    [removedConversionBlock, navigation],
    ['    if (observer) nativeFailureCapture = await observer.finishCapture();',
      '    if(catalogueAttribution)progressProbe.catalogueAttribution=await catalogueAttribution.close();\n    if (observer) nativeFailureCapture = await observer.finishCapture();'],
    ['"six-small-warm-cache-outputs-and-adverse-recovery-not-full-acceptance"', '"catalogue-navigation-allocation-diagnostic-not-acceptance"'],
    ['"failed-original-startup-diagnostic"', '"failed-catalogue-navigation-diagnostic"'],
    ['requestedSmallCompletedConversions:6', 'requestedSmallCompletedConversions:0'],
    [parent.generated.match(/scope: "Six fully independently validated[^\r\n]+/)[0],
      'scope: "UI-only diagnostic on exact private production assets: two complete405-route catalogue navigations, five bounded light allocation snapshots and30second idle. No files selected, media fixtures, conversion, forced GC, changed browser flags or memory acceptance. All Chromium descendants retained; baseline policy unchanged; diagnostic tracing perturbs memory.",'],
  ]);
}

export function deriveCatalogueNavigationCaller(source, root) {
  const parent = deriveBoundedCatalogueCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const result = exactPatch(parent.generated, [
    [`import {deriveBoundedCatalogueDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("bounded-catalogue-control.mjs"))};`,
      `import {deriveCatalogueNavigationDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("catalogue-navigation-control.mjs"))};`],
    ['  const ownFiles=[', `  const ownFiles=[${files.map(JSON.stringify).join(",")},`],
    ['assert.equal(row.status,"six-small-warm-cache-outputs-and-adverse-recovery-not-full-acceptance");assert.equal(row.progressProbe.successfulSaveControl.successfulFixtureValidations,6);',
      'assert.equal(row.status,"catalogue-navigation-allocation-diagnostic-not-acceptance");assert.equal(row.progressProbe.successfulSaveControl.successfulFixtureValidations,0);assert.equal(row.progressProbe.boundedCatalogue.routeCount,405);assert.equal(row.progressProbe.secondCatalogueNavigation.routeCount,405);assert.equal(row.progressProbe.catalogueAttribution.checkpoints.length,5);'],
    ['"warm-cache-small-output-controls-finished-pending-audit-not-acceptance"', '"catalogue-navigation-diagnostic-finished-pending-audit-not-acceptance"'],
  ]);
  return { generated: result.generated.replaceAll('${stamp}-bounded-catalogue-control-', '${stamp}-catalogue-navigation-control-')
    .replace('|bounded-catalogue-control|paint-boundary-control', '|bounded-catalogue-control|catalogue-navigation-control|paint-boundary-control'),
    conversions: 0, mediaFixtures: 0, perturbsMemory: true, publicAcceptance: false };
}

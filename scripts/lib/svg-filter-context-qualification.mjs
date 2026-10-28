// Retain every original quality/memory gate; verify both native source patches.
import assert from "node:assert/strict";
import { makeFilterRegionSvgQualification } from "./svg-filter-region-qualification.mjs";
import { renderContextPatch } from "../../images/resvg-source/render-context-patch.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact context qualifier anchor: "+before);return source.split(before).join(after);};
export function makeFilterContextSvgQualification(options){
  const base=makeFilterRegionSvgQualification(options);
  const suite=replace(base.suite,"images/resvg-source/filter-region-processed-input.json","images/resvg-source/filter-context-processed-input.json");
  let driver=replace(base.driver,JSON.stringify(sha(base.suite)),JSON.stringify(sha(suite)));
  driver=replace(driver,"images/resvg-source/filter-region-processed-input.json","images/resvg-source/filter-context-processed-input.json",2);
  driver=replace(driver,"images/resvg-source/filter-region-raw-input.json","images/resvg-source/filter-context-raw-input.json",2);
  driver=replace(driver,"two-pinned-filter-source-postprocessing-passes-byte-identical-not-browser-acceptance","two-pinned-context-source-postprocessing-passes-byte-identical-not-browser-acceptance");
  driver=replace(driver,'  assert.equal(receipt.sourceAllocationExtentChanged, true);',
    '  assert.equal(receipt.sourceAllocationExtentChanged, true);\n'+
    '  assert.equal(receipt.sourceContextCoordinatesChanged, true);\n'+
    '  assert.equal(receipt.renderContextPatch.patchedSha256, '+JSON.stringify(renderContextPatch.patchedSha256)+');\n'+
    '  assert.equal(pins.renderContextPatchedSha256, receipt.renderContextPatch.patchedSha256);');
  driver=replace(driver,'"images/resvg-source/filter-region-patch.mjs"];',
    '"images/resvg-source/filter-region-patch.mjs", "scripts/lib/svg-filter-context-qualification.mjs", "images/resvg-source/render-context-patch.mjs"];');
  driver=replace(driver,"report.sourceFilterRegionCandidate = true;","report.sourceFilterRegionCandidate = true;\nreport.sourceRenderContextCandidate = true;");
  return{...base,driver,suite,proof:{...base.proof,driverSha256:sha(driver),suiteSha256:sha(suite),
    sourceRenderContextCandidate:true,renderContextPatch,allExistingFidelityMemoryPrivacyCleanupAssertionsRetained:true,publicPromotion:false}};
}

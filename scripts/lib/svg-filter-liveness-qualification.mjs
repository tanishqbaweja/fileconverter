// Same production worker/IO and original gates, new independently built native bytes.
import assert from "node:assert/strict";
import { makeFilterContextSvgQualification } from "./svg-filter-context-qualification.mjs";
import { filterLivenessPatch } from "../../images/resvg-source/filter-liveness-patch.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact lifetime qualifier anchor");return source.split(before).join(after);};
export function makeFilterLivenessSvgQualification(options){
  const base=makeFilterContextSvgQualification(options);
  const suite=replace(base.suite,"images/resvg-source/filter-context-processed-input.json","images/resvg-source/filter-liveness-processed-input.json");
  let driver=replace(base.driver,JSON.stringify(sha(base.suite)),JSON.stringify(sha(suite)));
  driver=replace(driver,"images/resvg-source/filter-context-processed-input.json","images/resvg-source/filter-liveness-processed-input.json",2);
  driver=replace(driver,"images/resvg-source/filter-context-raw-input.json","images/resvg-source/filter-liveness-raw-input.json",2);
  driver=replace(driver,"two-pinned-context-source-postprocessing-passes-byte-identical-not-browser-acceptance","two-pinned-liveness-source-postprocessing-passes-byte-identical-not-browser-acceptance");
  driver=replace(driver,'  assert.equal(receipt.sourceContextCoordinatesChanged, true);',
    '  assert.equal(receipt.sourceContextCoordinatesChanged, true);\n'+
    '  assert.equal(receipt.sourceIntermediateLifetimesChanged, true);\n'+
    '  assert.equal(receipt.filterLivenessPatch.patchedSha256, '+JSON.stringify(filterLivenessPatch.patchedSha256)+');\n'+
    '  assert.equal(pins.filterLivenessPatchedSha256, receipt.filterLivenessPatch.patchedSha256);');
  driver=replace(driver,'"images/resvg-source/render-context-patch.mjs"];',
    '"images/resvg-source/render-context-patch.mjs", "images/resvg-source/filter-liveness-patch.mjs", "scripts/lib/svg-filter-liveness-qualification.mjs"];');
  driver=replace(driver,"report.sourceRenderContextCandidate = true;","report.sourceRenderContextCandidate = true;\nreport.sourceFilterLivenessCandidate = true;");
  return{...base,driver,suite,proof:{...base.proof,driverSha256:sha(driver),suiteSha256:sha(suite),
    sourceFilterLivenessCandidate:true,filterLivenessPatch,allExistingFidelityMemoryPrivacyCleanupAssertionsRetained:true,publicPromotion:false}};
}

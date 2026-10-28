// Future stage only: requires a separately verified exact lifetime-source pin.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeContextPostprocessRecipe } from "./context-postprocess-recipe.mjs";
import { filterLivenessPatch } from "./filter-liveness-patch.mjs";
import { sha } from "./source-pins.mjs";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact lifetime postprocessing anchor");return source.split(before).join(after);};
export function makeLivenessPostprocessRecipe(options){
  const base=makeContextPostprocessRecipe(options);
  let source=replace(base.source,"images/resvg-source/filter-context-raw-input.json","images/resvg-source/filter-liveness-raw-input.json",2);
  source=replace(source,"two-fresh-private-filter-context-source-builds-byte-identical-not-browser-acceptance","two-fresh-private-filter-liveness-source-builds-byte-identical-not-browser-acceptance");
  source=replace(source,"two-fresh-filter-context-source-builds-verified-not-browser-acceptance","two-fresh-filter-liveness-source-builds-verified-not-browser-acceptance");
  source=replace(source,'  report.filterRegionPatch = filterRegionPatch;',
    '  assert.equal(sourceRepeat.filterLivenessPatch.patchedSha256, filterLivenessPatch.patchedSha256);\n'+
    '  assert.equal(inputPin.filterLivenessPatchedSha256, filterLivenessPatch.patchedSha256);\n'+
    '  report.filterLivenessPatch = filterLivenessPatch; report.sourceIntermediateLifetimesChanged = true;\n  report.filterRegionPatch = filterRegionPatch;');
  source=replace(source,'    assert.equal(receipt.renderContextPatch.patchedSha256, renderContextPatch.patchedSha256);',
    '    assert.equal(receipt.filterLivenessPatch.patchedSha256, filterLivenessPatch.patchedSha256);\n'+
    '    assert.equal(receipt.filterLivenessPatch.onlyOwnedFreshDependencyCheckoutChanged, true);\n'+
    '    assert.equal(receipt.renderContextPatch.patchedSha256, renderContextPatch.patchedSha256);');
  source=replace(source,'const sources = [','const sources = ["images/resvg-source/liveness-postprocess-recipe.mjs", "images/resvg-source/filter-liveness-patch.mjs", ');
  source=`import {filterLivenessPatch} from ${JSON.stringify(pathToFileURL(path.join(options.root,"images/resvg-source/filter-liveness-patch.mjs")).href)};\n`+source;
  return{source,proof:{...base.proof,generatedSha256:sha(source),exactFutureInputPin:"images/resvg-source/filter-liveness-raw-input.json",
    filterLivenessPatch,allThreeSourcePatchesRequired:true,maximumBytesChanged:false,publicPromotion:false}};
}

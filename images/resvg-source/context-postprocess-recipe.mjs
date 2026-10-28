import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeFilterPostprocessRecipe } from "./filter-postprocess-recipe.mjs";
import { renderContextPatch } from "./render-context-patch.mjs";
import { sha } from "./source-pins.mjs";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact context postprocessing anchor: "+before);return source.split(before).join(after);};
export function makeContextPostprocessRecipe(options){
  const base=makeFilterPostprocessRecipe(options);
  let source=replace(base.source,"images/resvg-source/filter-region-raw-input.json","images/resvg-source/filter-context-raw-input.json",2);
  source=replace(source,'"two-fresh-private-filter-region-source-builds-byte-identical-not-browser-acceptance"','"two-fresh-private-filter-context-source-builds-byte-identical-not-browser-acceptance"');
  source=replace(source,'"two-fresh-filter-region-source-builds-verified-not-browser-acceptance"','"two-fresh-filter-context-source-builds-verified-not-browser-acceptance"');
  source=replace(source,'  report.filterRegionPatch = filterRegionPatch;',
    '  assert.equal(sourceRepeat.renderContextPatch.patchedSha256, renderContextPatch.patchedSha256);\n'+
    '  report.renderContextPatch = renderContextPatch; report.sourceContextCoordinatesChanged = true;\n  report.filterRegionPatch = filterRegionPatch;');
  source=replace(source,'    assert.equal(receipt.filterRegionPatch.originalSha256, filterRegionPatch.originalSha256);',
    '    assert.equal(receipt.renderContextPatch.patchedSha256, renderContextPatch.patchedSha256);\n'+
    '    assert.equal(receipt.renderContextPatch.onlyOwnedFreshDependencyCheckoutChanged, true);\n'+
    '    assert.equal(receipt.filterRegionPatch.originalSha256, filterRegionPatch.originalSha256);');
  source=replace(source,'const sources = [','const sources = ["images/resvg-source/context-postprocess-recipe.mjs", "images/resvg-source/render-context-patch.mjs", ".github/workflows/svg-context-postprocess.yml", ');
  source=`import {renderContextPatch} from ${JSON.stringify(pathToFileURL(path.join(options.root,"images/resvg-source/render-context-patch.mjs")).href)};\n`+source;
  return{source,proof:{...base.proof,generatedSha256:sha(source),exactFutureInputPin:"images/resvg-source/filter-context-raw-input.json",
    renderContextPatch,bothSourcePatchesRequired:true,maximumBytesChanged:false,publicPromotion:false}};
}

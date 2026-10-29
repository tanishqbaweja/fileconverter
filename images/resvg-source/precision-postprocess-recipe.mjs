// Future stage fails closed until the authenticated exact precision-source pin exists.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeLivenessPostprocessRecipe } from "./liveness-postprocess-recipe.mjs";
import { filterPrecisionPatch } from "./filter-precision-patch.mjs";
import { sha } from "./source-pins.mjs";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact precision postprocessing anchor");return source.split(before).join(after);};
export function makePrecisionPostprocessRecipe(options){
  const base=makeLivenessPostprocessRecipe(options);
  let source=replace(base.source,"images/resvg-source/filter-liveness-raw-input.json","images/resvg-source/filter-precision-raw-input.json",2);
  source=replace(source,"two-fresh-private-filter-liveness-source-builds-byte-identical-not-browser-acceptance","two-fresh-private-filter-precision-source-builds-byte-identical-not-browser-acceptance");
  source=replace(source,"two-fresh-filter-liveness-source-builds-verified-not-browser-acceptance","two-fresh-filter-precision-source-builds-verified-not-browser-acceptance");
  source=replace(source,'  report.filterRegionPatch = filterRegionPatch;',
    '  assert.equal(sourceRepeat.filterPrecisionPatch.patchedSha256, filterPrecisionPatch.patchedSha256);\n'+
    '  assert.equal(inputPin.filterPrecisionPatchedSha256, filterPrecisionPatch.patchedSha256);\n'+
    '  assert.equal(inputPin.filterPrecisionKernelSha256, filterPrecisionPatch.kernelSha256);\n'+
    '  report.filterPrecisionPatch=filterPrecisionPatch;report.sourceFinalMergePrecisionChanged=true;\n'+
    '  report.filterRegionPatch = filterRegionPatch;');
  source=replace(source,'    assert.equal(receipt.filterLivenessPatch.patchedSha256, filterLivenessPatch.patchedSha256);',
    '    assert.equal(receipt.filterPrecisionPatch.patchedSha256, filterPrecisionPatch.patchedSha256);\n'+
    '    assert.equal(receipt.filterPrecisionPatch.onlyOwnedFreshDependencyCheckoutChanged,true);\n'+
    '    assert.equal(receipt.filterPrecisionPatch.kernelSha256,filterPrecisionPatch.kernelSha256);\n'+
    '    assert.equal(receipt.filterPrecisionKernelTests.passed,4);\n'+
    '    assert.equal(receipt.filterPrecisionKernelTests.compiler,compileContract.rustcVersion);\n'+
    '    assert.equal(receipt.filterPrecisionKernelTests.kernelSha256,filterPrecisionPatch.kernelSha256);\n'+
    '    assert.equal(receipt.filterLivenessPatch.patchedSha256, filterLivenessPatch.patchedSha256);');
  source=replace(source,'const sources = [','const sources = ["images/resvg-source/precision-postprocess-recipe.mjs", "images/resvg-source/filter-precision-patch.mjs", "images/resvg-source/filter-precision-kernel.rs", ');
  source=`import {filterPrecisionPatch} from ${JSON.stringify(pathToFileURL(path.join(options.root,"images/resvg-source/filter-precision-patch.mjs")).href)};\n`+source;
  return {source,proof:{...base.proof,generatedSha256:sha(source),exactFutureInputPin:"images/resvg-source/filter-precision-raw-input.json",
    filterPrecisionPatch,allFourSourcePatchesAndPinnedNumericTestsRequired:true,maximumBytesChanged:false,
    publicPromotion:false,processingPerformedByRecipeGenerator:false}};
}

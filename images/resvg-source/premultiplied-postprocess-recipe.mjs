// Future stage only; exact authenticated raw pin must exist before processing.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeLivenessPostprocessRecipe } from "./liveness-postprocess-recipe.mjs";
import { premultipliedTransferPatch } from "./premultiplied-transfer-patch.mjs";
import { sha } from "./source-pins.mjs";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact premultiplied postprocess anchor");return source.split(before).join(after);};
export function makePremultipliedPostprocessRecipe(options){
  const base=makeLivenessPostprocessRecipe(options);
  let source=replace(base.source,"images/resvg-source/filter-liveness-raw-input.json","images/resvg-source/filter-premultiplied-raw-input.json",2);
  source=replace(source,"two-fresh-private-filter-liveness-source-builds-byte-identical-not-browser-acceptance","two-fresh-private-filter-premultiplied-source-builds-byte-identical-not-browser-acceptance");
  source=replace(source,"two-fresh-filter-liveness-source-builds-verified-not-browser-acceptance","two-fresh-filter-premultiplied-source-builds-verified-not-browser-acceptance");
  source=replace(source,'  report.filterRegionPatch = filterRegionPatch;',
    '  assert.equal(sourceRepeat.premultipliedTransferPatch.patchedSha256,premultipliedTransferPatch.patchedSha256);\n'+
    '  assert.equal(inputPin.premultipliedTransferPatchedSha256,premultipliedTransferPatch.patchedSha256);\n'+
    '  assert.equal(inputPin.premultipliedKernelSha256,premultipliedTransferPatch.kernelSha256);\n'+
    '  report.premultipliedTransferPatch=premultipliedTransferPatch;report.sourcePremultipliedTransferChanged=true;\n'+
    '  report.filterRegionPatch = filterRegionPatch;');
  source=replace(source,'    assert.equal(receipt.filterLivenessPatch.patchedSha256, filterLivenessPatch.patchedSha256);',
    '    assert.equal(receipt.premultipliedTransferPatch.patchedSha256,premultipliedTransferPatch.patchedSha256);\n'+
    '    assert.equal(receipt.premultipliedTransferPatch.onlyOwnedFreshDependencyCheckoutChanged,true);\n'+
    '    assert.equal(receipt.premultipliedTransferPatch.kernelSha256,premultipliedTransferPatch.kernelSha256);\n'+
    '    assert.equal(receipt.premultipliedTransferPatch.fullViewportFloatAccumulatorIntroduced,false);\n'+
    '    assert.equal(receipt.premultipliedKernelTests.passed,4);\n'+
    '    assert.equal(receipt.premultipliedKernelTests.compiler,compileContract.rustcVersion);\n'+
    '    assert.equal(receipt.premultipliedKernelTests.kernelSha256,premultipliedTransferPatch.kernelSha256);\n'+
    '    assert.equal(receipt.filterLivenessPatch.patchedSha256, filterLivenessPatch.patchedSha256);');
  source=replace(source,'const sources = [','const sources = ["images/resvg-source/premultiplied-postprocess-recipe.mjs", "images/resvg-source/premultiplied-transfer-patch.mjs", "images/resvg-source/premultiplied-transfer-kernel.rs", ');
  source=`import {premultipliedTransferPatch} from ${JSON.stringify(pathToFileURL(path.join(options.root,"images/resvg-source/premultiplied-transfer-patch.mjs")).href)};\n`+source;
  return {source,proof:{...base.proof,generatedSha256:sha(source),exactFutureInputPin:"images/resvg-source/filter-premultiplied-raw-input.json",
    premultipliedTransferPatch,allFourSourcePatchesAndPinnedNumericTestsRequired:true,
    maximumBytesChanged:false,publicPromotion:false,processingPerformedByRecipeGenerator:false}};
}

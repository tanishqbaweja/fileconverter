// Prepares a distinct future filter candidate; never rewrites historical pins.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./source-pins.mjs";
export const filterPostprocessBaseSha256="70c18a945dcc07b7c98a0c1ab13dbefa46bc22ab4a0e973e43b5f3803a807188";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact filter postprocess anchor: "+before);return source.split(before).join(after);};
export function makeFilterPostprocessRecipe({root,sourceBytes}){
  assert.equal(root,path.resolve(import.meta.dirname,"../.."));assert.equal(sha(sourceBytes),filterPostprocessBaseSha256);
  let source=sourceBytes.toString();
  source=replace(source,'path.resolve(import.meta.dirname, "../..")',JSON.stringify(root));
  source=replace(source,"images/resvg-source/remapped-raw-input.json","images/resvg-source/filter-region-raw-input.json",2);
  source=replace(source,'const sources = ["images/resvg-source/postprocess-repeated-source.mjs",',
    'const sources = ["images/resvg-source/filter-postprocess-recipe.mjs", "images/resvg-source/postprocess-filter-region-source.mjs", "images/resvg-source/filter-region-patch.mjs", ".github/workflows/svg-source-filter-postprocess.yml", "images/resvg-source/postprocess-repeated-source.mjs",');
  source=replace(source,'  const sourceRepeat = JSON.parse(members.get(inputPin.summaryMember));',
    '  const sourceRepeat = JSON.parse(members.get(inputPin.summaryMember));\n'+
    '  assert.equal(sourceRepeat.status, "two-fresh-private-filter-region-source-builds-byte-identical-not-browser-acceptance");\n'+
    '  assert.equal(sourceRepeat.filterRegionPatch.patchedSha256, filterRegionPatch.patchedSha256);\n'+
    '  const owner = JSON.parse(members.get(inputPin.ownerReceiptMember));\n'+
    '  assert.equal(owner.status, "two-fresh-filter-region-source-builds-verified-not-browser-acceptance");\n'+
    '  assert.equal(owner.rawByteEquality, true); assert.equal(owner.ownedOwnerScratchRemoved, true);\n'+
    '  assert.equal(owner.rawRepeatReceipt.sha256, sha(members.get(inputPin.summaryMember)));\n'+
    '  assert.deepEqual(owner.failures, []);\n'+
    '  report.filterRegionPatch = filterRegionPatch; report.sourceAllocationExtentChanged = true; report.renderingFidelityUnverified = true;');
  source=replace(source,'    assert.equal(receipt.rustcVersion, compileContract.rustcVersion);',
    '    assert.equal(receipt.filterRegionPatch.originalSha256, filterRegionPatch.originalSha256);\n'+
    '    assert.equal(receipt.filterRegionPatch.patchedSha256, filterRegionPatch.patchedSha256);\n'+
    '    assert.equal(receipt.filterRegionPatch.onlyOwnedFreshDependencyCheckoutChanged, true);\n'+
    '    assert.equal(receipt.rustcVersion, compileContract.rustcVersion);');
  source=source.replace(/((?:from\s+|import\s*)["'])(\.\.?\/[^"']+)(["'])/g,(_all,start,name,end)=>{
    const file=path.resolve(root,"images/resvg-source",name);assert.ok(file.startsWith(root+path.sep));return start+pathToFileURL(file).href+end;
  });
  source=`import {filterRegionPatch} from ${JSON.stringify(pathToFileURL(path.join(root,"images/resvg-source/filter-region-patch.mjs")).href)};\n`+source;
  return{source,proof:{originalPostprocessorSha256:filterPostprocessBaseSha256,generatedSha256:sha(source),
    exactFutureInputPin:"images/resvg-source/filter-region-raw-input.json",oldInputPinsOrPostprocessorEdited:false,
    sourceOwnerAndBothCompilePatchReceiptsRequired:true,fullProcessedAndGlueByteEqualityRequired:true,
    maximumBytesChanged:false,publicPromotion:false,processingPerformedByRecipeGenerator:false}};
}

// New private stage; historical postprocessors and their authenticated pins stay frozen.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makePremultipliedPostprocessRecipe } from "./premultiplied-postprocess-recipe.mjs";
import { blurBoundaryPatch } from "./blur-boundary-patch.mjs";
import { sha } from "./source-pins.mjs";
export const boundaryNumericTestsSha256 = "2f52fa1757b303c8a1129b96269922de52eac7cdb5b99f0c3284343fed6f8487";
const replace = (source, before, after, count = 1) => {
  assert.equal(source.split(before).length - 1, count, "Exact boundary postprocess anchor: " + before);
  return source.split(before).join(after);
};
export function makeBlurBoundaryPostprocessRecipe(options) {
  const base = makePremultipliedPostprocessRecipe(options);
  let source = replace(base.source, "images/resvg-source/filter-premultiplied-raw-input.json", "images/resvg-source/filter-blur-boundary-raw-input.json", 2);
  source = replace(source, "two-fresh-private-filter-premultiplied-source-builds-byte-identical-not-browser-acceptance", "two-fresh-private-filter-blur-boundary-source-builds-byte-identical-not-browser-acceptance");
  source = replace(source, "two-fresh-filter-premultiplied-source-builds-verified-not-browser-acceptance", "two-fresh-filter-blur-boundary-source-builds-verified-not-browser-acceptance");
  const summary = '  report.filterRegionPatch = filterRegionPatch;';
  source = replace(source, summary,
    '  assert.equal(sourceRepeat.blurBoundaryPatch.patchedSha256,blurBoundaryPatch.patchedSha256);\n' +
    '  assert.equal(sourceRepeat.blurBoundaryPatch.nativeSourceRecipeIntegrated,true);\n' +
    '  assert.equal(inputPin.blurBoundaryPatchedSha256,blurBoundaryPatch.patchedSha256);\n' +
    '  assert.equal(inputPin.blurBoundaryNumericTestsSha256,boundaryNumericTestsSha256);\n' +
    '  report.blurBoundaryPatch={...blurBoundaryPatch,nativeSourceRecipeIntegrated:true};report.sourceBlurBoundaryChanged=true;\n' + summary);
  const compiler = '    assert.equal(receipt.premultipliedTransferPatch.patchedSha256,premultipliedTransferPatch.patchedSha256);';
  source = replace(source, compiler,
    '    assert.equal(receipt.blurBoundaryPatch.patchedSha256,blurBoundaryPatch.patchedSha256);\n' +
    '    assert.equal(receipt.blurBoundaryPatch.originalSha256,blurBoundaryPatch.originalSha256);\n' +
    '    assert.equal(receipt.blurBoundaryPatch.entrySha256,blurBoundaryPatch.entrySha256);\n' +
    '    assert.equal(receipt.blurBoundaryPatch.onlyOwnedFreshDependencyCheckoutChanged,true);\n' +
    '    assert.equal(receipt.blurBoundaryPatch.priorPremultipliedSourceRetained,true);\n' +
    '    assert.equal(receipt.blurBoundaryPatch.nativeSourceRecipeIntegrated,true);\n' +
    '    assert.equal(receipt.blurBoundaryKernelTests.passed,4);\n' +
    '    assert.equal(receipt.blurBoundaryKernelTests.testsSha256,boundaryNumericTestsSha256);\n' +
    '    assert.equal(receipt.blurBoundaryKernelTests.sourcePatchedSha256,blurBoundaryPatch.patchedSha256);\n' +
    '    assert.equal(receipt.blurBoundaryKernelTests.compiler,compileContract.rustcVersion);\n' +
    '    assert.equal(receipt.blurBoundaryKernelTests.numericOnly,true);\n' + compiler);
  source = replace(source, 'const sources = [', 'const sources = ["images/resvg-source/blur-boundary-postprocess-recipe.mjs", "images/resvg-source/postprocess-blur-boundary-source.mjs", "images/resvg-source/blur-boundary-patch.mjs", "images/resvg-source/blur-boundary-entry.rs", "images/resvg-source/blur-boundary-kernel-tests.rs", ".github/workflows/svg-blur-boundary-postprocess.yml", ');
  source = 'import {blurBoundaryPatch} from ' + JSON.stringify(pathToFileURL(path.join(options.root, "images/resvg-source/blur-boundary-patch.mjs")).href) + ';\n' +
    'const boundaryNumericTestsSha256=' + JSON.stringify(boundaryNumericTestsSha256) + ';\n' + source;
  return { source, proof: { ...base.proof, generatedSha256: sha(source), exactFutureInputPin: "images/resvg-source/filter-blur-boundary-raw-input.json",
    blurBoundaryPatch, boundaryNumericTestsSha256, allFiveSourceProofsAndBothPinnedNumericSetsRequired: true,
    maximumBytesChanged: false, fullProcessedAndGlueByteEqualityRequired: true, publicPromotion: false,
    processingPerformedByRecipeGenerator: false } };
}

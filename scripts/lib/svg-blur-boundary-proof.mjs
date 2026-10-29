// Pure receipt checks; callers still authenticate archive, run, raw bytes and prior patches.
import assert from "node:assert/strict";
import { blurBoundaryPatch } from "../../images/resvg-source/blur-boundary-patch.mjs";
import { boundaryNumericTestsSha256 } from "../../images/resvg-source/blur-boundary-postprocess-recipe.mjs";
import { compileContract } from "../../images/resvg-source/compile-contract.mjs";
export function verifyBlurBoundaryCompileProof(receipt) {
  const patch = receipt.blurBoundaryPatch, tests = receipt.blurBoundaryKernelTests;
  for (const field of ["revision", "sourceFile", "originalSha256", "entrySha256", "patchedSha256", "maximumWasmBytesUnchanged", "kernelWeightsRoundingOrPassCountChanged"])
    assert.equal(patch[field], blurBoundaryPatch[field], field);
  for (const field of ["onlyOwnedFreshDependencyCheckoutChanged", "priorPremultipliedSourceRetained", "nativeSourceRecipeIntegrated"])
    assert.equal(patch[field], true, field);
  assert.equal(tests.passed, 4); assert.equal(tests.testsSha256, boundaryNumericTestsSha256);
  assert.equal(tests.sourcePatchedSha256, blurBoundaryPatch.patchedSha256); assert.equal(tests.numericOnly, true);
  assert.equal(tests.compiler, compileContract.rustcVersion); assert.equal(receipt.rustcVersion, compileContract.rustcVersion);
  return true;
}

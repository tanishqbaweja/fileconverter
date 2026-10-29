// Separate fifth-proof candidate; historical source-build drivers stay frozen.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makePremultipliedBuildRecipes } from "./premultiplied-build-recipe.mjs";
import { blurBoundaryPatch } from "./blur-boundary-patch.mjs";
import { sha } from "./source-pins.mjs";
const replace = (source, before, after) => {
  assert.equal(source.split(before).length - 1, 1, "Exact blur-boundary build anchor: " + before.slice(0, 96));
  return source.replace(before, after);
};
export function makeBlurBoundaryBuildRecipes(options) {
  const base = makePremultipliedBuildRecipes(options), { root } = options;
  const extra = '"images/resvg-source/blur-boundary-build-recipe.mjs", "images/resvg-source/blur-boundary-patch.mjs", "images/resvg-source/owned-blur-boundary-patch.mjs", "images/resvg-source/blur-boundary-entry.rs", "images/resvg-source/blur-boundary-kernel-tests.rs", "images/resvg-source/reproduce-blur-boundary-source.mjs", "fixtures/source/resvg-box-blur-3495d870-preimage.json", ".github/workflows/svg-source-blur-boundary.yml", ';
  let compiler = replace(base.compiler, 'const sourceFiles = [', 'const sourceFiles = [' + extra);
  const anchor = '  report.premultipliedTransferPatch = await patchOwnedPremultipliedTransfer({runtime,livenessProof:report.filterLivenessPatch,run});';
  compiler = replace(compiler, anchor, anchor + '\n' +
    '  report.blurBoundaryPatch = await patchOwnedBlurBoundary({runtime,premultipliedProof:report.premultipliedTransferPatch,run});\n' +
    '  const boundaryNumeric=path.join(runtime.directory,"blur-boundary-numeric");await mkdir(boundaryNumeric);\n' +
    '  await writeFile(path.join(boundaryNumeric,"original-box-blur.rs"),await readPinnedBoxBlurPreimage(),{flag:"wx"});\n' +
    '  const boundarySource=await readFile(report.blurBoundaryPatch.ownedCargoSourceFile);assert.equal(sha(boundarySource),report.blurBoundaryPatch.patchedSha256);\n' +
    '  await writeFile(path.join(boundaryNumeric,"patched-box-blur.rs"),boundarySource,{flag:"wx"});\n' +
    '  const boundaryTests=await readFile(path.join(root,"images/resvg-source/blur-boundary-kernel-tests.rs"));\n' +
    '  const boundaryTestFile=path.join(boundaryNumeric,"numeric-tests.rs");await writeFile(boundaryTestFile,boundaryTests,{flag:"wx"});\n' +
    '  const boundaryBinary=path.join(boundaryNumeric,"boundary-numeric-tests");\n' +
    '  await run("rustup",["run",pins.compilerToolchain,"rustc","--edition=2021","--test",boundaryTestFile,"-O","-o",boundaryBinary]);\n' +
    '  const boundaryLog=await run(boundaryBinary,["--test-threads=1","--nocapture"],{capture:true});\n' +
    '  assert.match(boundaryLog,/test result: ok\\. 4 passed; 0 failed; 0 ignored/);\n' +
    '  assert.match(boundaryLog,/boundary-observation old=79 expanded=136 max=57 center=255/);\n' +
    '  report.blurBoundaryKernelTests={passed:4,testsSha256:sha(boundaryTests),sourcePatchedSha256:sha(boundarySource),compiler:report.rustcVersion,numericOnly:true};');
  const verify = '  assert.equal(sha(await readFile(report.renderContextPatch.ownedCargoRenderFile)), report.renderContextPatch.patchedSha256, "Cargo must retain the exact context source correction");';
  compiler = replace(compiler, verify, verify + '\n' +
    '  assert.equal(sha(await readFile(report.blurBoundaryPatch.ownedCargoSourceFile)),report.blurBoundaryPatch.patchedSha256,"Cargo must retain the exact boundary-corrected source");');
  compiler = 'import {patchOwnedBlurBoundary} from ' + JSON.stringify(pathToFileURL(path.join(root, "images/resvg-source/owned-blur-boundary-patch.mjs")).href) + ';\n' +
    'import {readPinnedBoxBlurPreimage} from ' + JSON.stringify(pathToFileURL(path.join(root, "images/resvg-source/blur-boundary-patch.mjs")).href) + ';\n' + compiler;
  let reproducer = replace(base.reproducer, 'const sourceFiles = [', 'const sourceFiles = [' + extra);
  reproducer = replace(reproducer, '    build.premultipliedKernelTests=receipt.premultipliedKernelTests;',
    '    build.premultipliedKernelTests=receipt.premultipliedKernelTests;\n' +
    '    assert.equal(receipt.blurBoundaryPatch.patchedSha256,' + JSON.stringify(blurBoundaryPatch.patchedSha256) + ');\n' +
    '    assert.equal(receipt.blurBoundaryPatch.onlyOwnedFreshDependencyCheckoutChanged,true);\n' +
    '    assert.equal(receipt.blurBoundaryPatch.priorPremultipliedSourceRetained,true);\n' +
    '    assert.equal(receipt.blurBoundaryPatch.nativeSourceRecipeIntegrated,true);\n' +
    '    assert.equal(receipt.blurBoundaryKernelTests.passed,4);\n' +
    '    assert.equal(receipt.blurBoundaryKernelTests.sourcePatchedSha256,receipt.blurBoundaryPatch.patchedSha256);\n' +
    '    assert.equal(receipt.blurBoundaryKernelTests.compiler,receipt.rustcVersion);\n' +
    '    build.blurBoundaryPatch=receipt.blurBoundaryPatch;build.blurBoundaryKernelTests=receipt.blurBoundaryKernelTests;');
  reproducer = replace(reproducer, '  report.status = "two-fresh-private-filter-premultiplied-source-builds-byte-identical-not-browser-acceptance";',
    '  report.blurBoundaryPatch=' + JSON.stringify({ ...blurBoundaryPatch, nativeSourceRecipeIntegrated: true }) + ';\n' +
    '  report.status = "two-fresh-private-filter-blur-boundary-source-builds-byte-identical-not-browser-acceptance";');
  return { ...base, compiler, reproducer, proof: { ...base.proof, compilerSha256: sha(compiler), reproducerSha256: sha(reproducer),
    blurBoundaryPatch, allFiveSourceProofsRequired: true, oldPremultipliedNumericTestsRetained: true,
    boundaryNumericTestsRequiredInBothPinnedCompilerBuilds: true, nativeSourceRecipeIntegrated: true,
    boundedPostprocessedMemoryCapStillRequired: true, maximumWasmBytesUnchanged: 100663296,
    allocationExtentsUnchanged: false, originalConvolutionWeightsAndRoundingUnchanged: true,
    browserFidelityProven: false, publicPromotion: false } };
}

import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeLivenessBuildRecipes } from "./liveness-build-recipe.mjs";
import { premultipliedTransferPatch } from "./premultiplied-transfer-patch.mjs";
import { sha } from "./source-pins.mjs";
const replace=(source,before,after)=>{assert.equal(source.split(before).length-1,1,"Exact premultiplied build anchor");return source.replace(before,after);};
export function makePremultipliedBuildRecipes(options){
  const base=makeLivenessBuildRecipes(options),{root}=options;
  const extra='"images/resvg-source/premultiplied-build-recipe.mjs", "images/resvg-source/premultiplied-transfer-patch.mjs", "images/resvg-source/premultiplied-transfer-kernel.rs", ".github/workflows/svg-source-premultiplied-transfer.yml", ';
  let compiler=replace(base.compiler,'const sourceFiles = [','const sourceFiles = ['+extra);
  const anchor='  report.filterLivenessPatch = await patchOwnedFilterLiveness({runtime,filterProof:report.filterRegionPatch,run});';
  compiler=replace(compiler,anchor,anchor+'\n'+
    '  report.premultipliedTransferPatch = await patchOwnedPremultipliedTransfer({runtime,livenessProof:report.filterLivenessPatch,run});\n'+
    '  const numericBinary=path.join(runtime.directory,"premultiplied-numeric-tests");\n'+
    '  await run("rustup",["run",pins.compilerToolchain,"rustc","--edition=2021","--test",path.join(root,"images/resvg-source/premultiplied-transfer-kernel.rs"),"-O","-o",numericBinary]);\n'+
    '  const numericLog=await run(numericBinary,["--test-threads=1"],{capture:true});\n'+
    '  assert.match(numericLog,/test result: ok\\. 4 passed; 0 failed; 0 ignored/);\n'+
    '  report.premultipliedKernelTests={passed:4,kernelSha256:report.premultipliedTransferPatch.kernelSha256,compiler:report.rustcVersion};');
  compiler=replace(compiler,'report.filterLivenessPatch.patchedSha256, "Cargo must retain the exact liveness-optimized source dependency"',
    'report.premultipliedTransferPatch.patchedSha256, "Cargo must retain the exact premultiplied-transfer source dependency"');
  compiler=`import {patchOwnedPremultipliedTransfer} from ${JSON.stringify(pathToFileURL(path.join(root,"images/resvg-source/premultiplied-transfer-patch.mjs")).href)};\n`+compiler;
  let reproducer=replace(base.reproducer,'const sourceFiles = [','const sourceFiles = ['+extra);
  reproducer=replace(reproducer,'    build.filterLivenessPatch = receipt.filterLivenessPatch;',
    '    build.filterLivenessPatch = receipt.filterLivenessPatch;\n'+
    '    assert.equal(receipt.premultipliedTransferPatch.patchedSha256, '+JSON.stringify(premultipliedTransferPatch.patchedSha256)+');\n'+
    '    assert.equal(receipt.premultipliedTransferPatch.onlyOwnedFreshDependencyCheckoutChanged,true);\n'+
    '    assert.equal(receipt.premultipliedKernelTests.passed,4);\n'+
    '    assert.equal(receipt.premultipliedKernelTests.kernelSha256,receipt.premultipliedTransferPatch.kernelSha256);\n'+
    '    build.premultipliedTransferPatch=receipt.premultipliedTransferPatch;\n'+
    '    build.premultipliedKernelTests=receipt.premultipliedKernelTests;');
  reproducer=replace(reproducer,'  report.status = "two-fresh-private-filter-liveness-source-builds-byte-identical-not-browser-acceptance";',
    '  report.premultipliedTransferPatch='+JSON.stringify(premultipliedTransferPatch)+';\n'+
    '  report.status = "two-fresh-private-filter-premultiplied-source-builds-byte-identical-not-browser-acceptance";');
  return {...base,compiler,reproducer,proof:{...base.proof,compilerSha256:sha(compiler),reproducerSha256:sha(reproducer),
    premultipliedTransferPatch,filterPrimitivePixelKernelsUnchanged:false,
    originalMultiInputMergeLoopUnchanged:true,fullViewportFloatAccumulatorIntroduced:false,
    extraStaticTablePayloadBytes:131072,pinnedCompilerNumericTestsRequiredInBothBuilds:true,
    boundedPostprocessedMemoryCapStillRequired:true,fidelityProven:false,publicPromotion:false}};
}

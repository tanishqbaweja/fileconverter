import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeLivenessBuildRecipes } from "./liveness-build-recipe.mjs";
import { filterPrecisionPatch } from "./filter-precision-patch.mjs";
import { sha } from "./source-pins.mjs";
const replace=(source,before,after)=>{assert.equal(source.split(before).length-1,1,"Exact precision build anchor: "+before.slice(0,100));return source.replace(before,after);};
export function makePrecisionBuildRecipes(options){
  const base=makeLivenessBuildRecipes(options),{root}=options;
  const extra='"images/resvg-source/precision-build-recipe.mjs", "images/resvg-source/filter-precision-patch.mjs", "images/resvg-source/filter-precision-kernel.rs", ".github/workflows/svg-source-filter-precision.yml", ';
  let compiler=replace(base.compiler,'const sourceFiles = [','const sourceFiles = ['+extra);
  const anchor='  report.filterLivenessPatch = await patchOwnedFilterLiveness({runtime,filterProof:report.filterRegionPatch,run});';
  compiler=replace(compiler,anchor,anchor+'\n'+
    '  report.filterPrecisionPatch = await patchOwnedFilterPrecision({runtime,livenessProof:report.filterLivenessPatch,run});\n'+
    '  const numericBinary=path.join(runtime.directory,"precision-numeric-tests");\n'+
    '  await run("rustup",["run",pins.compilerToolchain,"rustc","--edition=2021","--test",path.join(root,"images/resvg-source/filter-precision-kernel.rs"),"-O","-o",numericBinary]);\n'+
    '  const numericLog=await run(numericBinary,["--test-threads=1"],{capture:true});\n'+
    '  assert.match(numericLog,/test result: ok\\. 4 passed; 0 failed; 0 ignored/);\n'+
    '  report.filterPrecisionKernelTests={passed:4,kernelSha256:report.filterPrecisionPatch.kernelSha256,compiler:report.rustcVersion};');
  compiler=replace(compiler,'report.filterLivenessPatch.patchedSha256, "Cargo must retain the exact liveness-optimized source dependency"',
    'report.filterPrecisionPatch.patchedSha256, "Cargo must retain the exact high-precision final-merge source dependency"');
  compiler=`import {patchOwnedFilterPrecision} from ${JSON.stringify(pathToFileURL(path.join(root,"images/resvg-source/filter-precision-patch.mjs")).href)};\n`+compiler;
  let reproducer=replace(base.reproducer,'const sourceFiles = [','const sourceFiles = ['+extra);
  reproducer=replace(reproducer,'    build.filterLivenessPatch = receipt.filterLivenessPatch;',
    '    build.filterLivenessPatch = receipt.filterLivenessPatch;\n'+
    '    assert.equal(receipt.filterPrecisionPatch.patchedSha256, '+JSON.stringify(filterPrecisionPatch.patchedSha256)+');\n'+
    '    assert.equal(receipt.filterPrecisionPatch.onlyOwnedFreshDependencyCheckoutChanged, true);\n'+
    '    assert.equal(receipt.filterPrecisionKernelTests.passed,4);\n'+
    '    assert.equal(receipt.filterPrecisionKernelTests.kernelSha256,receipt.filterPrecisionPatch.kernelSha256);\n'+
    '    build.filterPrecisionPatch=receipt.filterPrecisionPatch;\n'+
    '    build.filterPrecisionKernelTests=receipt.filterPrecisionKernelTests;');
  reproducer=replace(reproducer,'  report.status = "two-fresh-private-filter-liveness-source-builds-byte-identical-not-browser-acceptance";',
    '  report.filterPrecisionPatch = '+JSON.stringify(filterPrecisionPatch)+';\n'+
    '  report.status = "two-fresh-private-filter-precision-source-builds-byte-identical-not-browser-acceptance";');
  return {...base,compiler,reproducer,proof:{...base.proof,compilerSha256:sha(compiler),reproducerSha256:sha(reproducer),
    filterPrecisionPatch,filterPrimitivePixelKernelsUnchanged:false,previousPrimitiveKernelsUnchanged:true,
    finalLinearMergePrecisionChanged:true,pinnedCompilerNumericTestsRequiredInBothBuilds:true,
    allocationExtentsUnchanged:true,additionalFloatAccumulatorBytesPerPixel:16,
    extraFloatAccumulatorMaximumBytes:filterPrecisionPatch.maximumFloatAccumulatorBytes,
    boundedPostprocessedMemoryCapStillRequired:true,fidelityProven:false,publicPromotion:false}};
}

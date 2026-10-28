import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeContextBuildRecipes } from "./context-build-recipe.mjs";
import { filterLivenessPatch } from "./filter-liveness-patch.mjs";
import { sha } from "./source-pins.mjs";
const replace=(source,before,after)=>{assert.equal(source.split(before).length-1,1,"Exact lifetime build anchor");return source.replace(before,after);};
export function makeLivenessBuildRecipes(options){
  const base=makeContextBuildRecipes(options),{root}=options;
  const extra='"images/resvg-source/liveness-build-recipe.mjs", "images/resvg-source/filter-liveness-patch.mjs", ".github/workflows/svg-source-filter-liveness.yml", ';
  let compiler=replace(base.compiler,'const sourceFiles = [','const sourceFiles = ['+extra);
  const patch='  report.renderContextPatch = await patchOwnedRenderContext({runtime,filterProof:report.filterRegionPatch,run});';
  compiler=replace(compiler,patch,patch+'\n  report.filterLivenessPatch = await patchOwnedFilterLiveness({runtime,filterProof:report.filterRegionPatch,run});');
  compiler=replace(compiler,'report.filterRegionPatch.patchedSha256, "Cargo must compile the retained patched dependency, not reset its checkout"',
    'report.filterLivenessPatch.patchedSha256, "Cargo must retain the exact liveness-optimized source dependency"');
  compiler=`import {patchOwnedFilterLiveness} from ${JSON.stringify(pathToFileURL(path.join(root,"images/resvg-source/filter-liveness-patch.mjs")).href)};\n`+compiler;
  let reproducer=replace(base.reproducer,'const sourceFiles = [','const sourceFiles = ['+extra);
  reproducer=replace(reproducer,'    build.renderContextPatch = receipt.renderContextPatch;',
    '    build.renderContextPatch = receipt.renderContextPatch;\n'+
    '    assert.equal(receipt.filterLivenessPatch.patchedSha256, '+JSON.stringify(filterLivenessPatch.patchedSha256)+');\n'+
    '    assert.equal(receipt.filterLivenessPatch.onlyOwnedFreshDependencyCheckoutChanged, true);\n'+
    '    build.filterLivenessPatch = receipt.filterLivenessPatch;');
  reproducer=replace(reproducer,'  report.status = "two-fresh-private-filter-context-source-builds-byte-identical-not-browser-acceptance";',
    '  report.filterLivenessPatch = '+JSON.stringify(filterLivenessPatch)+';\n'+
    '  report.status = "two-fresh-private-filter-liveness-source-builds-byte-identical-not-browser-acceptance";');
  return{...base,compiler,reproducer,proof:{...base.proof,compilerSha256:sha(compiler),reproducerSha256:sha(reproducer),
    filterLivenessPatch,filterPrimitivePixelKernelsUnchanged:true,allocationExtentsUnchanged:true,fidelityProven:false}};
}

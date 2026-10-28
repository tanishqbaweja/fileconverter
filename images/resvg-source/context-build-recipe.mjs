// Additional coordinate fix on top of the independently verified region patch.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeFilterBuildRecipes } from "./filter-build-recipe.mjs";
import { renderContextPatch } from "./render-context-patch.mjs";
import { sha } from "./source-pins.mjs";
const replace=(source,before,after)=>{assert.equal(source.split(before).length-1,1,"Exact render-context build anchor: "+before);return source.replace(before,after);};
export function makeContextBuildRecipes(options){
  const base=makeFilterBuildRecipes(options),{root}=options;
  const extra='"images/resvg-source/context-build-recipe.mjs", "images/resvg-source/render-context-patch.mjs", "images/resvg-source/reproduce-filter-context-source.mjs", "fixtures/source/resvg-render-3495d870-preimage.json", ".github/workflows/svg-source-render-context.yml", ';
  let compiler=replace(base.compiler,'const sourceFiles = [','const sourceFiles = ['+extra);
  compiler=replace(compiler,'  report.filterRegionPatch = await patchOwnedCargoFilter({runtime,run});',
    '  report.filterRegionPatch = await patchOwnedCargoFilter({runtime,run});\n'+
    '  report.renderContextPatch = await patchOwnedRenderContext({runtime,filterProof:report.filterRegionPatch,run});');
  const verification='  assert.equal(sha(await readFile(report.filterRegionPatch.ownedCargoSourceFile)), report.filterRegionPatch.patchedSha256, "Cargo must compile the retained patched dependency, not reset its checkout");';
  compiler=replace(compiler,verification,verification+'\n  assert.equal(sha(await readFile(report.renderContextPatch.ownedCargoRenderFile)), report.renderContextPatch.patchedSha256, "Cargo must retain the exact context source correction");');
  compiler=`import {patchOwnedRenderContext} from ${JSON.stringify(pathToFileURL(path.join(root,"images/resvg-source/render-context-patch.mjs")).href)};\n`+compiler;
  let reproducer=replace(base.reproducer,'const sourceFiles = [','const sourceFiles = ['+extra);
  reproducer=replace(reproducer,'    build.filterRegionPatch = receipt.filterRegionPatch;',
    '    build.filterRegionPatch = receipt.filterRegionPatch;\n'+
    '    assert.equal(receipt.renderContextPatch.patchedSha256, '+JSON.stringify(renderContextPatch.patchedSha256)+');\n'+
    '    assert.equal(receipt.renderContextPatch.onlyOwnedFreshDependencyCheckoutChanged, true);\n'+
    '    build.renderContextPatch = receipt.renderContextPatch;');
  reproducer=replace(reproducer,'  report.status = "two-fresh-private-filter-region-source-builds-byte-identical-not-browser-acceptance";',
    '  report.renderContextPatch = '+JSON.stringify(renderContextPatch)+';\n'+
    '  report.status = "two-fresh-private-filter-context-source-builds-byte-identical-not-browser-acceptance";');
  return{...base,compiler,reproducer,proof:{...base.proof,compilerSha256:sha(compiler),reproducerSha256:sha(reproducer),
    sourceRegionAndRenderContextPatched:true,renderContextPatch,clipExtentDimensionsEnlarged:false,fidelityProven:false}};
}

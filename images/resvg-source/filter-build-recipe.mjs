// Derived private build drivers keep historical baseline files byte-identical.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./source-pins.mjs";
import { filterRegionPatch } from "./filter-region-patch.mjs";
export const filterBuildBasePins=Object.freeze({
  "images/resvg-source/compile-candidate.mjs":"74583103d51daf2eb6e6ab3f8406aeb01ceacc3521371c99f7a7ef10fa6cc3c1",
  "images/resvg-source/reproduce-raw-source.mjs":"a53f0b68cdd10dcb3aa9d54f6a4a24a080db12d532ae3ba50865d2cd2fd22325",
});
const replace=(text,before,after)=>{assert.equal(text.split(before).length-1,1,"Exact filter build anchor: "+before);return text.replace(before,after);};
const absolutize=(source,root)=>source.replace(/((?:from\s+|import\s*)["'])(\.\.?\/[^"']+)(["'])/g,(_all,start,name,end)=>{
  const file=path.resolve(root,"images/resvg-source",name);assert.ok(file.startsWith(root+path.sep));return start+pathToFileURL(file).href+end;
});
export function makeFilterBuildRecipes({root,runtime,compilerBytes,reproducerBytes}){
  assert.equal(root,path.resolve(import.meta.dirname,"../.."));assert.equal(path.dirname(runtime),path.join(root,"work"));
  assert.match(path.basename(runtime),/^resvg-filter-owner-[A-Za-z0-9]{6}$/);
  assert.equal(sha(compilerBytes),filterBuildBasePins["images/resvg-source/compile-candidate.mjs"]);
  assert.equal(sha(reproducerBytes),filterBuildBasePins["images/resvg-source/reproduce-raw-source.mjs"]);
  const compilerPath=path.join(runtime,"compile-filter-candidate.mjs"),reproducerPath=path.join(runtime,"repeat-filter-source.mjs");
  let compiler=absolutize(compilerBytes.toString(),root),reproducer=absolutize(reproducerBytes.toString(),root);
  for(const name of ["compiler","reproducer"]){
    if(name==="compiler")compiler=replace(compiler,'path.resolve(import.meta.dirname, "../..")',JSON.stringify(root));
    else reproducer=replace(reproducer,'path.resolve(import.meta.dirname, "../..")',JSON.stringify(root));
  }
  const additions='"images/resvg-source/filter-region-patch.mjs", "images/resvg-source/filter-build-recipe.mjs", "images/resvg-source/reproduce-filter-region-source.mjs", "fixtures/source/resvg-filter-3495d870-preimage.json", ".github/workflows/svg-source-filter-region.yml", ';
  compiler=replace(compiler,'const sourceFiles = ["images/resvg-source/compile-candidate.mjs",','const sourceFiles = ['+additions+'"images/resvg-source/compile-candidate.mjs",');
  const build='  await run("rustup", [...compileContract.command], { cwd: source });';
  compiler=replace(compiler,build,
    '  await run("rustup", ["run", pins.compilerToolchain, "cargo", "fetch", "--locked", "--target", "wasm32-unknown-unknown"], { cwd: source });\n'+
    '  report.filterRegionPatch = await patchOwnedCargoFilter({runtime,run});\n'+build+'\n'+
    '  assert.equal(sha(await readFile(report.filterRegionPatch.ownedCargoSourceFile)), report.filterRegionPatch.patchedSha256, "Cargo must compile the retained patched dependency, not reset its checkout");');
  compiler=`import {patchOwnedCargoFilter} from ${JSON.stringify(pathToFileURL(path.join(root,"images/resvg-source/filter-region-patch.mjs")).href)};\n`+compiler;
  reproducer=replace(reproducer,'const sourceFiles = ["images/resvg-source/reproduce-raw-source.mjs",','const sourceFiles = ['+additions+'"images/resvg-source/reproduce-raw-source.mjs",');
  reproducer=replace(reproducer,'["images/resvg-source/compile-candidate.mjs", "--bytes-1.6.0"]',`[${JSON.stringify(compilerPath)}, "--bytes-1.6.0"]`);
  reproducer=replace(reproducer,'    const wasmInfo = await lstat(base + ".wasm");',
    '    assert.equal(receipt.filterRegionPatch.originalSha256, '+JSON.stringify(filterRegionPatch.originalSha256)+');\n'+
    '    assert.equal(receipt.filterRegionPatch.patchedSha256, '+JSON.stringify(filterRegionPatch.patchedSha256)+');\n'+
    '    assert.equal(receipt.filterRegionPatch.onlyOwnedFreshDependencyCheckoutChanged, true);\n'+
    '    build.filterRegionPatch = receipt.filterRegionPatch;\n    const wasmInfo = await lstat(base + ".wasm");');
  reproducer=replace(reproducer,'  report.publicEngineUnchanged = true; report.status = "two-fresh-private-remapped-raw-source-builds-byte-identical-not-browser-acceptance";',
    '  report.publicEngineUnchanged = true; report.filterRegionPatch = '+JSON.stringify(filterRegionPatch)+';\n'+
    '  report.filterAllocationExtentChanged = true; report.renderingFidelityUnverified = true;\n'+
    '  report.status = "two-fresh-private-filter-region-source-builds-byte-identical-not-browser-acceptance";');
  return{compilerPath,reproducerPath,compiler,reproducer,proof:{basePins:filterBuildBasePins,compilerSha256:sha(compiler),reproducerSha256:sha(reproducer),
    filterRegionPatch,sameCompilerLockAndCargoReleaseFlags:true,additionalLockedFetchBeforePatch:true,
    twoIndependentFreshBuildsAndFullByteEqualityRequired:true,publicFilesModified:false,fidelityProven:false}};
}

// Private lifetime optimization only. No pixel/filter-region/kernel changes.
import assert from "node:assert/strict";
import { lstat,readFile,realpath,writeFile } from "node:fs/promises";
import path from "node:path";
import { pins,sha } from "./source-pins.mjs";
import { filterRegionPatch } from "./filter-region-patch.mjs";
export const filterLivenessPatch=Object.freeze({revision:pins.resvg,sourceFile:filterRegionPatch.sourceFile,
  originalSha256:filterRegionPatch.patchedSha256,patchedSha256:"5331eaa19f37af8f1f6b96d1e672a66609a7bd65f8f3ec24f47faaf6dcc53307",
  scope:"Release named intermediate Arc owners after all current inputs are acquired and no future primitive references their name; merge retains inputs through its original loop",
  pixelKernelsOrParametersChanged:false,allocationExtentsChanged:false,fidelityProven:false,publicPromotion:false});
const one=(source,before,after)=>{assert.equal(source.split(before).length-1,1,"Exact filter lifetime source anchor");return source.replace(before,after);};
const helper=`// All current inputs own their Arcs before this runs. Keeping every name
// referenced anywhere later is conservative even when result names are reused.
fn release_dead_filter_results(results: &mut Vec<FilterResult>, future: &[Primitive]) {
    results.retain(|result| future.iter().any(|primitive| {
        let named = |input: &usvg::filter::Input| match input {
            usvg::filter::Input::Reference(name) => name == &result.name,
            _ => false,
        };
        match &primitive.kind {
            usvg::filter::Kind::Blend(fe) => named(&fe.input1) || named(&fe.input2),
            usvg::filter::Kind::DropShadow(fe) => named(&fe.input),
            usvg::filter::Kind::GaussianBlur(fe) => named(&fe.input),
            usvg::filter::Kind::Offset(fe) => named(&fe.input),
            usvg::filter::Kind::Composite(fe) => named(&fe.input1) || named(&fe.input2),
            usvg::filter::Kind::Merge(fe) => fe.inputs.iter().any(named),
            usvg::filter::Kind::Tile(fe) => named(&fe.input),
            usvg::filter::Kind::ComponentTransfer(fe) => named(&fe.input),
            usvg::filter::Kind::ColorMatrix(fe) => named(&fe.input),
            usvg::filter::Kind::ConvolveMatrix(fe) => named(&fe.input),
            usvg::filter::Kind::Morphology(fe) => named(&fe.input),
            usvg::filter::Kind::DisplacementMap(fe) => named(&fe.input1) || named(&fe.input2),
            usvg::filter::Kind::DiffuseLighting(fe) => named(&fe.input),
            usvg::filter::Kind::SpecularLighting(fe) => named(&fe.input),
            usvg::filter::Kind::Flood(_) | usvg::filter::Kind::Image(_)
                | usvg::filter::Kind::Turbulence(_) => false,
        }
    }));
}

`;
export function patchPinnedFilterLiveness(bytes){
  assert.ok(bytes.length<=131072);assert.equal(sha(bytes),filterLivenessPatch.originalSha256);
  const original=bytes.toString(),edits=[];
  const edit=(before,after)=>{source=one(source,before,after);edits.push([before,after]);};
  let source=original;
  edit("    for primitive in &filter.primitives {","    for (primitive_index, primitive) in filter.primitives.iter().enumerate() {\n        let future = &filter.primitives[primitive_index + 1..];");
  const start=source.indexOf("        let mut result = match primitive.kind {"),end=source.indexOf("\n\n        if region != subregion",start);
  assert.ok(start>0&&end>start);const body=source.slice(start,end);
  const calls=["apply_blend","apply_drop_shadow","apply_blur","apply_offset","apply_composite","apply_tile","apply_component_transfer","apply_color_matrix","apply_convolve_matrix","apply_morphology","apply_displacement_map","apply_diffuse_lighting","apply_specular_lighting"];
  let changed=body;
  for(const name of calls)changed=one(changed,"                "+name+"(","                release_dead_filter_results(&mut results, future);\n                "+name+"(");
  // Merge reads results inside its original loop, so it is released only after
  // that call returns. All other inputs are already owned before early release.
  changed+="\n        release_dead_filter_results(&mut results, future);";
  edit(body,changed);
  const marker="// TODO: merge with mask region logic";edit(marker,helper+marker);
  let restored=source;for(const [before,after]of [...edits].reverse())restored=one(restored,after,before);
  assert.equal(restored,original,"Entire source reversal including every original pixel kernel");
  assert.equal(sha(source),filterLivenessPatch.patchedSha256);
  return{bytes:Buffer.from(source),proof:{...filterLivenessPatch,patchedSha256:sha(source),originalBytes:bytes.length,patchedBytes:Buffer.byteLength(source),
    earlyReleaseArms:calls.length,mergeOriginalInputLoopRetained:true,allCurrentInputsAcquiredBeforeRelease:true,entireOriginalRestoredByRemovingOnlyPatch:true}};
}
export async function patchOwnedFilterLiveness({runtime,filterProof,run}){
  const root=path.resolve(import.meta.dirname,"../.."),directory=runtime.directory;
  assert.equal(path.dirname(directory),path.join(root,"work"));assert.match(path.basename(directory),/^resvg-source-compile-[A-Za-z0-9]{6}$/);
  assert.equal(await realpath(directory),directory);assert.equal(filterProof.patchedSha256,filterRegionPatch.patchedSha256);
  assert.equal(filterProof.onlyOwnedFreshDependencyCheckoutChanged,true);
  const file=filterProof.ownedCargoSourceFile;assert.ok(file.startsWith(path.join(directory,"cargo/git/checkouts")+path.sep));
  assert.equal(await realpath(file),file);const identity=await lstat(file);assert.ok(identity.isFile()&&!identity.isSymbolicLink());
  assert.equal(await run("git",["-C",path.dirname(file),"rev-parse","HEAD"],{capture:true}),pins.resvg);
  assert.ok(filterLivenessPatch.patchedSha256,"Expected modified source digest required before any Cargo mutation");
  const patched=patchPinnedFilterLiveness(await readFile(file));await writeFile(file,patched.bytes);
  assert.equal(sha(await readFile(file)),patched.proof.patchedSha256);
  return{...patched.proof,ownedCargoSourceFile:file,gitHead:pins.resvg,onlyOwnedFreshDependencyCheckoutChanged:true};
}

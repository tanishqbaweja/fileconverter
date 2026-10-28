// Private coordinate-space correction, not a claim of accepted SVG fidelity.
import assert from "node:assert/strict";
import { lstat,readFile,realpath,writeFile } from "node:fs/promises";
import path from "node:path";
import { pins,sha } from "./source-pins.mjs";
import { filterRegionPatch } from "./filter-region-patch.mjs";
export const renderContextPatch=Object.freeze({revision:pins.resvg,sourceFile:"crates/resvg/src/render.rs",
  originalSha256:"fdb0fe57a32e5c80553812aea5362369d722ca05d14f6723206e172e59ace937",
  patchedSha256:"d9d3b07113d3e95e0506658e197f2c782dd0469fd5d3a34e960fff66c53f7bef",
  scope:"Translate max_bbox into each isolated child pixmap coordinate space before recursive children/mask rendering",
  boundingBoxDimensionsChanged:false,rootContextChanged:false,fidelityProven:false,publicPromotion:false});
const changes=[
  ["    let transform = shift_ts.pre_concat(transform);\n\n    let mut sub_pixmap",`    let transform = shift_ts.pre_concat(transform);

    // The child pixmap has its own origin at ibbox, unlike the parent canvas.
    let child_ctx = Context {
        max_bbox: ctx.max_bbox.translate(-ibbox.x(), -ibbox.y())?,
    };

    let mut sub_pixmap`],
  ["    render_nodes(&group.children, ctx, transform, &mut sub_pixmap.as_mut());","    render_nodes(&group.children, &child_ctx, transform, &mut sub_pixmap.as_mut());"],
  ["        crate::mask::apply(mask, ctx, transform, &mut sub_pixmap);","        crate::mask::apply(mask, &child_ctx, transform, &mut sub_pixmap);"],
];
export function patchPinnedRenderContext(bytes){
  assert.ok(bytes.length<=131072);assert.equal(sha(bytes),renderContextPatch.originalSha256,"Exact pinned upstream rendering module required");
  const original=bytes.toString();assert.ok(original.startsWith("// This Source Code Form is subject to the terms of the Mozilla Public"));
  let source=original;
  for(const [before,after]of changes){assert.equal(source.split(before).length-1,1,"Exact rendering-context source anchor");source=source.replace(before,after);}
  let restored=source;for(const [before,after]of [...changes].reverse()){assert.equal(restored.split(after).length-1,1);restored=restored.replace(after,before);}
  assert.equal(restored,original,"Entire rendering source byte reversal");
  assert.equal(sha(source),renderContextPatch.patchedSha256);
  return{bytes:Buffer.from(source),proof:{...renderContextPatch,originalBytes:bytes.length,patchedBytes:Buffer.byteLength(source),patchedSha256:sha(source),
    edits:changes.length,entireOriginalRestoredByRemovingOnlyPatch:true,filterParametersOrPixelKernelsChanged:false}};
}
export async function patchOwnedRenderContext({runtime,filterProof,run}){
  const root=path.resolve(import.meta.dirname,"../.."),directory=runtime.directory;
  assert.equal(path.dirname(directory),path.join(root,"work"));assert.match(path.basename(directory),/^resvg-source-compile-[A-Za-z0-9]{6}$/);
  assert.equal(await realpath(directory),directory);
  assert.equal(filterProof.patchedSha256,filterRegionPatch.patchedSha256);assert.equal(filterProof.onlyOwnedFreshDependencyCheckoutChanged,true);
  const filterFile=filterProof.ownedCargoSourceFile;
  assert.ok(filterFile.startsWith(path.join(directory,"cargo/git/checkouts")+path.sep));
  assert.equal(await realpath(filterFile),filterFile);assert.equal(sha(await readFile(filterFile)),filterRegionPatch.patchedSha256);
  const file=path.resolve(path.dirname(filterFile),"../render.rs");assert.ok(file.endsWith(path.join("crates/resvg/src/render.rs")));
  assert.equal(await realpath(file),file);const identity=await lstat(file);assert.ok(identity.isFile()&&!identity.isSymbolicLink());
  assert.equal(await run("git",["-C",path.dirname(file),"rev-parse","HEAD"],{capture:true}),pins.resvg);
  const patched=patchPinnedRenderContext(await readFile(file));await writeFile(file,patched.bytes);
  assert.equal(sha(await readFile(file)),patched.proof.patchedSha256);
  return{...patched.proof,ownedCargoRenderFile:file,gitHead:pins.resvg,onlyOwnedFreshDependencyCheckoutChanged:true};
}

// Private source candidate. Changes allocation extent; not accepted rendering semantics.
import assert from "node:assert/strict";
import { lstat,readFile,readdir,realpath,writeFile } from "node:fs/promises";
import path from "node:path";
import { pins,sha } from "./source-pins.mjs";
export const filterRegionPatch=Object.freeze({revision:pins.resvg,
  sourceFile:"crates/resvg/src/filter/mod.rs",
  originalSha256:"1770d1f0b7fc6992c723e6bcc704fd0fe5442e00472c8603593cfa1966f5468a",
  patchedSha256:"ff98d2cf2406b01d728d84ae214c146c628b514bc94fee015ce978dbbd416191",
  scope:"Intersect transformed filter allocation region with already bounded source pixmap; original primitives, parameters and subregion coordinates retained",
  fidelityProven:false,publicPromotion:false});
const before=`    let region = filter
        .region
        .transform(ts)
        .map(|r| r.to_int_rect())
        .ok_or(Error::InvalidRegion)?;`;
const after=`    let source_bounds = IntRect::from_xywh(0, 0, source.width(), source.height())
        .ok_or(Error::InvalidRegion)?;
    let region = filter
        .region
        .transform(ts)
        .map(|r| r.to_int_rect())
        .and_then(|r| r.intersect(&source_bounds))
        .ok_or(Error::InvalidRegion)?;`;
export function patchPinnedFilterRegion(bytes){
  assert.ok(bytes.length<=131072);assert.equal(sha(bytes),filterRegionPatch.originalSha256,"Exact pinned upstream filter module required");
  const original=bytes.toString();assert.ok(original.startsWith("// This Source Code Form is subject to the terms of the Mozilla Public"));
  assert.equal(original.split(before).length-1,1);const patched=original.replace(before,after);
  assert.equal(patched.split(after).length-1,1);assert.equal(patched.replace(after,before),original,"Entire source byte reversal");
  assert.equal(sha(patched),filterRegionPatch.patchedSha256);
  return{bytes:Buffer.from(patched),proof:{...filterRegionPatch,originalBytes:bytes.length,patchedBytes:Buffer.byteLength(patched),patchedSha256:sha(patched),
    entireOriginalSourceRestoredByRemovingOnlyPatch:true,primitiveCodeOrParametersChanged:false,subregionCoordinatesChanged:false}};
}
export async function patchOwnedCargoFilter({runtime,run}){
  const root=path.resolve(import.meta.dirname,"../.."),directory=runtime.directory;
  assert.equal(path.dirname(directory),path.join(root,"work"));assert.match(path.basename(directory),/^resvg-source-compile-[A-Za-z0-9]{6}$/);
  assert.equal(await realpath(directory),directory);
  const checkouts=path.join(directory,"cargo/git/checkouts");assert.equal(await realpath(checkouts),checkouts);
  const packages=(await readdir(checkouts,{withFileTypes:true})).filter(row=>/^resvg-[0-9a-f]+$/.test(row.name));
  assert.equal(packages.length,1);assert.ok(packages[0].isDirectory()&&!packages[0].isSymbolicLink());
  const packageRoot=path.join(checkouts,packages[0].name);
  const revisions=(await readdir(packageRoot,{withFileTypes:true})).filter(row=>/^[0-9a-f]{7,40}$/.test(row.name));
  assert.ok(revisions.length>0&&revisions.length<=16);let selected=null;
  for(const row of revisions){assert.ok(row.isDirectory()&&!row.isSymbolicLink());const checkout=path.join(packageRoot,row.name);
    assert.equal(await realpath(checkout),checkout);
    const revision=await run("git",["-C",checkout,"rev-parse","HEAD"],{capture:true});
    if(revision===pins.resvg){assert.equal(selected,null);selected=checkout;}
  }
  assert.ok(selected,"Only the exact locked resvg revision may be patched");
  const file=path.join(selected,filterRegionPatch.sourceFile);assert.equal(await realpath(file),file);
  const identity=await lstat(file);assert.ok(identity.isFile()&&!identity.isSymbolicLink());
  const patch=patchPinnedFilterRegion(await readFile(file));await writeFile(file,patch.bytes);
  assert.equal(sha(await readFile(file)),patch.proof.patchedSha256);
  return{...patch.proof,ownedCargoSourceFile:file,gitHead:pins.resvg,onlyOwnedFreshDependencyCheckoutChanged:true};
}

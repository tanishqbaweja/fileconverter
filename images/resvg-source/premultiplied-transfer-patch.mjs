// Distinct private candidate from original lifetime source; no blanket-float final merge.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lstat,readFile,realpath,writeFile } from "node:fs/promises";
import path from "node:path";
import { pins,sha } from "./source-pins.mjs";
import { filterLivenessPatch } from "./filter-liveness-patch.mjs";
export const premultipliedTransferPatch=Object.freeze({revision:pins.resvg,sourceFile:filterLivenessPatch.sourceFile,
  originalSha256:filterLivenessPatch.patchedSha256,patchedSha256:"9b601b713bfc3a5ca318fd8edaa220f4dcb2b3ba7323956efefc118f08fba8bb",kernelSha256:"0b28bd9909c60f9575be8ae5021dcb2c81291c16e9a6fea69663009fe66b5126",
  scope:"Fixed premultiplied transfer lookup tables with one final8-bit rounding; preserve8-bit multi-input compositing and skip unnecessary transfer for single-input merge",
  additionalTablePayloadBytes:131072,additionalStaticTableStorageUpperBoundBytes:131104,
  fullViewportFloatAccumulatorIntroduced:false,fixtureOrFilterParametersChanged:false,
  multiInputMergeLoopChanged:false,transferMethodsChanged:true,singleInputMergeOptimized:true,
  fidelityProven:false,publicPromotion:false});
const one=(source,before,after)=>{assert.equal(source.split(before).length-1,1,"Exact premultiplied transfer source anchor");return source.replace(before,after);};
export function patchPinnedPremultipliedTransfer(bytes){
  assert.ok(bytes.length<=131072);assert.equal(sha(bytes),premultipliedTransferPatch.originalSha256);
  const kernel=readFileSync(new URL("premultiplied-transfer-kernel.rs",import.meta.url));
  assert.equal(sha(kernel),premultipliedTransferPatch.kernelSha256,"Pinned premultiplied Rust kernel");
  const original=bytes.toString(),edits=[];let source=original;
  const edit=(before,after)=>{source=one(source,before,after);edits.push([before,after]);};
  for(const [method,freeFunction,direction]of [["into_srgb","from_linear_rgb",false],["into_linear_rgb","into_linear_rgb",true]]){
    const before=`    fn ${method}(&mut self) {\n        demultiply_alpha(self.data_mut().as_rgba_mut());\n        ${freeFunction}(self.data_mut().as_rgba_mut());\n        multiply_alpha(self.data_mut().as_rgba_mut());\n    }`;
    edit(before,`    fn ${method}(&mut self) {\n        within_convert_premultiplied(self.data_mut(), ${direction});\n    }`);
  }
  const begin=source.indexOf('fn apply_merge('),end=source.indexOf('\nfn ',begin+4);assert.ok(begin>0&&end>begin);
  const body=source.slice(begin,end),anchor='    for input in &fe.inputs {';
  const branch=`    // A single source-over onto transparent output is a color-space no-op.
    // Retain the original output dimensions/clipping, not a differently-sized input image.
    if let [input] = fe.inputs.as_slice() {
        let input = get_input(input, region, source, results)?;
        let color_space = input.color_space;
        pixmap.draw_pixmap(0, 0, input.as_ref().as_ref(),
            &tiny_skia::PixmapPaint::default(), tiny_skia::Transform::identity(), None);
        return Ok(Image::from_image(pixmap, color_space));
    }
`;
  const changed=one(body,anchor,branch+anchor);edit(body,changed);
  edit('fn apply_merge(',kernel.toString()+"\nfn apply_merge(");
  let restored=source;for(const [before,after]of [...edits].reverse())restored=one(restored,after,before);
  assert.equal(sha(restored),sha(original),"Entire source reversal");
  assert.equal(sha(source),premultipliedTransferPatch.patchedSha256,"Pinned premultiplied source digest");
  return {bytes:Buffer.from(source),proof:{...premultipliedTransferPatch,originalBytes:bytes.length,patchedBytes:Buffer.byteLength(source),
    entireOriginalSourceRestoredByRemovingOnlyPatch:true,originalMultiInputMergeLoopByteIdentical:true,
    originalRegionContextLifetimeChangesRetained:true,originalPrimitiveBodiesOtherwiseUnchanged:true}};
}
export async function patchOwnedPremultipliedTransfer({runtime,livenessProof,run}){
  const root=path.resolve(import.meta.dirname,"../.."),directory=runtime.directory;
  assert.equal(path.dirname(directory),path.join(root,"work"));assert.match(path.basename(directory),/^resvg-source-compile-[A-Za-z0-9]{6}$/);
  assert.equal(await realpath(directory),directory);assert.equal(livenessProof.patchedSha256,filterLivenessPatch.patchedSha256);
  assert.equal(livenessProof.onlyOwnedFreshDependencyCheckoutChanged,true);
  const file=livenessProof.ownedCargoSourceFile;assert.ok(file.startsWith(path.join(directory,"cargo/git/checkouts")+path.sep));
  assert.equal(await realpath(file),file);const identity=await lstat(file);assert.ok(identity.isFile()&&!identity.isSymbolicLink());
  assert.equal(await run("git",["-C",path.dirname(file),"rev-parse","HEAD"],{capture:true}),pins.resvg);
  const result=patchPinnedPremultipliedTransfer(await readFile(file));await writeFile(file,result.bytes);
  assert.equal(sha(await readFile(file)),result.proof.patchedSha256);
  return {...result.proof,ownedCargoSourceFile:file,gitHead:pins.resvg,onlyOwnedFreshDependencyCheckoutChanged:true};
}

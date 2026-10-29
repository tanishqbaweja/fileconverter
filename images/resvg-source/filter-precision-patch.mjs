// Private source candidate: final feMerge precision only; no fixture rewriting.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lstat,readFile,realpath,writeFile } from "node:fs/promises";
import path from "node:path";
import { pins,sha } from "./source-pins.mjs";
import { filterLivenessPatch } from "./filter-liveness-patch.mjs";
export const filterPrecisionPatch=Object.freeze({revision:pins.resvg,sourceFile:filterLivenessPatch.sourceFile,
  originalSha256:filterLivenessPatch.patchedSha256,patchedSha256:"c2d6b0498e2a27a57d90566de685f8f95269ab4ee774b83d3966d5e0543df91f",
  kernelSha256:"704e39eaa68e85369bd8f4a1ac2796904d97ca805a6efb9cd5b10c812abddc8e",maximumFloatAccumulatorBytes:16777216,
  scope:"Final linearRGB feMerge accumulates premultiplied f32 then encodes directly to sRGB; exact opaque final sRGB input bypasses redundant arithmetic",
  previousPrimitiveKernelsChanged:false,fixtureOrFilterParametersChanged:false,fidelityProven:false,publicPromotion:false});
const one=(source,before,after)=>{assert.equal(source.split(before).length-1,1,"Exact final-merge precision anchor");return source.replace(before,after);};
const native=`// The final result is consumed as sRGB by apply_to_canvas. Do not quantize
// SourceGraphic to an intermediate 8-bit linearRGB image and then back again.
fn apply_final_linear_merge(
    fe: &usvg::filter::Merge,
    region: IntRect,
    source: &tiny_skia::Pixmap,
    results: &[FilterResult],
) -> Result<Image, Error> {
    let width = region.width() as usize;
    let height = region.height() as usize;
    let count = width.checked_mul(height).ok_or(Error::InvalidRegion)?;
    let bytes = count.checked_mul(std::mem::size_of::<[f32; 4]>()).ok_or(Error::InvalidRegion)?;
    if bytes > 16 * 1024 * 1024 { return Err(Error::InvalidRegion); }
    let mut accumulator: Vec<[f32; 4]> = Vec::new();
    accumulator.try_reserve_exact(count).map_err(|_| Error::InvalidRegion)?;
    accumulator.resize(count, [0.0; 4]);
    let mut output = tiny_skia::Pixmap::try_create(region.width(), region.height())?;
    for (index, input) in fe.inputs.iter().enumerate() {
        // Preserve original input lookup and ownership, including repeated names.
        // Only this input is acquired, not a vector of cloned source pixmaps.
        let input = get_input(input, region, source, results)?;
        let linear = input.color_space == usvg::filter::ColorInterpolation::LinearRGB;
        let last = index + 1 == fe.inputs.len();
        let input_width = input.width() as usize;
        let input_height = input.height() as usize;
        let data = input.as_ref().data();
        // Original draw_pixmap(0,0) clips different-sized input images at top-left.
        for y in 0..height.min(input_height) {
            for x in 0..width.min(input_width) {
                let at = (y * input_width + x) * 4;
                let pixel = [data[at], data[at+1], data[at+2], data[at+3]];
                let destination = y * width + x;
                if last && !linear && pixel[3] == 255 {
                    // An opaque last layer replaces every prior layer exactly.
                    output.data_mut()[destination*4..destination*4+4].copy_from_slice(&pixel);
                    accumulator[destination][3] = -1.0;
                } else {
                    within_merge_over(&mut accumulator[destination], within_merge_decode(pixel, linear));
                }
            }
        }
    }
    for (index, value) in accumulator.into_iter().enumerate() {
        if value[3] < 0.0 { continue; } // exact opaque last-layer pixel already set
        output.data_mut()[index*4..index*4+4].copy_from_slice(&within_merge_encode(value));
    }
    Ok(Image::from_image(output, usvg::filter::ColorInterpolation::SRGB))
}

`;
export function patchPinnedFilterPrecision(bytes){
  assert.ok(bytes.length<=131072);assert.equal(sha(bytes),filterPrecisionPatch.originalSha256);
  const kernel=readFileSync(new URL("filter-precision-kernel.rs",import.meta.url));
  assert.equal(sha(kernel),filterPrecisionPatch.kernelSha256,"Pinned Rust numeric kernel");
  const original=bytes.toString(),edits=[];let source=original;
  const edit=(before,after)=>{source=one(source,before,after);edits.push([before,after]);};
  edit('            usvg::filter::Kind::Merge(ref fe) => apply_merge(fe, cs, region, source, &results),',
    '            usvg::filter::Kind::Merge(ref fe) => {\n'+
    '                if future.is_empty() && cs == usvg::filter::ColorInterpolation::LinearRGB {\n'+
    '                    apply_final_linear_merge(fe, region, source, &results)\n'+
    '                } else { apply_merge(fe, cs, region, source, &results) }\n'+
    '            },');
  edit('fn apply_merge(',kernel.toString()+"\n"+native+'fn apply_merge(');
  let restored=source;for(const [before,after]of [...edits].reverse())restored=one(restored,after,before);
  assert.equal(sha(restored),sha(original),"Entire source reversibility");
  assert.equal(sha(source),filterPrecisionPatch.patchedSha256,"Pinned final-merge source digest");
  return {bytes:Buffer.from(source),proof:{...filterPrecisionPatch,originalBytes:bytes.length,patchedBytes:Buffer.byteLength(source),
    entireOriginalSourceRestoredByRemovingOnlyPatch:true,nonFinalOrSrgbMergesUseOriginalKernel:true,
    allOtherOriginalPixelKernelsByteIdentical:true,clonedInputVectorIntroduced:false}};
}
export async function patchOwnedFilterPrecision({runtime,livenessProof,run}){
  const root=path.resolve(import.meta.dirname,"../.."),directory=runtime.directory;
  assert.equal(path.dirname(directory),path.join(root,"work"));assert.match(path.basename(directory),/^resvg-source-compile-[A-Za-z0-9]{6}$/);
  assert.equal(await realpath(directory),directory);assert.equal(livenessProof.patchedSha256,filterLivenessPatch.patchedSha256);
  assert.equal(livenessProof.onlyOwnedFreshDependencyCheckoutChanged,true);
  const file=livenessProof.ownedCargoSourceFile;assert.ok(file.startsWith(path.join(directory,"cargo/git/checkouts")+path.sep));
  assert.equal(await realpath(file),file);const identity=await lstat(file);assert.ok(identity.isFile()&&!identity.isSymbolicLink());
  assert.equal(await run("git",["-C",path.dirname(file),"rev-parse","HEAD"],{capture:true}),pins.resvg);
  const result=patchPinnedFilterPrecision(await readFile(file));await writeFile(file,result.bytes);
  assert.equal(sha(await readFile(file)),result.proof.patchedSha256);
  return {...result.proof,ownedCargoSourceFile:file,gitHead:pins.resvg,onlyOwnedFreshDependencyCheckoutChanged:true};
}

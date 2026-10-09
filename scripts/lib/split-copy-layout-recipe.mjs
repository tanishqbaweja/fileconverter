// Private scalar observation only. Actual codec/AVIO/frame/packet lifetimes unchanged.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeSplitCopySession as makeOriginalCopySession } from "./split-copy-kernel-recipe.mjs";
export { makeSplitCopyAdapter,makeSplitCopyFrameBridge,exposeSplitCodecMemory } from "./split-copy-kernel-recipe.mjs";
export function makeSplitCopySession(source){
  const previous=makeOriginalCopySession(source);
  const patches=[
    ["  let getCopyKernel = options.getCopyKernel;","  let firstFrameCopyLayout = null;\n  let getCopyKernel = options.getCopyKernel;"],
    ["    additionalPixelBufferBytes: 0, additionalJsPacketBufferBytes: 0, failed, closed });",
      "    additionalPixelBufferBytes: 0, additionalJsPacketBufferBytes: 0, firstFrameCopyLayout, failed, closed });"],
    ['            success(encoder._within_split_encoder_send(c), "send");',
      `            success(encoder._within_split_encoder_send(c), "send");
            if (firstFrameCopyLayout === null) firstFrameCopyLayout = Object.freeze({
              width: from.width, height: from.height, pixelFormat: from.pixelFormat, activePixelBytes: bytes,
              sourceStrides: Object.freeze(from.planes.map(plane => plane.stride)),
              targetStrides: Object.freeze(to.planes.map(plane => plane.stride)),
              scope: "First successfully copied/encoded frame scalar layout only; not allocation provenance" });`],
  ];
  let generated=previous.generated;
  for(const[before,after]of patches){assert.equal(generated.split(before).length,2);generated=generated.replace(before,after);}
  let restored=generated;for(const[before,after]of patches.toReversed())restored=restored.replace(after,before);assert.equal(restored,previous.generated);
  return {generated,originalSha256:sha(source),generatedSha256:sha(generated),patches:[...previous.patches,...patches]};
}

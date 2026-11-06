// PRIVATE lazy storage, not an encoder-settings or pixel-algorithm change.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha=value=>createHash("sha256").update(value).digest("hex");
const pins={
  allocation:"751cf9d0b04880dfbf97690be6f651c0ddb3f55fcefb9955eccc982c36a5f641",
  motion:"2ce1f457ceb547d57c3b9411f602f922fa8dd1c06ce901fe349d8eb3a8a41075",
  scale:"3b6023628aedfbc2b6d624e2f31d16462bd3dc22e8eeeaf26dbab82c9494b2e5",
};
export const VP9_LAZY_UTILITY_PARENTS=Object.freeze({
  encoder:"8ace86130847ded082c84bd847375c643754d37ef8d89f1f65a666f593d69970",
  filter:"33258b68dc898d4babe9beb5c2368f6fd78e67478a233849f07819a64bcfeee6",
});
function proof(source,edits) {
  let generated=source;
  for(const [before,after] of edits){assert.equal(generated.split(before).length,2);generated=generated.replace(before,after);}
  let reverse=generated;for(const [before,after] of edits.toReversed()){assert.equal(reverse.split(after).length,2);reverse=reverse.replace(after,before);}
  assert.equal(reverse,source);
  return {generated,parentSha256:sha(source),generatedSha256:sha(generated),edits,codecSettingsChanged:false,
    pixelAlgorithmsChanged:false,memoryLimitsRaised:false,actualMemorySavedBytes:null,browserValidated:false,speedGainProven:false,publicAcceptance:false};
}
export function makeVp9LazyUtilityFunctions({allocation,motion,scale}) {
  for(const [name,source] of Object.entries({allocation,motion,scale}))assert.equal(sha(source),pins[name],"Pinned utility function "+name);
  const helper="static int within_vp9_lazy_utility_buffers(const VP9_COMP *cpi) {\n"+
    "  return cpi->oxcf.mode == REALTIME && cpi->oxcf.lag_in_frames == 0 &&\n"+
    "         !cpi->use_svc;\n}\n\n";
  let lazyAllocation=allocation;
  for(const field of ["last_frame_uf","scaled_source","scaled_last_source"]) {
    const before="  if (vpx_realloc_frame_buffer(&cpi->"+field+", cm->width, cm->height,\n";
    assert.equal(lazyAllocation.split(before).length,2);
    lazyAllocation=lazyAllocation.replace(before,"  if (!within_vp9_lazy_utility_buffers(cpi) &&\n      vpx_realloc_frame_buffer(&cpi->"+field+", cm->width, cm->height,\n");
  }
  lazyAllocation=helper+lazyAllocation;
  const lazyMotion=motion.replace("  int y_stride = cpi->scaled_source.y_stride;",
    "  int y_stride = within_vp9_lazy_utility_buffers(cpi)\n"+
    "                     ? get_frame_new_buffer(&cpi->common)->y_stride\n"+
    "                     : cpi->scaled_source.y_stride;");
  const branch="      cm->mi_rows * MI_SIZE != unscaled->y_height) {\n";
  assert.equal(scale.split(branch).length,2);
  const lazyScale=scale.replace(branch,branch+
    "    if (vpx_realloc_frame_buffer(scaled, cm->width, cm->height,\n"+
    "                                 cm->subsampling_x, cm->subsampling_y,\n"+
    "#if CONFIG_VP9_HIGHBITDEPTH\n"+
    "                                 cm->use_highbitdepth,\n"+
    "#endif\n"+
    "                                 VP9_ENC_BORDER_IN_PIXELS, cm->byte_alignment,\n"+
    "                                 NULL, NULL, NULL))\n"+
    "      vpx_internal_error(&cm->error, VPX_CODEC_MEM_ERROR,\n"+
    "                         \"Failed to allocate lazy scaled frame\");\n");
  return {allocation:proof(allocation,[[allocation,lazyAllocation]]),motion:proof(motion,[[motion,lazyMotion]]),
    scale:proof(scale,[[scale,lazyScale]])};
}
export function makeVp9LazyUtilityEncoder(source) {
  assert.equal(sha(source),VP9_LAZY_UTILITY_PARENTS.encoder,"Exact diagnostic encoder parent required");
  const extract=signature=>{const start=source.indexOf(signature),end=source.indexOf("\n}\n",start);assert.ok(start>0&&end>start);return source.slice(start,end+3);};
  const original={allocation:extract("static void alloc_util_frame_buffers("),motion:extract("static void init_motion_estimation("),
    scale:extract("YV12_BUFFER_CONFIG *vp9_scale_if_required(")};
  const generated=makeVp9LazyUtilityFunctions(original);
  return {...proof(source,Object.keys(original).map(key=>[original[key],generated[key].generated])),functionPreimages:original};
}
export function makeVp9LazyUtilityFilter(source) {
  assert.equal(sha(source),VP9_LAZY_UTILITY_PARENTS.filter,"Exact loop-filter parent required");
  const before="  //  Make a copy of the unfiltered / processed recon buffer\n";
  const after="  /* Allocate the backup only when an actual filter search needs it. */\n"+
    "  if (vpx_realloc_frame_buffer(&cpi->last_frame_uf, cm->width, cm->height,\n"+
    "                               cm->subsampling_x, cm->subsampling_y,\n"+
    "#if CONFIG_VP9_HIGHBITDEPTH\n"+
    "                               cm->use_highbitdepth,\n"+
    "#endif\n"+
    "                               VP9_ENC_BORDER_IN_PIXELS, cm->byte_alignment,\n"+
    "                               NULL, NULL, NULL))\n"+
    "    vpx_internal_error(&cpi->common.error, VPX_CODEC_MEM_ERROR,\n"+
    "                       \"Failed to allocate last frame buffer\");\n\n"+before;
  return proof(source,[[before,after]]);
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { patchPinnedRenderContext,patchOwnedRenderContext } from "../images/resvg-source/render-context-patch.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
test("existing max_bbox is in parent space: a visible pixel can be clipped after changing isolated-layer origin",()=>{
  const bounds={top:-320,bottom:320},parentOrigin=-320,visibleParentPixel=64,childPixel=visibleParentPixel-parentOrigin;
  assert.ok(visibleParentPixel>=bounds.top&&visibleParentPixel<bounds.bottom);
  assert.equal(childPixel,384);assert.equal(childPixel>=bounds.top&&childPixel<bounds.bottom,false);
  const childBounds={top:bounds.top-parentOrigin,bottom:bounds.bottom-parentOrigin};
  assert.ok(childPixel>=childBounds.top&&childPixel<childBounds.bottom);
  assert.equal(childBounds.bottom-childBounds.top,bounds.bottom-bounds.top);
  for(const origin of [-640,-320,-1,0,1,320])for(const point of [-321,-320,-1,0,64,319,320]){
    const before=point>=bounds.top&&point<bounds.bottom;
    const after=point-origin>=bounds.top-origin&&point-origin<bounds.bottom-origin;
    assert.equal(after,before,"Translation preserves the exact clipping predicate, not a relaxed bound");
  }
});
test("private context patch reverses all5969 pinned source bytes and adjusts both child and mask recursion only",async()=>{
  const pin=JSON.parse(await readFile("fixtures/source/resvg-render-3495d870-preimage.json"));
  const bytes=gunzipSync(Buffer.from(pin.gzipBase64,"base64"),{maxOutputLength:131072});assert.equal(bytes.length,5969);assert.equal(sha(bytes),pin.sha256);
  const result=patchPinnedRenderContext(bytes);assert.equal(result.proof.edits,3);assert.equal(result.proof.entireOriginalRestoredByRemovingOnlyPatch,true);
  assert.equal(result.proof.boundingBoxDimensionsChanged,false);assert.equal(result.proof.rootContextChanged,false);
  assert.equal(result.proof.filterParametersOrPixelKernelsChanged,false);assert.equal(result.proof.fidelityProven,false);
  assert.match(result.bytes.toString(),/render_nodes\(&group.children, &child_ctx/);
  assert.match(result.bytes.toString(),/mask::apply\(mask, &child_ctx/);
  assert.throws(()=>patchPinnedRenderContext(result.bytes),/Exact pinned/);
});
test("context source patch never accepts a broad workspace directory",async()=>{
  let ran=false;await assert.rejects(patchOwnedRenderContext({runtime:{directory:process.cwd()},filterProof:{},run(){ran=true;}}));assert.equal(ran,false);
});

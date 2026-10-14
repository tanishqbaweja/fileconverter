import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { ebmlMediaParts,expectedEbmlManifest } from "../scripts/lib/ebml-reuse-media-recipe.mjs";
const root=path.resolve(import.meta.dirname,"..");
process.env.WITHIN_EBML_REUSE_CONTROL_RECEIPT="evidence/2026-10-14T18-11-48-138Z-ebml-reuse-browser-control-executed-sources.json";
test("actual new Chrome control and old255 qualified sources join, same four glue edits/encoder/fixed heaps/quality with genuine new decoder",async()=>{
  const parts=await ebmlMediaParts(root),manifest=expectedEbmlManifest(parts);
  assert.equal(manifest.artifacts["within-mpeg2-split.wasm"],"7037563225465b6bff6f3f17eccc9a2f42033e435d3473101efb631b6736fe25");
  assert.equal(manifest.artifacts["split-encoder.wasm"],"a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.equal(manifest.aggregateWasmMemoryBytes,50331648);assert.equal(manifest.allowMemoryGrowth,false);
  assert.equal(parts.glue.edits.length,4);assert.equal(parts.glue.heapLimitsChanged,false);assert.equal(parts.glue.stackSizeChanged,false);
  assert.equal(manifest.asyncifyStorage.reservationBytes,262156);assert.equal(manifest.asyncifyStorage.maximumLeases,1);
  assert.equal(manifest.ebmlReuse.allocatorPolicyChanged,true);assert.equal(parts.control.failure,null);
  assert.equal(Object.keys(parts.baseline.sourcePins).length,255);
  let source=parts.glue.generated;for(const [before,after]of parts.glue.edits.toReversed())source=source.replace(after,before);
  assert.equal(source.length,parts.glue.generated.length-parts.glue.edits.reduce((sum,[before,after])=>sum+after.length-before.length,0));
});
test("new report inspector changes only actual decoder identity, preserving every quality/recovery assertion",async()=>{
  const parts=await ebmlMediaParts(root);assert.equal(parts.inspectorRecipe.edits.length,1);
  assert.deepEqual(parts.inspectorRecipe.edits[0],["eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c","7037563225465b6bff6f3f17eccc9a2f42033e435d3473101efb631b6736fe25"]);
  for(const token of ["ordinalSsim >= 0.98","genuineValidatedConversions: 4","retiredWorkerAbsent","NotReadableError","noPageReload"])
    assert.ok(parts.inspectorRecipe.generated.includes(token));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { patchPinnedFilterRegion,filterRegionPatch,patchOwnedCargoFilter } from "../images/resvg-source/filter-region-patch.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
const pin=JSON.parse(await readFile("fixtures/source/resvg-filter-3495d870-preimage.json"));
const original=gunzipSync(Buffer.from(pin.gzipBase64,"base64"),{maxOutputLength:131072});
test("private region patch changes only one allocation-region block in the entire exact44067-byte pinned source",()=>{
  assert.equal(original.length,44067);assert.equal(sha(original),pin.sha256);assert.equal(pin.sha256,filterRegionPatch.originalSha256);
  const result=patchPinnedFilterRegion(original);assert.equal(result.proof.entireOriginalSourceRestoredByRemovingOnlyPatch,true);
  assert.equal(result.proof.primitiveCodeOrParametersChanged,false);assert.equal(result.proof.subregionCoordinatesChanged,false);
  assert.match(result.bytes.toString(),/\.and_then\(\|r\| r.intersect\(&source_bounds\)\)/);
  assert.equal(result.proof.fidelityProven,false);assert.equal(result.proof.publicPromotion,false);
  const unchangedPrefix=original.toString().slice(0,original.toString().indexOf("    let region = filter\n"));
  assert.ok(result.bytes.toString().startsWith(unchangedPrefix));
  assert.throws(()=>patchPinnedFilterRegion(Buffer.concat([original,Buffer.from("\n")])));
  assert.throws(()=>patchPinnedFilterRegion(result.bytes),/Exact pinned/);
});
test("owned source patch refuses a repository/root path before any dependency inspection or mutation",async()=>{
  let executed=false;
  await assert.rejects(patchOwnedCargoFilter({runtime:{directory:process.cwd()},run(){executed=true;}}));
  assert.equal(executed,false);
});

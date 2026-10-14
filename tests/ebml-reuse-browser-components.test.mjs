import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { exactPatch, verifyEbmlNative, makeEbmlObservers, EBML_DECODER_SHA256 } from "../scripts/lib/ebml-reuse-browser-components.mjs";
const root = path.resolve(import.meta.dirname,"..");
test("actual new native source/artifact seal and direct/pool/packet/realloc typed indices are independently verified", async () => {
  const native = await verifyEbmlNative(root); assert.equal(native.envelope.sourceCount,93);
  assert.equal(native.functions.find(row=>row.name==="av_buffer_realloc").functionIndex,4193);
  assert.equal(native.functions.find(row=>row.name==="emscripten_builtin_malloc").functionIndex,4438);
  assert.equal(native.functions.find(row=>row.name==="av_refstruct_pool_get").functionIndex,4382);
  const generated=await makeEbmlObservers(root,native);
  assert.ok(generated.files["realloc-attempt-abort-capture.mjs"].includes(EBML_DECODER_SHA256));
  assert.ok(generated.files["realloc-composite-abort-capture.mjs"].includes("[4475,4441,4438,4443]"));
  assert.ok(generated.files["realloc-composite-abort-capture.mjs"].includes("[4474,4193]"));
  for(const [file,recipe] of Object.entries(generated.recipes)) {
    let source=recipe.generated;for(const [before,after]of recipe.edits.toReversed())source=source.replace(after,before);
    assert.equal(source,await readFile(path.join(root,"scripts/lib",file),"utf8"));
  }
});
test("source edits reject changed/ambiguous bytes, preserve one abort/scalar/header guards, never fake old binary identity", () => {
  assert.throws(()=>exactPatch("ambiguous ambiguous",[["ambiguous","changed"]]));
  assert.throws(()=>exactPatch("missing",[["other","changed"]]));
  const recipe=exactPatch("actual old ABI",[["old","new"]]);assert.equal(recipe.generated,"actual new ABI");
});

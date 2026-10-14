// Same four exact/reversible suspension edits on new original native glue.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export const REALLOC_ORIGINAL_GLUE_SHA256 = "57fab45eaf3c9a3a89b87ada328c82bde87083c15a877dc7e794a8a6c3e8925c";
export async function makeReallocAsyncifyGlue(root, source) {
  const file = "scripts/lib/asyncify-storage-glue-recipe.mjs", original = await readFile(path.join(root,file),"utf8");
  assert.equal(sha(original),"0d67de895ae2bb052fd9d1101a8723ce69f3828f8d9e1517ff75444bcfc468d0");
  const before = "c819ad21398ebf90dac4b58588969221cdcf21ef0d208492cc43c81dd923f85a";
  assert.equal(original.split(before).length,2);
  const generated = original.replace(before,REALLOC_ORIGINAL_GLUE_SHA256);
  assert.equal(generated.replace(REALLOC_ORIGINAL_GLUE_SHA256,before),original);
  const moduleSource = generated.replace(/from "(\.\/[^"\r\n]+)"/g,
    (_,name)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts/lib",name)).href)}`);
  const factory = await import("data:text/javascript;base64,"+Buffer.from(moduleSource).toString("base64"));
  const patch = factory.makeAsyncifyStorageGlue(source);
  assert.equal(patch.originalSha256,REALLOC_ORIGINAL_GLUE_SHA256); assert.equal(patch.edits.length,4);
  return { ...patch, recipeSource: { path:file, sha256:sha(original) }, generatedRecipe:moduleSource,
    recipeOnlyOriginalGlueHashChanged:true };
}

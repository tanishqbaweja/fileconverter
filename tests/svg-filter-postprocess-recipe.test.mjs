import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { makeFilterPostprocessRecipe } from "../images/resvg-source/filter-postprocess-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
test("future filter postprocessing uses a separate exact pin, verifies source-owner/two-patch receipts and retains all repeated bindgen/cap/ABI checks",async()=>{
  const sourceBytes=await readFile("images/resvg-source/postprocess-repeated-source.mjs");
  const recipe=makeFilterPostprocessRecipe({root:process.cwd(),sourceBytes});
  assert.match(recipe.source,/filter-region-raw-input.json/);assert.doesNotMatch(recipe.source,/remapped-raw-input.json/);
  assert.match(recipe.source,/owner.rawRepeatReceipt.sha256/);assert.match(recipe.source,/receipt.filterRegionPatch.patchedSha256/);
  assert.match(recipe.source,/for \(const index of \[1, 2\]\)/);assert.match(recipe.source,/Compare full bounded Wasm bytes/);
  assert.match(recipe.source,/Compare full generated glue bytes/);assert.match(recipe.source,/compareStaticAbi\(published, bounded.bytes\)/);
  assert.match(recipe.source,/boundPrivateMemory\(processed, experimentalMaximumBytes\)/);
  assert.equal(recipe.proof.maximumBytesChanged,false);assert.equal(recipe.proof.artifactAvailableOrProcessingPerformed,false);
  const runtime=await createOwnedRuntimeScratch("filter-postprocess-check-");
  try{const file=path.join(runtime.directory,"processor.mjs");await writeFile(file,recipe.source,{flag:"wx"});
    await promisify(execFile)(process.execPath,["--check",file],{env:runtime.env,windowsHide:true,timeout:10000,maxBuffer:16384});
  }finally{await runtime.close();}
  assert.throws(()=>makeFilterPostprocessRecipe({root:process.cwd(),sourceBytes:Buffer.concat([sourceBytes,Buffer.from("\n")])}));
});

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
  assert.equal(recipe.proof.maximumBytesChanged,false);assert.equal(recipe.proof.processingPerformedByRecipeGenerator,false);
  const runtime=await createOwnedRuntimeScratch("filter-postprocess-check-");
  try{const file=path.join(runtime.directory,"processor.mjs");await writeFile(file,recipe.source,{flag:"wx"});
    await promisify(execFile)(process.execPath,["--check",file],{env:runtime.env,windowsHide:true,timeout:10000,maxBuffer:16384});
  }finally{await runtime.close();}
  assert.throws(()=>makeFilterPostprocessRecipe({root:process.cwd(),sourceBytes:Buffer.concat([sourceBytes,Buffer.from("\n")])}));
});
test("actual raw filter artifact pin matches the verified six-member receipt, with no local Wasm copies retained",async()=>{
  const pin=JSON.parse(await readFile("images/resvg-source/filter-region-raw-input.json"));
  const receipt=JSON.parse(await readFile("evidence/2026-10-28T15-01-22-981Z-svg-filter-source-artifact.json"));
  assert.deepEqual(pin,receipt.inputPin);assert.equal(pin.runId,40709137070);assert.equal(pin.members.length,6);
  assert.equal(receipt.rawWasm.sha256,"424e3a7cbb5de3bed809b66c49c575d6f8fb788f923fdd69a01e985412ff4321");
  assert.equal(receipt.rawWasm.structurallyValid,true);assert.equal(receipt.rawWasm.executed,false);
  assert.equal(receipt.ownedRuntimeRemoved,true);assert.equal(receipt.localBinaryCopiesRetained,false);
  assert.deepEqual(receipt.failures,[]);assert.equal(receipt.compileProofs.length,2);
  for(const row of receipt.compileProofs){assert.equal(row.filterRegionPatch.patchedSha256,"ff98d2cf2406b01d728d84ae214c146c628b514bc94fee015ce978dbbd416191");assert.equal(row.ownedScratchRemoved,true);}
});
test("postprocess workflow is distinct, source-only, short-retention and never recompiles unchanged Rust",async()=>{
  const workflow=await readFile(".github/workflows/svg-source-filter-postprocess.yml","utf8");
  assert.match(workflow,/paths: \["\.github\/workflows\/svg-source-filter-postprocess.yml"\]/);
  assert.match(workflow,/node images\/resvg-source\/postprocess-filter-region-source.mjs/);
  assert.match(workflow,/retention-days: 1/);assert.doesNotMatch(workflow,/cargo|rustup|docker|test\.mkv/i);
  const owner=await readFile("images/resvg-source/postprocess-filter-region-source.mjs","utf8");
  assert.match(owner,/windowsHide:true/);assert.match(owner,/ownedOwnerScratchRemoved/);
});

import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { makeContextPostprocessRecipe } from "../images/resvg-source/context-postprocess-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
test("context postprocessor requires both exact patches, distinct source pin, unchanged cap/ABI/full-byte repeated-output checks",async()=>{
  const result=makeContextPostprocessRecipe({root:process.cwd(),sourceBytes:await readFile("images/resvg-source/postprocess-repeated-source.mjs")});
  assert.match(result.source,/filter-context-raw-input.json/);assert.doesNotMatch(result.source,/filter-region-raw-input.json/);
  assert.match(result.source,/receipt.renderContextPatch.patchedSha256/);assert.match(result.source,/receipt.filterRegionPatch.patchedSha256/);
  assert.match(result.source,/Compare full bounded Wasm bytes/);assert.match(result.source,/Compare full generated glue bytes/);
  assert.match(result.source,/compareStaticAbi\(published, bounded.bytes\)/);assert.equal(result.proof.maximumBytesChanged,false);
  const runtime=await createOwnedRuntimeScratch("context-processor-check-");
  try{const file=path.join(runtime.directory,"processor.mjs");await writeFile(file,result.source,{flag:"wx"});
    await promisify(execFile)(process.execPath,["--check",file],{env:runtime.env,windowsHide:true,timeout:10000,maxBuffer:16384});
  }finally{await runtime.close();}
});

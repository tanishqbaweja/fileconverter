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
test("actual context raw pin requires both independent source patches; workflow processes it without rebuilding Rust",async()=>{
  const pin=JSON.parse(await readFile("images/resvg-source/filter-context-raw-input.json"));
  const receipt=JSON.parse(await readFile("evidence/2026-10-28T18-09-01-840Z-svg-filter-source-artifact.json"));
  assert.deepEqual(pin,receipt.inputPin);assert.equal(pin.runId,40741245271);assert.equal(receipt.contextVariant,true);
  assert.equal(receipt.rawWasm.sha256,"f2d0d3ffc09fb7384e2c50ad8a332e10064089fa349bf92ea97b1222c6c6fa71");
  for(const row of receipt.compileProofs){assert.equal(row.renderContextPatch.patchedSha256,pin.renderContextPatchedSha256);assert.equal(row.filterRegionPatch.patchedSha256,"ff98d2cf2406b01d728d84ae214c146c628b514bc94fee015ce978dbbd416191");}
  assert.equal(receipt.ownedRuntimeRemoved,true);assert.equal(receipt.localBinaryCopiesRetained,false);
  const workflow=await readFile(".github/workflows/svg-context-postprocess.yml","utf8");
  assert.match(workflow,/postprocess-filter-region-source.mjs --context/);assert.match(workflow,/retention-days: 1/);
  assert.doesNotMatch(workflow,/cargo|rustup|docker|test\.mkv/i);
});

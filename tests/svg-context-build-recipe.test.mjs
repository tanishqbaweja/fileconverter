import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeContextBuildRecipes } from "../images/resvg-source/context-build-recipe.mjs";
test("context variant retains both fresh-build/byte-equality/source guards and verifies both patched Rust modules after compilation",async()=>{
  const runtime=await createOwnedRuntimeScratch("resvg-filter-owner-");
  try{
    const result=makeContextBuildRecipes({root:process.cwd(),runtime:runtime.directory,compilerBytes:await readFile("images/resvg-source/compile-candidate.mjs"),reproducerBytes:await readFile("images/resvg-source/reproduce-raw-source.mjs")});
    assert.match(result.compiler,/await patchOwnedCargoFilter/);assert.match(result.compiler,/await patchOwnedRenderContext/);
    assert.match(result.compiler,/Cargo must retain the exact context source correction/);
    assert.match(result.reproducer,/receipt.renderContextPatch.onlyOwnedFreshDependencyCheckoutChanged/);
    assert.match(result.reproducer,/Raw Wasm must compare byte-for-byte/);assert.match(result.reproducer,/secondOwnedRawAndLockRemovedAfterExactVerification/);
    assert.equal(result.proof.clipExtentDimensionsEnlarged,false);assert.equal(result.proof.sameCompilerLockAndCargoReleaseFlags,true);
    for(const [file,source]of [[result.compilerPath,result.compiler],[result.reproducerPath,result.reproducer]]){
      await writeFile(file,source,{flag:"wx"});await promisify(execFile)(process.execPath,["--check",file],{env:runtime.env,windowsHide:true,timeout:10000,maxBuffer:16384});
    }
  }finally{await runtime.close();}
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeFilterBuildRecipes,filterBuildBasePins } from "../images/resvg-source/filter-build-recipe.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
test("derived compilers fetch locked dependencies, patch only fresh owned source, verify it after compile, and require two fresh byte-identical builds",async()=>{
  const runtime=await createOwnedRuntimeScratch("resvg-filter-owner-");
  try{
    const compilerBytes=await readFile("images/resvg-source/compile-candidate.mjs"),reproducerBytes=await readFile("images/resvg-source/reproduce-raw-source.mjs");
    const generated=makeFilterBuildRecipes({root:process.cwd(),runtime:runtime.directory,compilerBytes,reproducerBytes});
    assert.match(generated.compiler,/"cargo", "fetch", "--locked", "--target", "wasm32-unknown-unknown"/);
    const patch=generated.compiler.indexOf("await patchOwnedCargoFilter"),build=generated.compiler.indexOf('await run("rustup", [...compileContract.command]');
    assert.ok(patch>0&&build>patch);assert.match(generated.compiler,/Cargo must compile the retained patched dependency/);
    assert.match(generated.reproducer,/for \(const index of \[1, 2\]\)/);
    assert.match(generated.reproducer,/assert.deepEqual\(a, b, "Raw Wasm must compare byte-for-byte/);
    assert.match(generated.reproducer,/receipt.filterRegionPatch.onlyOwnedFreshDependencyCheckoutChanged/);
    assert.match(generated.reproducer,/secondOwnedRawAndLockRemovedAfterExactVerification = true/);
    assert.equal(generated.proof.fidelityProven,false);assert.equal(generated.proof.sameCompilerLockAndCargoReleaseFlags,true);
    for(const [file,source]of [[generated.compilerPath,generated.compiler],[generated.reproducerPath,generated.reproducer]]){
      await writeFile(file,source,{flag:"wx"});
      await promisify(execFile)(process.execPath,["--check",file],{env:runtime.env,windowsHide:true,timeout:10000,maxBuffer:16384});
    }
    for(const [file,digest]of Object.entries(filterBuildBasePins))assert.equal(sha(await readFile(file)),digest);
    assert.throws(()=>makeFilterBuildRecipes({root:process.cwd(),runtime:runtime.directory,compilerBytes:Buffer.concat([compilerBytes,Buffer.from("\n")]),reproducerBytes}));
  }finally{await runtime.close();}
});
test("new build workflow is headless isolated Linux source-only, manual after exact workflow-file bootstrap, with short artifact retention",async()=>{
  const text=await readFile(".github/workflows/svg-source-filter-region.yml","utf8");
  assert.match(text,/workflow_dispatch:/);assert.match(text,/paths: \["\.github\/workflows\/svg-source-filter-region.yml"\]/);
  assert.match(text,/node images\/resvg-source\/reproduce-filter-region-source.mjs/);assert.match(text,/git diff --exit-code -- public\/engines/);
  assert.match(text,/retention-days: 1/);assert.doesNotMatch(text,/docker|test\.mkv|playwright|\bcontainer:/i);
});

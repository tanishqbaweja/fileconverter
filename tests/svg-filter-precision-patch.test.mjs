import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import ts from "typescript";
import { ESLint } from "eslint";
import test from "node:test";
import { patchPinnedFilterRegion } from "../images/resvg-source/filter-region-patch.mjs";
import { patchPinnedFilterLiveness } from "../images/resvg-source/filter-liveness-patch.mjs";
import { patchPinnedFilterPrecision,patchOwnedFilterPrecision,filterPrecisionPatch } from "../images/resvg-source/filter-precision-patch.mjs";
import { makePrecisionBuildRecipes } from "../images/resvg-source/precision-build-recipe.mjs";
import { makePrecisionPostprocessRecipe } from "../images/resvg-source/precision-postprocess-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
test("precision patch reverses the entire pinned source and leaves all original kernels and non-final dispatch available",async()=>{
  const fixture=JSON.parse(await readFile("fixtures/source/resvg-filter-3495d870-preimage.json"));
  const original=patchPinnedFilterLiveness(patchPinnedFilterRegion(gunzipSync(Buffer.from(fixture.gzipBase64,"base64"))).bytes).bytes;
  const result=patchPinnedFilterPrecision(original),source=result.bytes.toString();
  assert.equal(result.proof.patchedSha256,filterPrecisionPatch.patchedSha256);
  assert.equal(result.proof.entireOriginalSourceRestoredByRemovingOnlyPatch,true);
  assert.equal(result.proof.fixtureOrFilterParametersChanged,false);assert.equal(result.proof.publicPromotion,false);
  assert.match(source,/future.is_empty\(\) && cs == usvg::filter::ColorInterpolation::LinearRGB/);
  assert.match(source,/else \{ apply_merge\(fe, cs, region, source, &results\) \}/);
  assert.equal(source.slice(source.indexOf("fn apply_merge(")),original.toString().slice(original.toString().indexOf("fn apply_merge(")));
  assert.match(source,/bytes > 16 \* 1024 \* 1024/);assert.match(source,/try_reserve_exact\(count\)/);
  assert.match(source,/for y in 0\.\.height.min\(input_height\)/);assert.match(source,/y \* input_width \+ x/);
  assert.match(source,/if last && !linear && pixel\[3\] == 255/);
  assert.match(source,/value\[3\] < 0.0/);assert.match(source,/ColorInterpolation::SRGB\)\)/);
  assert.throws(()=>patchPinnedFilterPrecision(result.bytes));
  let ran=false;await assert.rejects(patchOwnedFilterPrecision({runtime:{directory:process.cwd()},livenessProof:{},run(){ran=true;}}));assert.equal(ran,false);
});
test("future precision processor requires exact source pin, all four patches and actual pinned-compiler tests without changing cap or ABI guards",async()=>{
  const result=makePrecisionPostprocessRecipe({root:process.cwd(),sourceBytes:await readFile("images/resvg-source/postprocess-repeated-source.mjs")});
  assert.equal(result.proof.processingPerformedByRecipeGenerator,false);assert.equal(result.proof.maximumBytesChanged,false);
  assert.equal(result.proof.exactFutureInputPin,"images/resvg-source/filter-precision-raw-input.json");
  assert.match(result.source,/receipt.filterPrecisionKernelTests.passed,4/);
  assert.match(result.source,/receipt.filterPrecisionKernelTests.compiler,compileContract.rustcVersion/);
  assert.match(result.source,/Compare full bounded Wasm bytes/);
  assert.match(result.source,/compareStaticAbi\(published, bounded.bytes\)/);
  assert.match(result.source,/sourceRepeat.filterLivenessPatch.patchedSha256/);
  const lint=await new ESLint().lintText(result.source,{filePath:"images/resvg-source/generated-precision-processor.mjs"});
  assert.deepEqual(lint.flatMap(row=>row.messages.filter(message=>message.severity===2)),[]);
  assert.deepEqual(ts.createSourceFile("processor.mjs",result.source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[]);
});
test("precision build keeps compiler/lock/Cargo flags, two fresh byte comparisons, previous proofs and numeric controls",async()=>{
  const runtime=await createOwnedRuntimeScratch("resvg-filter-owner-");
  try{
    const result=makePrecisionBuildRecipes({root:process.cwd(),runtime:runtime.directory,
      compilerBytes:await readFile("images/resvg-source/compile-candidate.mjs"),reproducerBytes:await readFile("images/resvg-source/reproduce-raw-source.mjs")});
    assert.equal(result.proof.filterPrimitivePixelKernelsUnchanged,false);
    assert.equal(result.proof.finalLinearMergePrecisionChanged,true);assert.equal(result.proof.previousPrimitiveKernelsUnchanged,true);
    assert.equal(result.proof.sameCompilerLockAndCargoReleaseFlags,true);assert.equal(result.proof.extraFloatAccumulatorMaximumBytes,16777216);
    assert.match(result.compiler,/await patchOwnedFilterPrecision/);assert.match(result.compiler,/Cargo must retain the exact high-precision final-merge/);
    assert.match(result.compiler,/"--test",path.join\(root,"images\/resvg-source\/filter-precision-kernel.rs"\)/);
    assert.match(result.reproducer,/receipt.filterPrecisionKernelTests.passed,4/);
    assert.match(result.reproducer,/Raw Wasm must compare byte-for-byte/);
    assert.match(result.reproducer,/secondOwnedRawAndLockRemovedAfterExactVerification/);
    for(const [name,source]of [["compiler.mjs",result.compiler],["reproducer.mjs",result.reproducer]])
      assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
    for(const [name,source]of [["compiler",result.compiler],["reproducer",result.reproducer]]){
      const lint=await new ESLint().lintText(source,{filePath:"images/resvg-source/generated-precision-"+name+".mjs"});
      assert.deepEqual(lint.flatMap(row=>row.messages.filter(message=>message.severity===2)),[],name);
    }
    assert.equal(path.dirname(result.compilerPath),runtime.directory);
  }finally{await runtime.close();}
});
test("compiled host numeric controls are actual Rust tests, not an image conversion or browser acceptance claim",async()=>{
  const report=JSON.parse(await readFile("evidence/2026-10-29T07-14-44-468Z-svg-precision-kernel.json"));
  assert.equal(report.compilationSucceeded,true);assert.equal(report.commands.length,2);
  for(const command of report.commands)assert.equal(command.exitCode,0);
  assert.match(report.commands[1].log,/4 passed; 0 failed; 0 ignored/);
  assert.equal(report.productionConversionTested,false);assert.equal(report.ownedRuntimeRemoved,true);assert.equal(report.publicPromotion,false);
  const workflow=await readFile(".github/workflows/svg-source-filter-precision.yml","utf8");
  assert.match(workflow,/--precision/);assert.match(workflow,/retention-days: 1/);
  assert.doesNotMatch(workflow,/docker|test\.mkv|--liveness\s*$/im);
});
test("actual precision source pin authenticates both fresh native builds and their pinned-nightly numeric controls",async()=>{
  const pin=JSON.parse(await readFile("images/resvg-source/filter-precision-raw-input.json"));
  const receipt=JSON.parse(await readFile("evidence/2026-10-29T07-26-29-039Z-svg-filter-source-artifact.json"));
  assert.deepEqual(pin,receipt.inputPin);assert.equal(receipt.precision,true);
  assert.equal(pin.runId,40834686084);assert.equal(pin.headSha,"fdd7eaf17f5239712c1b1aed1cbbdc293a09d9a5");
  assert.equal(receipt.rawWasm.sha256,"86e92aaefdb94cc56eb11df85205e92d91a2e9d5b2cef1999e6580aa0c9ba25d");
  assert.equal(receipt.compileProofs.length,2);
  for(const row of receipt.compileProofs){assert.equal(row.filterPrecisionKernelTests.passed,4);assert.equal(row.filterPrecisionPatch.patchedSha256,filterPrecisionPatch.patchedSha256);assert.equal(row.ownedScratchRemoved,true);}
  assert.deepEqual(receipt.failures,[]);assert.equal(receipt.localBinaryCopiesRetained,false);assert.equal(receipt.ownedRuntimeRemoved,true);
  const workflow=await readFile(".github/workflows/svg-precision-postprocess.yml","utf8");
  assert.match(workflow,/postprocess-filter-region-source.mjs --precision/);assert.match(workflow,/retention-days: 1/);
  assert.doesNotMatch(workflow,/cargo|rustup|docker|test\.mkv/i);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import ts from "typescript";
import { ESLint } from "eslint";
import { patchPinnedFilterRegion } from "../images/resvg-source/filter-region-patch.mjs";
import { patchPinnedFilterLiveness } from "../images/resvg-source/filter-liveness-patch.mjs";
import { patchPinnedPremultipliedTransfer,patchOwnedPremultipliedTransfer,premultipliedTransferPatch } from "../images/resvg-source/premultiplied-transfer-patch.mjs";
import { makePremultipliedBuildRecipes } from "../images/resvg-source/premultiplied-build-recipe.mjs";
import { makePremultipliedPostprocessRecipe } from "../images/resvg-source/premultiplied-postprocess-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
test("premultiplied transfer source reverses exactly, keeps multi-input loop/parameters and adds no viewport float accumulator",async()=>{
  const fixture=JSON.parse(await readFile("fixtures/source/resvg-filter-3495d870-preimage.json"));
  const original=patchPinnedFilterLiveness(patchPinnedFilterRegion(gunzipSync(Buffer.from(fixture.gzipBase64,"base64"))).bytes).bytes;
  const result=patchPinnedPremultipliedTransfer(original),source=result.bytes.toString();
  assert.equal(result.proof.patchedSha256,premultipliedTransferPatch.patchedSha256);assert.equal(result.proof.entireOriginalSourceRestoredByRemovingOnlyPatch,true);
  assert.equal(result.proof.fullViewportFloatAccumulatorIntroduced,false);assert.equal(result.proof.multiInputMergeLoopChanged,false);assert.equal(result.proof.fixtureOrFilterParametersChanged,false);
  const merge=text=>text.slice(text.indexOf('fn apply_merge('),text.indexOf('\nfn ',text.indexOf('fn apply_merge(')+4));
  const previous=merge(original.toString()),candidate=merge(source);
  assert.equal(candidate.slice(candidate.indexOf('    for input in &fe.inputs {')),previous.slice(previous.indexOf('    for input in &fe.inputs {')));
  assert.match(source,/within_convert_premultiplied\(self.data_mut\(\), true\)/);assert.match(source,/within_convert_premultiplied\(self.data_mut\(\), false\)/);
  assert.match(candidate,/if let \[input\] = fe.inputs.as_slice\(\)/);assert.doesNotMatch(source,/apply_final_linear_merge|Vec<\[f32; 4\]>/);
  assert.throws(()=>patchPinnedPremultipliedTransfer(result.bytes));let ran=false;
  await assert.rejects(patchOwnedPremultipliedTransfer({runtime:{directory:process.cwd()},livenessProof:{},run(){ran=true;}}));assert.equal(ran,false);
});
test("future premultiplied postprocessor retains exact cap/ABI/byte equality and all four native-source/numeric proofs",async()=>{
  const result=makePremultipliedPostprocessRecipe({root:process.cwd(),sourceBytes:await readFile("images/resvg-source/postprocess-repeated-source.mjs")});
  assert.equal(result.proof.maximumBytesChanged,false);assert.equal(result.proof.processingPerformedByRecipeGenerator,false);
  assert.equal(result.proof.exactFutureInputPin,"images/resvg-source/filter-premultiplied-raw-input.json");
  assert.match(result.source,/receipt.premultipliedKernelTests.passed,4/);assert.match(result.source,/receipt.premultipliedTransferPatch.fullViewportFloatAccumulatorIntroduced,false/);
  assert.match(result.source,/Compare full bounded Wasm bytes/);assert.match(result.source,/compareStaticAbi\(published, bounded.bytes\)/);
  assert.doesNotMatch(result.source,/filter-precision-raw-input.json/);
  const lint=await new ESLint().lintText(result.source,{filePath:"images/resvg-source/generated-premultiplied-processor.mjs"});
  assert.deepEqual(lint.flatMap(row=>row.messages.filter(message=>message.severity===2)),[]);
  assert.deepEqual(ts.createSourceFile("processor.mjs",result.source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[]);
});
test("new source build is pinned, independently repeated and numeric-tested without inheriting rejected blanket-float patch",async()=>{
  const runtime=await createOwnedRuntimeScratch("resvg-filter-owner-");
  try{
    const result=makePremultipliedBuildRecipes({root:process.cwd(),runtime:runtime.directory,
      compilerBytes:await readFile("images/resvg-source/compile-candidate.mjs"),reproducerBytes:await readFile("images/resvg-source/reproduce-raw-source.mjs")});
    assert.equal(result.proof.sameCompilerLockAndCargoReleaseFlags,true);assert.equal(result.proof.fullViewportFloatAccumulatorIntroduced,false);assert.equal(result.proof.extraStaticTablePayloadBytes,131072);
    assert.match(result.compiler,/await patchOwnedPremultipliedTransfer/);assert.doesNotMatch(result.compiler,/patchOwnedFilterPrecision/);
    assert.match(result.reproducer,/receipt.premultipliedKernelTests.passed,4/);assert.match(result.reproducer,/Raw Wasm must compare byte-for-byte/);
    assert.match(result.reproducer,/secondOwnedRawAndLockRemovedAfterExactVerification/);
    for(const [name,source]of [["compiler",result.compiler],["reproducer",result.reproducer]]){
      assert.deepEqual(ts.createSourceFile(name+".mjs",source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[]);
      const lint=await new ESLint().lintText(source,{filePath:"images/resvg-source/generated-premultiplied-"+name+".mjs"});
      assert.deepEqual(lint.flatMap(row=>row.messages.filter(message=>message.severity===2)),[]);
    }
  }finally{await runtime.close();}
});
test("actual host Rust tests verify opacity vectors, all table entries, unchanged opaque transfer tables and fixed cache reuse",async()=>{
  const report=JSON.parse(await readFile("evidence/2026-10-29T08-23-36-650Z-svg-premultiplied-kernel.json"));
  assert.equal(report.premultiplied,true);assert.equal(report.compilationSucceeded,true);assert.equal(report.commands.length,2);
  assert.match(report.commands[1].log,/4 passed; 0 failed; 0 ignored/);assert.equal(report.ownedRuntimeRemoved,true);assert.equal(report.publicPromotion,false);assert.equal(report.productionConversionTested,false);
  const workflow=await readFile(".github/workflows/svg-source-premultiplied-transfer.yml","utf8");
  assert.equal((workflow.match(/uses: actions\/[\w-]+@[a-f0-9]{40}/g)??[]).length,3);
  assert.match(workflow,/node-version: "24.7.0"/);assert.doesNotMatch(workflow,/docker|test\.mkv/i);
});
test("extended source verifier preserves every historical immutable run/head and the new watched source identity",async()=>{
  const source=await readFile("scripts/inspect-svg-filter-build.mjs","utf8");
  for(const name of ["region","context","liveness","precision"]){
    const pin=JSON.parse(await readFile("images/resvg-source/filter-"+name+"-raw-input.json"));
    assert.match(pin.headSha,/^[a-f0-9]{40}$/);assert.ok(source.includes(JSON.stringify(pin.headSha)),name);assert.ok(source.includes(String(pin.runId)),name);
  }
  const watch=JSON.parse(await readFile("evidence/2026-10-29-svg-premultiplied-source-watch.json"));
  assert.ok(source.includes(JSON.stringify(watch.sourceHead)));assert.ok(source.includes(String(watch.runId)));
});
test("actual source artifact authenticates both premultiplied builds, exact immutable input and pinned-nightly table tests",async()=>{
  const pin=JSON.parse(await readFile("images/resvg-source/filter-premultiplied-raw-input.json"));
  const receipt=JSON.parse(await readFile("evidence/2026-10-29T08-37-13-491Z-svg-filter-source-artifact.json"));
  assert.deepEqual(pin,receipt.inputPin);assert.equal(receipt.premultiplied,true);assert.equal(pin.runId,40842628275);
  assert.equal(receipt.rawWasm.sha256,"1df4c1453ea928d7c29e2cc9b06d3cb708d4a32438c524dd9e5e9517080e0f1b");
  for(const row of receipt.compileProofs){assert.equal(row.premultipliedKernelTests.passed,4);assert.equal(row.premultipliedTransferPatch.patchedSha256,premultipliedTransferPatch.patchedSha256);assert.equal(row.ownedScratchRemoved,true);}
  assert.equal(receipt.localBinaryCopiesRetained,false);assert.equal(receipt.ownedRuntimeRemoved,true);assert.deepEqual(receipt.failures,[]);
  const workflow=await readFile(".github/workflows/svg-premultiplied-postprocess.yml","utf8");
  assert.equal((workflow.match(/uses: actions\/[\w-]+@[a-f0-9]{40}/g)??[]).length,3);
  assert.match(workflow,/--premultiplied/);assert.doesNotMatch(workflow,/cargo|rustup|docker|test\.mkv/i);
});

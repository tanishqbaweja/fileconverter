import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { ESLint } from "eslint";
import { patchPinnedFilterRegion } from "../images/resvg-source/filter-region-patch.mjs";
import { patchPinnedFilterLiveness,patchOwnedFilterLiveness,filterLivenessPatch } from "../images/resvg-source/filter-liveness-patch.mjs";
import { makeLivenessBuildRecipes } from "../images/resvg-source/liveness-build-recipe.mjs";
import { makeLivenessPostprocessRecipe } from "../images/resvg-source/liveness-postprocess-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { assertSvgStripExperimentNotRejected } from "../scripts/lib/svg-strip-rejections.mjs";
test("lifetime patch changes only ownership around all13 input arms and merge, reversing the entire region-patched source",async()=>{
  const pin=JSON.parse(await readFile("fixtures/source/resvg-filter-3495d870-preimage.json"));
  const input=patchPinnedFilterRegion(gunzipSync(Buffer.from(pin.gzipBase64,"base64"))).bytes;
  const result=patchPinnedFilterLiveness(input);assert.equal(result.proof.patchedSha256,filterLivenessPatch.patchedSha256);
  assert.equal(result.proof.entireOriginalRestoredByRemovingOnlyPatch,true);assert.equal(result.proof.earlyReleaseArms,13);
  assert.equal(result.proof.pixelKernelsOrParametersChanged,false);assert.equal(result.proof.allocationExtentsChanged,false);
  const changed=result.bytes.toString(),original=input.toString();
  assert.equal(changed.slice(changed.indexOf("fn get_input(")),original.slice(original.indexOf("fn get_input(")),"Every original pixel-processing function must remain byte-identical");
  assert.match(changed,/Kind::Merge\(ref fe\) => apply_merge\(fe, cs, region, source, &results\)/);
  assert.match(changed,/Kind::Merge\(fe\) => fe.inputs.iter\(\).any\(named\)/);
  assert.throws(()=>patchPinnedFilterLiveness(result.bytes));
  let ran=false;await assert.rejects(patchOwnedFilterLiveness({runtime:{directory:process.cwd()},filterProof:{},run(){ran=true;}}));assert.equal(ran,false);
});
test("last-use model preserves aliasing, duplicate result names, missing names, repeated inputs and future consumers across1000 deterministic graphs",()=>{
  let seed=123456789;const random=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%n;};
  const run=(graph,prune)=>{let results=[],peak=0,uniqueTakes=0;for(let i=0;i<graph.length;i++){
    const p=graph[i],input=p.inputs.map(name=>[...results].reverse().find(r=>r.name===name)?.value??7);
    if(prune)results=results.filter(r=>graph.slice(i+1).some(p=>p.inputs.includes(r.name)));
    if(input.length===1&&!results.some(r=>r.value===input[0]))uniqueTakes++;
    const value=input.reduce((a,b)=>((a*31)^b)>>>0,i+11);results.push({name:p.name,value});peak=Math.max(peak,results.length);
  }return{value:results.at(-1)?.value,peak,uniqueTakes};};
  let lower=0;for(let g=0;g<1000;g++){
    const graph=Array.from({length:24},()=>({name:"r"+random(8),inputs:Array.from({length:random(5)},()=>"r"+random(10))}));
    const baseline=run(graph,false),candidate=run(graph,true);assert.equal(candidate.value,baseline.value);assert.ok(candidate.peak<=baseline.peak);
    if(candidate.peak<baseline.peak)lower++;
  }assert.equal(lower,1000);
});
test("lifetime build keeps exact current compiler lock release args and both fresh-build/cleanup/equality guards",async()=>{
  const runtime=await createOwnedRuntimeScratch("resvg-filter-owner-");try{
    const result=makeLivenessBuildRecipes({root:process.cwd(),runtime:runtime.directory,compilerBytes:await readFile("images/resvg-source/compile-candidate.mjs"),reproducerBytes:await readFile("images/resvg-source/reproduce-raw-source.mjs")});
    assert.match(result.compiler,/await patchOwnedFilterLiveness/);assert.match(result.compiler,/report.filterLivenessPatch.patchedSha256, "Cargo must retain/);
    assert.match(result.compiler,/Cargo must retain the exact context source correction/);assert.match(result.reproducer,/Raw Wasm must compare byte-for-byte/);
    assert.match(result.reproducer,/secondOwnedRawAndLockRemovedAfterExactVerification/);assert.ok(result.reproducer.includes(filterLivenessPatch.patchedSha256));
    assert.equal(result.proof.sameCompilerLockAndCargoReleaseFlags,true);assert.equal(result.proof.filterPrimitivePixelKernelsUnchanged,true);
    for(const [file,source]of [[result.compilerPath,result.compiler],[result.reproducerPath,result.reproducer]]){
      await writeFile(file,source,{flag:"wx"});await promisify(execFile)(process.execPath,["--check",file],{env:runtime.env,windowsHide:true,timeout:10000,maxBuffer:16384});
    }
  }finally{await runtime.close();}
});
test("future lifetime postprocessor fails closed on its own immutable source pin and all three patch proofs; cap/ABI/repetition gates retained",async()=>{
  const result=makeLivenessPostprocessRecipe({root:process.cwd(),sourceBytes:await readFile("images/resvg-source/postprocess-repeated-source.mjs")});
  assert.match(result.source,/filter-liveness-raw-input.json/);assert.doesNotMatch(result.source,/filter-context-raw-input.json/);
  for(const name of ["filterLivenessPatch","renderContextPatch","filterRegionPatch"])assert.ok(result.source.includes("receipt."+name+".patchedSha256"));
  assert.match(result.source,/sourceRepeat.filterLivenessPatch.patchedSha256/);assert.match(result.source,/inputPin.filterLivenessPatchedSha256/);
  assert.match(result.source,/Compare full bounded Wasm bytes/);assert.match(result.source,/Compare full generated glue bytes/);
  assert.match(result.source,/compareStaticAbi\(published, bounded.bytes\)/);assert.equal(result.proof.maximumBytesChanged,false);
  const lint=await new ESLint().lintText(result.source,{filePath:"images/resvg-source/generated-lifetime-processor.mjs"});
  assert.deepEqual(lint.flatMap(row=>row.messages.filter(message=>message.severity===2)),[],"Generated processor must lint too, not only parse");
  const runtime=await createOwnedRuntimeScratch("lifetime-processor-check-");try{
    const file=runtime.directory+"/processor.mjs";await writeFile(file,result.source,{flag:"wx"});
    await promisify(execFile)(process.execPath,["--check",file],{env:runtime.env,windowsHide:true,timeout:10000,maxBuffer:16384});
  }finally{await runtime.close();}
});
test("actual lifetime source pin matches authenticated full artifact verification and both fresh compiler receipts",async()=>{
  const pin=JSON.parse(await readFile("images/resvg-source/filter-liveness-raw-input.json"));
  const receipt=JSON.parse(await readFile("evidence/2026-10-28T18-50-18-183Z-svg-filter-source-artifact.json"));
  assert.deepEqual(pin,receipt.inputPin);assert.equal(pin.runId,40748064269);assert.equal(receipt.liveness,true);
  assert.equal(receipt.rawWasm.sha256,"1d67f2f0bf4aa89759ab15db23737e79a34156ef5ee6acf82557dcdc58d1f1a3");
  for(const row of receipt.compileProofs){assert.equal(row.filterLivenessPatch.patchedSha256,pin.filterLivenessPatchedSha256);assert.equal(row.renderContextPatch.patchedSha256,pin.renderContextPatchedSha256);assert.equal(row.ownedScratchRemoved,true);}
  assert.equal(receipt.localBinaryCopiesRetained,false);assert.equal(receipt.ownedRuntimeRemoved,true);assert.deepEqual(receipt.failures,[]);
  const workflow=await readFile(".github/workflows/svg-liveness-postprocess.yml","utf8");
  assert.match(workflow,/postprocess-filter-region-source.mjs --liveness/);assert.match(workflow,/retention-days: 1/);assert.doesNotMatch(workflow,/cargo|rustup|docker|test\.mkv/i);
});
test("actual repeated lifetime processor artifact retains explicit96MiB/static ABI/prior binding; changed native code is eligible not accepted",async()=>{
  const pin=JSON.parse(await readFile("images/resvg-source/filter-liveness-processed-input.json"));
  const receipt=JSON.parse(await readFile("evidence/2026-10-28T18-53-58-593Z-svg-filter-processed-artifact.json"));
  assert.deepEqual(pin,receipt.inputPin);assert.equal(pin.runId,40749099894);assert.equal(pin.filterLivenessPatchedSha256,filterLivenessPatch.patchedSha256);
  assert.equal(pin.wasmSha256,"902fc72bd6f3165e28a7982a11ff3ee12e9eabb6adb37b24459e9c7ef2be845d");
  assert.deepEqual(receipt.memory.map(row=>[row.initialPages,row.maximumPages,row.shared]),[[24,1536,false]]);
  assert.equal(receipt.staticAbi.namesAndKindsEqual,true);assert.equal(receipt.glueMatchesPriorPrivateCandidate,true);
  assert.equal(receipt.ownedRuntimeRemoved,true);assert.equal(receipt.localBinaryCopiesRetained,false);assert.deepEqual(receipt.failures,[]);
  assert.equal(receipt.browserAcceptance,false);assert.equal(receipt.wholeGoalComplete,false);
  const ledger=JSON.parse(await readFile("images/resvg-source/rejected-strip-experiments.json"));
  assert.doesNotThrow(()=>assertSvgStripExperimentNotRejected(ledger,{wasmSha256:pin.wasmSha256,centralRows:64,fixtureSha256:ledger.fixtureSha256}));
});

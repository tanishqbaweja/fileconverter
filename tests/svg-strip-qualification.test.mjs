import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeSvgEffectsDiagnostic } from "../scripts/lib/svg-effects-diagnostic-recipe.mjs";
import { makeSvgStripQualification } from "../scripts/lib/svg-strip-qualification-recipe.mjs";
import { svgStripSeamGraph,validateSvgStripSeams } from "../scripts/lib/svg-strip-validator.mjs";
test("private qualifier preserves every existing effects assertion while adding pinned worker/per-boundary/alpha gates",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const options={root:process.cwd(),runtime:runtime.directory,
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),bytes:1234,sha256:"a".repeat(64)}};
    const base=makeSvgEffectsDiagnostic(options),generated=makeSvgStripQualification(options);
    let restored=generated.suite;
    for(const [before,after]of [...generated.suiteEdits].reverse()){assert.equal(restored.split(after).length-1,1);restored=restored.replace(after,before);}
    assert.equal(restored.slice(restored.indexOf("\n")+1),base.suite);
    assert.match(generated.suite,/expect\(stripValidation.minimumSsim\).toBeGreaterThanOrEqual\(0.99\)/);
    assert.match(generated.suite,/independentlyValidatedEffects: similarity >= minimumReferenceSsim && stripValidation.passed/);
    assert.match(generated.suite,/const response = await route.fetch\(\)/);
    assert.match(generated.suite,/headers\["cross-origin-embedder-policy"\]\).toBe\("require-corp"\)/);
    assert.match(generated.suite,/route.fulfill\(\{response,headers,contentType:/);
    assert.match(generated.suite,/finally \{ await response.dispose\(\); \}/);
    assert.match(generated.driver,/Do not delay\/inflate the earliest stable blank baseline/);
    assert.match(generated.driver,/incrementalPrivateMiB <= 250/);
    assert.equal(generated.proof.publicPromotion,false);
  }finally{await runtime.close();}
});
test("all31 original6M boundaries are validated with8-row native SSIM windows, never a sampled subset",()=>{
  const graph=svgStripSeamGraph(3000,2000);assert.equal(graph.seams.length,31);assert.deepEqual(graph.seams,[...Array(31)].map((_v,i)=>(i+1)*64));
  assert.equal(graph.filter.split("ssim[").length-1,31);assert.equal(graph.filter.split("crop=3000:8").length-1,62);
  assert.throws(()=>svgStripSeamGraph(3000,2000,1));assert.throws(()=>svgStripSeamGraph(8192,8192));
});
test("validator keeps failing or missing seam scores failing, compares every alpha pixel, and launches tools hidden",async()=>{
  const cwd=process.cwd(),outputPath=path.join(cwd,"outputs","mock.png"),referencePath=path.join(cwd,"fixtures","mock.png");
  let calls=0;
  const execute=async(command,args,options)=>{
    assert.equal(command,"ffmpeg");assert.equal(options.windowsHide,true);calls++;
    if(args.includes("-filter_complex"))return{stderr:"SSIM R:1 G:1 B:1 All:0.98 (x)\nSSIM R:1 G:1 B:1 All:1.0 (x)\n"};
    return{stdout:Buffer.alloc(16*140,255)};
  };
  const result=await validateSvgStripSeams({outputPath,referencePath,width:16,height:140,execute,cwd});
  assert.equal(calls,3);assert.equal(result.passed,false);assert.equal(result.minimumSsim,0.98);assert.equal(result.alphaExact,true);
  assert.equal(result.alphaComparedPixels,2240);assert.equal(result.transparentInputCoverage,false);
  await assert.rejects(validateSvgStripSeams({outputPath,referencePath,width:16,height:140,cwd,execute:async()=>({stderr:"SSIM All:1.0"})}),/Every strip boundary/);
  let alphaCall=0;
  const mismatch=await validateSvgStripSeams({outputPath,referencePath,width:16,height:140,cwd,execute:async(_command,args)=>{
    if(args.includes("-filter_complex"))return{stderr:"SSIM All:1.0\nSSIM All:1.0"};
    const stdout=Buffer.alloc(2240,255);if(++alphaCall===2)stdout[127]=0;return{stdout};
  }});assert.equal(mismatch.passed,false);assert.equal(mismatch.alphaExact,false);
});

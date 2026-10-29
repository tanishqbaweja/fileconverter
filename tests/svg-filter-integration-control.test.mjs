import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { svgFilterIntegrationVariants } from "../scripts/lib/svg-filter-integration-variants.mjs";
import { makeSvgPrecisionIntegrationControl } from "../scripts/lib/svg-filter-precision-qualification.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { assertSvgComponentControlNotCompleted } from "../scripts/lib/svg-component-fidelity-control.mjs";
test("integration sources keep the pinned original effects scene and isolate identity and shadow with exact reversible changes",async()=>{
  const bytes=await readFile("fixtures/images/test-pattern-effects.svg"),variants=svgFilterIntegrationVariants(bytes);
  assert.deepEqual(variants.map(row=>row.name),["identity-default","effects-default","shadow-only"]);
  assert.equal(variants[1].source,bytes.toString());assert.equal(variants[1].sha256,"afebfa848cd052fcd656cfdda7605c6c191edf845087759ca3421cf44880981d");
  assert.equal(variants[0].sha256,"0e290d0d4cb82fdab82f3eba5f20c331d910b7303a994cf2f86e567f82fe2d7d");
  assert.match(variants[2].source,/<feMerge><feMergeNode in="shadow"\/><\/feMerge>/);
  for(const row of variants)assert.equal(row.source.slice(row.source.indexOf('</filter>')),bytes.toString().slice(bytes.toString().indexOf('</filter>')));
  const wrapper=await readFile("scripts/test-svg-small-fidelity-control.mjs","utf8");
  assert.match(wrapper,/integrationDiagnostics\?"listed-one-three-precision-integration-controls-no-browser"/);
  assert.match(wrapper,/Diagnostic modes are mutually exclusive/);
});
test("actual integration evidence distinguishes identity from real-chain reference quantization and never invents a missing baseline",async()=>{
  const report=JSON.parse(await readFile("evidence/2026-10-29T07-54-02-214Z-svg-precision-integration-control.json"));
  const browser=JSON.parse(await readFile(report.browserReceipt.path));
  assert.equal(report.childExit,1);assert.equal(report.diagnostic.results.length,3);assert.equal(report.diagnostic.independentlyValidatedEffects,false);
  const [identity,effects,shadow]=report.diagnostic.results;
  assert.deepEqual([identity.wholeSsim,identity.minimumBandSsim],[0.999791,0.999207]);
  assert.deepEqual([effects.wholeSsim,effects.minimumBandSsim],[0.979103,0.946037]);
  assert.deepEqual([shadow.wholeSsim,shadow.minimumBandSsim],[0.949401,0.931386]);
  const center=row=>row.pixelSamples.find(sample=>sample.x===90&&sample.y===30);
  assert.deepEqual(center(identity).referenceRgba,[29,11,17,255]);assert.deepEqual(center(identity).outputRgba,[29,11,17,255]);
  assert.deepEqual(center(effects).referenceRgba,[28,13,13,255]);assert.deepEqual(center(effects).outputRgba,[29,11,17,255]);
  assert.deepEqual(center(shadow).referenceRgba,[7,30,45,255]);assert.deepEqual(center(shadow).outputRgba,[19,30,45,255]);
  for(const row of report.diagnostic.results){assert.equal(row.pixelSamples.length,64);assert.equal(row.rgbDifference.worstPixels.length,12);assert.equal(row.rgbDifference.differenceCounts.reduce((a,b)=>a+b,0),960*540*3);assert.equal(row.alphaExact,true);}
  assert.equal(browser.blankBaseline,null);assert.equal(browser.earlyBaselineGatePassed,false);assert.equal(report.incrementalPrivateMiB,null);assert.equal(report.memoryAcceptance,false);
  assert.equal(report.ownedRuntimeRemoved,true);assert.equal(report.ownedBrowserRuntimeRemoved,true);assert.deepEqual(report.protectedOriginalBefore,report.protectedOriginalAfter);
  assert.ok(report.processCleanup.every(row=>row.status==="owned-identity-absent"));
  const ledger=JSON.parse(await readFile("images/resvg-source/rejected-strip-experiments.json"));
  const variants=svgFilterIntegrationVariants(await readFile("fixtures/images/test-pattern-effects.svg"));
  assert.throws(()=>assertSvgComponentControlNotCompleted(ledger,{nativeWasmSha256:ledger.completedPrecisionIntegrationControl.nativeWasmSha256,
    variants,integrationDiagnostics:true}),/already complete/);
});
test("integration control retains four source proofs, original gates and bounded64pixel plus12worst diagnostics collected before quality verdict",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const result=makeSvgPrecisionIntegrationControl({root:process.cwd(),runtime:runtime.directory,integrationDiagnostics:true,
      workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:128,bytes:1234,sha256:"a".repeat(64)},
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),controlTestBytes:await readFile("scripts/lib/svg-small-fidelity-test.txt"),componentSourceBytes:await readFile("fixtures/images/test-pattern-effects.svg")});
    assert.equal(result.proof.integrationDiagnostics,true);assert.equal(result.proof.allFourSourcePatchProofsRequired,true);
    assert.equal(result.proof.fullOriginal6MStressReplacement,false);assert.equal(result.proof.publicPromotion,false);
    assert.match(result.driver,/assertSvgPrecisionSourceReceipt\(receipt,pins\)/);assert.match(result.driver,/"--grep", "svg-filter-integration-control"/);
    assert.match(result.driver,/incrementalPrivateMiB <= 250/);assert.match(result.driver,/pins.experimentalMaximumBytes, 100663296/);
    assert.match(result.suite,/Array.from\(\{length:64\}/);assert.match(result.suite,/worstPixels.length>12/);
    assert.match(result.suite,/row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/);
    assert.match(result.suite,/row.alphaExact\).toBe\(true\)/);assert.match(result.suite,/timeout:45_000/);
    assert.match(result.suite,/await rm\(referencePath,\{force:true\}\);await rm\(sourcePath,\{force:true\}\)/);
    assert.doesNotMatch(result.suite,/bypassCSP|setBypassCSP|--disable-web-security/);
    for(const [name,source]of [["driver.mjs",result.driver],["suite.ts",result.suite]])
      assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
  }finally{await runtime.close();}
});

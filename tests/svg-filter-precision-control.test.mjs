import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { svgFilterPrecisionVariants } from "../scripts/lib/svg-filter-precision-variants.mjs";
import { makeSvgComponentFidelityControl,assertSvgComponentControlNotCompleted } from "../scripts/lib/svg-component-fidelity-control.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
test("filter precision variants change only reversible filter content or explicit color space, not geometry/mask/background",async()=>{
  const source=await readFile("fixtures/images/test-pattern-effects.svg"),variants=svgFilterPrecisionVariants(source);
  assert.deepEqual(variants.map(row=>row.name),["identity-default","identity-srgb","effects-srgb"]);
  const geometry=source.toString().slice(source.toString().indexOf('</filter>'));
  for(const row of variants)assert.equal(row.source.slice(row.source.indexOf('</filter>')),geometry);
  assert.equal((variants[0].source.match(/<fe[A-Z]/g)??[]).length,2);
  assert.doesNotMatch(variants[0].source,/color-interpolation-filters/);
  assert.match(variants[1].source,/<filter color-interpolation-filters="sRGB"/);
  assert.equal((variants[2].source.match(/<fe[A-Z]/g)??[]).length,7);
  assert.throws(()=>svgFilterPrecisionVariants(Buffer.concat([source,Buffer.from(" ")])));
});
test("actual identity-default quantization evidence is retained as a failure, not hidden by passing sRGB variants",async()=>{
  const report=JSON.parse(await readFile("evidence/2026-10-29T07-00-58-722Z-svg-filter-precision-control.json"));
  assert.equal(report.childExit,1);assert.equal(report.diagnostic.results.length,3);
  assert.equal(report.diagnostic.independentlyValidatedEffects,false);
  assert.equal(report.fullOriginal6MStressReplacement,false);assert.equal(report.memoryAcceptance,false);assert.equal(report.publicPromotion,false);
  const [identity,srgb,effects]=report.diagnostic.results;
  assert.deepEqual([identity.wholeSsim,identity.minimumBandSsim],[0.984086,0.948239]);
  assert.deepEqual([srgb.wholeSsim,srgb.minimumBandSsim],[0.999791,0.999207]);
  assert.deepEqual([effects.wholeSsim,effects.minimumBandSsim],[0.999701,0.999062]);
  assert.deepEqual(identity.referencePin,srgb.referencePin);
  assert.equal(identity.pixelSamples.length,16);
  for(const sample of identity.pixelSamples)assert.deepEqual(sample.outputRgba.slice(0,3),sample.predicted8BitLinearRoundTripRgb);
  assert.equal(identity.pixelSamples.filter(sample=>JSON.stringify(sample.referenceRgba)!==JSON.stringify(sample.outputRgba)).length,7);
  for(const row of [srgb,effects])for(const sample of row.pixelSamples)assert.deepEqual(sample.outputRgba,sample.referenceRgba);
  for(const row of report.diagnostic.results)assert.equal(row.alphaExact,true);
  assert.equal(report.ownedRuntimeRemoved,true);assert.equal(report.ownedBrowserRuntimeRemoved,true);
  assert.ok(report.processCleanup.every(row=>row.status==="owned-identity-absent"));
  assert.deepEqual(report.protectedOriginalBefore,report.protectedOriginalAfter);
  const ledger=JSON.parse(await readFile("images/resvg-source/rejected-strip-experiments.json"));
  const variants=svgFilterPrecisionVariants(await readFile("fixtures/images/test-pattern-effects.svg"));
  assert.throws(()=>assertSvgComponentControlNotCompleted(ledger,{nativeWasmSha256:ledger.completedFilterPrecisionControl.nativeWasmSha256,variants,filterPrecision:true}),/already complete/);
  assert.doesNotThrow(()=>assertSvgComponentControlNotCompleted(ledger,{nativeWasmSha256:"b".repeat(64),variants,filterPrecision:true}));
});
test("precision browser recipe preserves gates and matching independent references, with bounded center pixel evidence",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const result=makeSvgComponentFidelityControl({root:process.cwd(),runtime:runtime.directory,filterPrecision:true,
      workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:128,bytes:1234,sha256:"a".repeat(64)},
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),controlTestBytes:await readFile("scripts/lib/svg-small-fidelity-test.txt"),
      componentSourceBytes:await readFile("fixtures/images/test-pattern-effects.svg")});
    assert.equal(result.proof.filterPrecisionControl,true);assert.equal(result.proof.publicPromotion,false);
    assert.equal(result.proof.fullOriginal6MStressReplacement,false);assert.equal(result.proof.eachVariantHasItsOwnMatchingChromiumReference,true);
    assert.match(result.driver,/"--grep", "svg-filter-precision-control"/);
    assert.match(result.driver,/incrementalPrivateMiB <= 250/);assert.match(result.driver,/pins.experimentalMaximumBytes, 100663296/);
    assert.match(result.suite,/test\("svg-filter-precision-control"/);assert.match(result.suite,/for\(const mode of \["full"\]\)/);
    assert.match(result.suite,/row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/);
    assert.match(result.suite,/predicted8BitLinearRoundTripRgb/);assert.match(result.suite,/Array.from\(\{length:16\}/);
    assert.match(result.suite,/await rm\(referencePath,\{force:true\}\);await rm\(sourcePath,\{force:true\}\)/);
    assert.doesNotMatch(result.suite,/bypassCSP|setBypassCSP|--disable-web-security/);
    for(const [name,text]of [["driver.mjs",result.driver],["suite.ts",result.suite]])
      assert.deepEqual(ts.createSourceFile(name,text,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
  }finally{await runtime.close();}
});

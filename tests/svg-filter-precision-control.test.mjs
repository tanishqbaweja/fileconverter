import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { svgFilterPrecisionVariants } from "../scripts/lib/svg-filter-precision-variants.mjs";
import { makeSvgComponentFidelityControl } from "../scripts/lib/svg-component-fidelity-control.mjs";
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { svgFilterIntegrationVariants } from "../scripts/lib/svg-filter-integration-variants.mjs";
import { makeSvgPrecisionIntegrationControl } from "../scripts/lib/svg-filter-precision-qualification.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
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

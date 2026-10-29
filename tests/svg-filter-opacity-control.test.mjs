import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { svgFilterOpacityVariants,makeSvgPrecisionOpacityControl } from "../scripts/lib/svg-filter-opacity-control.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
test("opacity sources isolate identical flood/composite geometry at1/0.65/0.9 with no blur or offset",async()=>{
  const bytes=await readFile("fixtures/images/test-pattern-effects.svg"),variants=svgFilterOpacityVariants(bytes);
  assert.deepEqual(variants.map(row=>row.changes.opacity),[1,0.65,0.9]);
  const geometry=bytes.toString().slice(bytes.toString().indexOf('</filter>'));
  for(const row of variants){assert.equal(row.source.slice(row.source.indexOf('</filter>')),geometry);assert.doesNotMatch(row.source,/<feGaussianBlur|<feOffset/);assert.match(row.source,/in2="SourceAlpha" operator="in"/);assert.match(row.source,/flood-color="#08121d"/);}
  assert.throws(()=>svgFilterOpacityVariants(Buffer.concat([bytes,Buffer.from(" ")])));
});
test("opacity recipe preserves bounded pixel evidence, four-proof lineage, real UI/IO, cleanup and original acceptance gates",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const result=makeSvgPrecisionOpacityControl({root:process.cwd(),runtime:runtime.directory,
      workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:128,bytes:1234,sha256:"a".repeat(64)},
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),controlTestBytes:await readFile("scripts/lib/svg-small-fidelity-test.txt"),componentSourceBytes:await readFile("fixtures/images/test-pattern-effects.svg")});
    assert.equal(result.proof.opacityDiagnostics,true);assert.equal(result.proof.allFourSourcePatchProofsRequired,true);assert.equal(result.proof.publicPromotion,false);assert.equal(result.proof.fullOriginal6MStressReplacement,false);
    assert.match(result.driver,/"--grep", "svg-filter-opacity-control"/);assert.match(result.driver,/assertSvgPrecisionSourceReceipt\(receipt,pins\)/);
    assert.match(result.driver,/incrementalPrivateMiB <= 250/);assert.match(result.driver,/pins.experimentalMaximumBytes, 100663296/);
    assert.match(result.suite,/Array.from\(\{length:64\}/);assert.match(result.suite,/worstPixels.length>12/);
    assert.match(result.suite,/row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/);assert.match(result.suite,/row.alphaExact\).toBe\(true\)/);
    assert.match(result.suite,/await rm\(referencePath,\{force:true\}\);await rm\(sourcePath,\{force:true\}\)/);
    for(const [name,source]of [["driver.mjs",result.driver],["suite.ts",result.suite]])assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
  }finally{await runtime.close();}
});

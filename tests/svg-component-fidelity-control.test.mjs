import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { svgComponentVariants,makeSvgComponentFidelityControl } from "../scripts/lib/svg-component-fidelity-control.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
test("component sources have pinned reversible filter, geometry and rounded-rect ablations only",async()=>{
  const bytes=await readFile("fixtures/images/test-pattern-effects.svg"),variants=svgComponentVariants(bytes);
  assert.deepEqual(variants.map(row=>row.name),["no-filter","background-only","no-filter-square"]);
  assert.doesNotMatch(variants[0].source,/<g filter=/);assert.match(variants[0].source,/<rect[^>]+rx="10"/);
  assert.doesNotMatch(variants[1].source,/<g mask=/);assert.match(variants[1].source,/fill="url\(#background\)"/);
  assert.doesNotMatch(variants[2].source,/<rect[^>]+rx=/);assert.match(variants[2].source,/<ellipse[^>]+rx=/);
  assert.throws(()=>svgComponentVariants(Buffer.concat([bytes,Buffer.from(" ")])));
  const changed=Buffer.from(bytes);changed[100]^=1;assert.throws(()=>svgComponentVariants(changed));
});
test("component browser recipe retains production full worker, exact alpha/all band gates and owned finally cleanup",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const result=makeSvgComponentFidelityControl({root:process.cwd(),runtime:runtime.directory,
      workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:128,bytes:1234,sha256:"a".repeat(64)},
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),controlTestBytes:await readFile("scripts/lib/svg-small-fidelity-test.txt"),
      componentSourceBytes:await readFile("fixtures/images/test-pattern-effects.svg")});
    assert.equal(result.proof.diagnosticOnly,true);assert.equal(result.proof.publicPromotion,false);
    assert.equal(result.proof.fullOriginal6MStressReplacement,false);assert.equal(result.proof.componentVariants.length,3);
    assert.match(result.driver,/incrementalPrivateMiB <= 250/);assert.match(result.driver,/pins.experimentalMaximumBytes, 100663296/);
    assert.match(result.driver,/"--grep", "svg-component-fidelity-control"/);
    assert.match(result.suite,/for\(const mode of \["full"\]\)/);
    assert.match(result.suite,/row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/);
    assert.match(result.suite,/row.alphaExact\).toBe\(true\)/);assert.match(result.suite,/timeout:45_000/);
    assert.match(result.suite,/await rm\(referencePath,\{force:true\}\);await rm\(sourcePath,\{force:true\}\)/);
    assert.match(result.suite,/finally\{await referencePage.close\(\);\}/);
    assert.ok(result.suite.indexOf('await save();expect(results.length).toBe(3)')>result.suite.indexOf('results.push({component:'));
    assert.doesNotMatch(result.suite,/bypassCSP|setBypassCSP|--disable-web-security/);
    for(const [name,source]of [["driver.mjs",result.driver],["suite.ts",result.suite]])
      assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
  }finally{await runtime.close();}
});

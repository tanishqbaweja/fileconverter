import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { makeSvgSmallFidelityControl } from "../scripts/lib/svg-small-fidelity-control.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
test("paired small control compares production full/nativePNG and strip/streamedPNG on exact same native source; never substitutes for6M gates",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const result=makeSvgSmallFidelityControl({root:process.cwd(),runtime:runtime.directory,
      workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:128,bytes:1234,sha256:"a".repeat(64)},
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),controlTestBytes:await readFile("scripts/lib/svg-small-fidelity-test.txt")});
    assert.equal(result.proof.diagnosticOnly,true);assert.equal(result.proof.fullOriginal6MStressReplacement,false);
    assert.equal(result.proof.publicPromotion,false);assert.match(result.driver,/paired-svg-fidelity-control/);
    assert.match(result.driver,/pins.experimentalMaximumBytes, 100663296/);assert.match(result.driver,/incrementalPrivateMiB <= 250/);
    assert.match(result.suite,/if\(!svgDiagnosticStripMode\)\{await route.continue\(\);return;\}/);
    assert.match(result.suite,/for\(const mode of \["full","strip"\]\)/);
    assert.match(result.suite,/expect\(results\[0\].rgbaSha256\).toBe\(results\[1\].rgbaSha256\)/);
    assert.match(result.suite,/row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/);
    assert.match(result.suite,/sourceBytes.length\).toBe\(11194\)/);assert.match(result.suite,/timeout:45_000/);
    for(const [name,source]of [["driver.mjs",result.driver],["suite.ts",result.suite]])
      assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
  }finally{await runtime.close();}
});

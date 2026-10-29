import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makePremultipliedSvgQualification } from "../scripts/lib/svg-premultiplied-qualification.mjs";
import { makeSvgStripLifecycleQualification } from "../scripts/lib/svg-strip-lifecycle-qualification.mjs";
test("strip lifecycle adds real row cancellation, destination fault and same-page retries without removing original6M gates",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const options={root:process.cwd(),runtime:runtime.directory,
      workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:128,bytes:1234,sha256:"a".repeat(64)},
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),lifecycleRecoveryBytes:await readFile("scripts/lib/svg-strip-lifecycle-recovery.txt")};
    const base=makePremultipliedSvgQualification(options),result=makeSvgStripLifecycleQualification(options);
    let restored=result.suite;for(const [before,after]of [...result.lifecycleSuiteEdits].reverse()){
      assert.equal(restored.split(after).length-1,1);restored=restored.replace(after,before);
    }
    assert.equal(restored,base.suite);
    assert.equal(result.proof.allFourSourcePatchProofsRequired,true);assert.equal(result.proof.stripLifecycleDiagnostic,true);
    assert.equal(result.proof.original6MInputReferenceQualityAndAll31BandsRetained,true);assert.equal(result.proof.publicPromotion,false);
    assert.match(result.suite,/phase\?\.startsWith\("Rasterizing SVG strips:"\)/);
    assert.match(result.suite,/\!\(rows > 0\).*\!\(bytes > 0\)/);
    assert.match(result.suite,/button.click\(\)/);assert.match(result.suite,/&fault=write/);
    assert.match(result.suite,/imageWorkingBytes\).toBe\(0\)/);assert.match(result.suite,/peakImageWorkingBytes\).toBeGreaterThan\(0\)/);
    assert.match(result.suite,/timeOrigin\)\)\.toBe\(timeOriginBefore\)/);
    assert.match(result.suite,/getFileHandle\("svg-effects-6m.png"\)/);
    assert.match(result.suite,/stripValidation.minimumSsim\).toBeGreaterThanOrEqual\(0.99\)/);
    assert.match(result.suite,/stripValidation.alphaExact\).toBe\(true\)/);
    assert.match(result.suite,/observations: 6 \+ Math.ceil\(expectedHeight \/ 128\)/);
    assert.match(result.suite,/timeout: 45_000/);assert.match(result.driver,/incrementalPrivateMiB <= 250/);
    assert.match(result.driver,/pins.experimentalMaximumBytes, 100663296/);
    assert.match(result.driver,/lifecycleRecovery = \[\]/);assert.match(result.driver,/65536/);
    assert.match(result.driver,/Do not delay\/inflate the earliest stable blank baseline/);
    assert.doesNotMatch(result.suite,/bypassCSP|setBypassCSP|--disable-web-security/);
    for(const [name,source]of [["driver.mjs",result.driver],["suite.ts",result.suite]])
      assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
  }finally{await runtime.close();}
});

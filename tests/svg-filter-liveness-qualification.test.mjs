import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeFilterLivenessSvgQualification } from "../scripts/lib/svg-filter-liveness-qualification.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { filterLivenessPatch } from "../images/resvg-source/filter-liveness-patch.mjs";
test("lifetime qualification binds all3 source proofs/new exact4member artifact and retains all original quality/resource gates",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");try{
    const options={root:process.cwd(),runtime:runtime.directory,
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:64,bytes:1234,sha256:"a".repeat(64)}};
    const result=makeFilterLivenessSvgQualification(options);
    assert.match(result.suite,/filter-liveness-processed-input.json/);assert.doesNotMatch(result.suite,/filter-context-processed-input.json/);
    assert.match(result.driver,/filter-liveness-raw-input.json/);assert.doesNotMatch(result.driver,/filter-context-raw-input.json/);
    assert.match(result.driver,/two-pinned-liveness-source-postprocessing-passes-byte-identical-not-browser-acceptance/);
    for(const name of ["filterLivenessPatch","renderContextPatch","filterRegionPatch"])assert.ok(result.driver.includes("receipt."+name+".patchedSha256"));
    assert.ok(result.driver.includes(filterLivenessPatch.patchedSha256));assert.match(result.driver,/assert.equal\(pins.experimentalMaximumBytes, 100663296\)/);
    assert.match(result.driver,/incrementalPrivateMiB <= 250/);assert.match(result.driver,/earliest stable blank baseline/);
    assert.match(result.suite,/stripValidation.minimumSsim\).toBeGreaterThanOrEqual\(0.99\)/);assert.match(result.suite,/stripValidation.alphaExact\).toBe\(true\)/);
    assert.match(result.suite,/\{ timeout: 45_000 \}/);assert.match(result.suite,/pollTimeoutMs:45000/);assert.match(result.suite,/throw primary;/);
    assert.match(result.suite,/headers\["cross-origin-embedder-policy"\]\).toBe\("require-corp"\)/);
    assert.equal(result.proof.allExistingFidelityMemoryPrivacyCleanupAssertionsRetained,true);assert.equal(result.proof.publicPromotion,false);
  }finally{await runtime.close();}
});

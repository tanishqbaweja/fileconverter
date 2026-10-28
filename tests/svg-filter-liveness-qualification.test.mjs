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
test("actual genuine31second output remains rejected even though wholeSSIM and one-run process-tree memory numbers pass",async()=>{
  const report=JSON.parse(await readFile("evidence/2026-10-28T19-15-52-782Z-source-svg-browser.json"));
  const actual=report.stressRuns[0].result;
  assert.equal(report.stats.expected,0);assert.equal(report.stats.unexpected,1);assert.equal(report.stats.skipped,2);
  assert.equal(actual.width,3000);assert.equal(actual.height,2000);assert.equal(actual.outputBytes,2932111);
  assert.equal(actual.metrics.elapsedMs,31156.22000002861);assert.equal(actual.metrics.svgStripPilot.completedRows,2000);
  assert.ok(actual.fidelity.actualSsim>=0.99);assert.equal(actual.stripValidation.scores.length,31);
  assert.equal(actual.stripValidation.minimumSsim,0.979671);assert.ok(actual.stripValidation.minimumSsim<0.99);
  assert.equal(actual.stripValidation.alphaExact,true);assert.equal(actual.independentlyValidatedEffects,false);
  assert.equal(actual.stripValidation.passed,false);assert.equal(actual.stripValidation.transparentInputCoverage,false);
  assert.ok(actual.stripValidation.seamRows.some((y,i)=>y%128!==0&&actual.stripValidation.scores[i]<0.99));
  assert.equal(report.memory.incrementalPrivateMiB,227.87109375);assert.equal(report.memory.unavailableSamples,0);
  assert.equal(report.wholeGoalComplete,false);assert.equal(report.publicEngineReplacement,false);
  assert.equal(report.ownedRuntimeRemoved,true);assert.ok(report.processCleanup.every(row=>row.status==="owned-identity-absent"));
  assert.deepEqual(report.protectedOriginalBefore,report.protectedOriginalAfter);
});

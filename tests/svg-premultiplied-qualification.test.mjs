import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { assertSvgPremultipliedSourceReceipt,makePremultipliedSvgQualification,makeSvgSmallPremultipliedControl } from "../scripts/lib/svg-premultiplied-qualification.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { filterRegionPatch } from "../images/resvg-source/filter-region-patch.mjs";
import { renderContextPatch } from "../images/resvg-source/render-context-patch.mjs";
import { filterLivenessPatch } from "../images/resvg-source/filter-liveness-patch.mjs";
import { premultipliedTransferPatch } from "../images/resvg-source/premultiplied-transfer-patch.mjs";
import { createHash } from "node:crypto";
test("actual new native small pair passes unchanged quality gates and has terminal cleanup without granting large-profile acceptance",async()=>{
  const compact=JSON.parse(await readFile("evidence/2026-10-29-svg-small-premultiplied-terminal.json"));
  const parent=JSON.parse(await readFile(compact.parentReceipt));
  const bytes=await readFile(compact.browserReceipt.path),browser=JSON.parse(bytes);
  assert.equal(bytes.length,compact.browserReceipt.bytes);assert.equal(createHash("sha256").update(bytes).digest("hex"),compact.browserReceipt.sha256);
  assert.equal(parent.childExit,0);assert.equal(browser.runnerExitCode,0);assert.equal(browser.sourcePremultipliedTransferCandidate,true);
  assert.deepEqual(browser.forbiddenRequests,[]);assert.equal(browser.forbiddenRequestOverflow,false);
  const results=parent.diagnostic.results;assert.equal(results.length,2);assert.equal(results[0].rgbaSha256,results[1].rgbaSha256);
  for(const row of results){assert.ok(row.wholeSsim>=0.99);assert.ok(row.minimumBandSsim>=0.99);assert.equal(row.alphaExact,true);}
  assert.equal(parent.incrementalPrivateMiB,(browser.memory.peak.privateBytes-browser.blankBaseline.privateBytes)/1048576);
  assert.equal(parent.incrementalPrivateMiB,compact.incrementalPrivateMiB);assert.equal(browser.memory.unavailableSamples,0);
  assert.deepEqual(parent.protectedOriginalBefore,parent.protectedOriginalAfter);assert.equal(parent.ownedRuntimeRemoved,true);assert.equal(browser.ownedRuntimeRemoved,true);
  assert.ok(browser.processCleanup.every(row=>row.status==="owned-identity-absent"));
  assert.equal(parent.memoryAcceptance,false);assert.equal(compact.publicPromotion,false);assert.equal(compact.wholeGoalComplete,false);
  const ledger=JSON.parse(await readFile("images/resvg-source/rejected-strip-experiments.json"));
  assert.equal(ledger.completedPremultipliedPairedSmallControl.nativeWasmSha256,compact.nativeWasmSha256);
});
test("premultiplied assertion requires its own four proofs and rejects rejected-float lineage, changed maximum or workspace semantics",async()=>{
  const pins=JSON.parse(await readFile("images/resvg-source/filter-premultiplied-processed-input.json"));
  const receipt={filterRegionPatch,renderContextPatch,filterLivenessPatch,premultipliedTransferPatch,sourcePremultipliedTransferChanged:true};
  assert.doesNotThrow(()=>assertSvgPremultipliedSourceReceipt(receipt,pins));
  for(const field of ["filterRegionPatch","renderContextPatch","filterLivenessPatch","premultipliedTransferPatch"]){const changed=structuredClone(receipt);delete changed[field];assert.throws(()=>assertSvgPremultipliedSourceReceipt(changed,pins));}
  for(const [field,value]of [["premultipliedTransferPatchedSha256","a".repeat(64)],["premultipliedKernelSha256","b".repeat(64)],["experimentalMaximumBytes",201326592],["sourceRepeatPin","images/resvg-source/filter-precision-raw-input.json"]])
    assert.throws(()=>assertSvgPremultipliedSourceReceipt(receipt,{...pins,[field]:value}));
  assert.throws(()=>assertSvgPremultipliedSourceReceipt({...receipt,premultipliedTransferPatch:{...premultipliedTransferPatch,fullViewportFloatAccumulatorIntroduced:true}},pins));
});
test("first original6M result preserves harness failure separately from passing independent fidelity; exact viewport reads remain mandatory",async()=>{
  const c=JSON.parse(await readFile("evidence/2026-10-29-svg-premultiplied-6m-first-terminal.json"));
  const b=JSON.parse(await readFile(c.browserReceipt));const r=b.stressRuns[0].result;
  assert.equal(b.runnerExitCode,1);assert.deepEqual([b.stats.expected,b.stats.unexpected,b.stats.skipped],[0,1,2]);
  assert.equal(r.outputBytes,c.firstOutputBytes);assert.equal(r.fidelity.actualSsim,c.wholeSsim);
  assert.equal(r.stripValidation.minimumSsim,c.minimumAll31BandsSsim);assert.equal(r.stripValidation.scores.length,31);
  assert.equal(r.stripValidation.alphaExact,true);assert.equal(r.stripValidation.passed,true);
  assert.equal(r.metrics.svgMemoryObservation.observations,6+Math.ceil(2000/128));
  assert.equal(r.metrics.svgMemoryObservation.unavailableObservations,0);
  assert.equal(r.metrics.svgStripPilot.renderedViewports,16);assert.equal(r.metrics.svgStripPilot.releasedViewports,16);
  assert.equal(c.publicPromotion,false);assert.equal(c.wholeGoalComplete,false);
});
test("three actual large functional passes cannot substitute an earlier baseline for missing repeat-memory acceptance",async()=>{
  const c=JSON.parse(await readFile("evidence/2026-10-29-svg-premultiplied-6m-repeat-terminal.json"));
  const b=JSON.parse(await readFile(c.browserReceipt));
  assert.deepEqual([b.stats.expected,b.stats.unexpected,b.stats.skipped,b.stats.flaky],[3,0,0,0]);
  assert.equal(b.runnerExitCode,0);assert.equal(b.earlyBaselineGatePassed,false);assert.equal(b.blankBaseline,null);
  assert.equal(b.memory.incrementalPrivateMiB,null);assert.equal(c.incrementalPrivateMiB,null);assert.equal(c.memoryAcceptance,false);
  assert.equal(b.memory.validSamples,c.validNativeSamples);assert.equal(b.memory.unavailableSamples,c.unavailableNativeSamples);
  assert.equal(b.memory.peak.privateBytes,c.peakCompleteTreePrivateBytes);
  for(const [index,row]of b.stressRuns.entries()){
    const r=row.result;assert.equal(r.fidelity.actualSsim,c.runs[index].wholeSsim);
    assert.equal(r.stripValidation.minimumSsim,c.runs[index].minimum31BandSsim);assert.equal(r.stripValidation.scores.length,31);
    assert.equal(r.stripValidation.alphaComparedPixels,6000000);assert.equal(r.stripValidation.alphaExact,true);
    assert.equal(r.metrics.svgMemoryObservation.observations,22);assert.equal(r.metrics.svgStripPilot.releasedViewports,16);
    assert.equal(r.metrics.pendingOperations,0);assert.equal(r.metrics.queuedBytes,0);
  }
  assert.ok(b.failures.some(value=>value.includes("earliest stable blank baseline")));
  assert.deepEqual(b.protectedOriginalBefore,b.protectedOriginalAfter);assert.equal(b.ownedRuntimeRemoved,true);
  assert.ok(b.processCleanup.every(row=>row.status==="owned-identity-absent"));
  assert.equal(c.publicPromotion,false);assert.equal(c.wholeGoalComplete,false);
});
test("new native browser recipes retain exact large/small scene gates and production IO rather than weaker diagnostic inputs",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const options={root:process.cwd(),runtime:runtime.directory,
      workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:128,bytes:1234,sha256:"a".repeat(64)},
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),controlTestBytes:await readFile("scripts/lib/svg-small-fidelity-test.txt")};
    for(const make of [makePremultipliedSvgQualification,makeSvgSmallPremultipliedControl]){
      const result=make(options);assert.equal(result.proof.allFourSourcePatchProofsRequired,true);assert.equal(result.proof.publicPromotion,false);
      assert.match(result.driver,/assertSvgPremultipliedSourceReceipt\(receipt,pins\)/);assert.match(result.driver,/filter-premultiplied-raw-input.json/);
      assert.match(result.driver,/incrementalPrivateMiB <= 250/);assert.match(result.driver,/pins.experimentalMaximumBytes, 100663296/);
      assert.match(result.suite,/filter-premultiplied-processed-input.json/);assert.doesNotMatch(result.suite,/bypassCSP|setBypassCSP|--disable-web-security/);
      if(make===makeSvgSmallPremultipliedControl){assert.equal(result.proof.fullOriginal6MStressReplacement,false);assert.ok(result.suite.endsWith(options.controlTestBytes.toString()));
        assert.match(result.driver,/"--grep", "paired-svg-fidelity-control"/);assert.match(result.suite,/row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/);assert.match(result.suite,/expect\(results\[0\].rgbaSha256\).toBe\(results\[1\].rgbaSha256\)/);
      }else assert.match(result.driver,/"--grep", "6m-effects-repeat-\[123\]"/);
      for(const [name,source]of [["driver.mjs",result.driver],["suite.ts",result.suite]])assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
    }
  }finally{await runtime.close();}
});

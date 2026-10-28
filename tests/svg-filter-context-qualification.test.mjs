import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeFilterContextSvgQualification } from "../scripts/lib/svg-filter-context-qualification.mjs";
import { renderContextPatch } from "../images/resvg-source/render-context-patch.mjs";
test("context variant binds both source patches and all4 artifact members without changing original acceptance gates",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const options={root:process.cwd(),runtime:runtime.directory,
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),bytes:1234,sha256:"a".repeat(64)}};
    const result=makeFilterContextSvgQualification(options);
    assert.match(result.suite,/filter-context-processed-input.json/);assert.doesNotMatch(result.suite,/filter-region-processed-input.json/);
    assert.match(result.driver,/\[pins.ownerReceiptMember, pins.receiptMember, pins.wasmMember, pins.glueMember\]/);
    assert.match(result.driver,/two-pinned-context-source-postprocessing-passes-byte-identical-not-browser-acceptance/);
    assert.match(result.driver,/filter-context-raw-input.json/);assert.doesNotMatch(result.driver,/filter-region-raw-input.json/);
    assert.ok(result.driver.includes(renderContextPatch.patchedSha256));
    assert.match(result.driver,/assert.equal\(receipt.sourceContextCoordinatesChanged, true\)/);
    assert.match(result.driver,/assert.equal\(pins.experimentalMaximumBytes, 100663296\)/);
    assert.match(result.driver,/incrementalPrivateMiB <= 250/);assert.match(result.driver,/earliest stable blank baseline/);
    assert.match(result.suite,/stripValidation.minimumSsim\).toBeGreaterThanOrEqual\(0.99\)/);
    assert.match(result.suite,/stripValidation.alphaExact\).toBe\(true\)/);
    assert.match(result.suite,/headers\["cross-origin-embedder-policy"\]\).toBe\("require-corp"\)/);
    assert.equal(result.proof.allExistingFidelityMemoryPrivacyCleanupAssertionsRetained,true);assert.equal(result.proof.publicPromotion,false);
  }finally{await runtime.close();}
});
test("actual context pin equals authenticated inspection and keeps exact96MiB max and prior binding",async()=>{
  const pin=JSON.parse(await readFile("images/resvg-source/filter-context-processed-input.json"));
  const report=JSON.parse(await readFile("evidence/2026-10-28T18-17-23-521Z-svg-filter-processed-artifact.json"));
  assert.deepEqual(pin,report.inputPin);assert.equal(pin.runId,40742766594);assert.equal(pin.experimentalMaximumBytes,100663296);
  assert.equal(pin.wasmSha256,"51a482a6f471251fa52c94920da0835b51f1b06c7117d1827ebb7f8abca2a5ff");
  assert.equal(pin.renderContextPatchedSha256,renderContextPatch.patchedSha256);
  assert.deepEqual(report.memory.map(row=>[row.initialPages,row.maximumPages,row.shared]),[[24,1536,false]]);
  assert.equal(report.glueMatchesPriorPrivateCandidate,true);assert.equal(report.staticAbi.namesAndKindsEqual,true);
  assert.equal(report.ownedRuntimeRemoved,true);assert.equal(report.localBinaryCopiesRetained,false);
  assert.equal(report.browserAcceptance,false);assert.deepEqual(report.failures,[]);
});

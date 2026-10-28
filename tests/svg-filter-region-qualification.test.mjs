import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeFilterRegionSvgQualification } from "../scripts/lib/svg-filter-region-qualification.mjs";
test("new source variant binds all4 exact artifact members and raw source receipts without changing any pixel/memory/privacy gates",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const options={root:process.cwd(),runtime:runtime.directory,
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),bytes:1234,sha256:"a".repeat(64)}};
    const result=makeFilterRegionSvgQualification(options);
    assert.match(result.suite,/filter-region-processed-input.json/);assert.doesNotMatch(result.suite,/repeated-processed-input.json/);
    assert.match(result.driver,/\[pins.ownerReceiptMember, pins.receiptMember, pins.wasmMember, pins.glueMember\]/);
    assert.match(result.driver,/filterOwner.processedReceipt.sha256, pins.receiptSha256/);
    assert.match(result.driver,/assert.equal\(pins.experimentalMaximumBytes, 100663296\)/);
    assert.match(result.driver,/incrementalPrivateMiB <= 250/);assert.match(result.driver,/earliest stable blank baseline/);
    assert.match(result.suite,/stripValidation.minimumSsim\).toBeGreaterThanOrEqual\(0.99\)/);
    assert.match(result.suite,/stripValidation.alphaExact\).toBe\(true\)/);
    assert.equal(result.proof.allExistingFidelityMemoryPrivacyCleanupAssertionsRetained,true);assert.equal(result.proof.publicPromotion,false);
  }finally{await runtime.close();}
});
test("actual capped filter pin equals authenticated inspection; cap96MiB and generated glue identical to the prior candidate",async()=>{
  const pin=JSON.parse(await readFile("images/resvg-source/filter-region-processed-input.json"));
  const report=JSON.parse(await readFile("evidence/2026-10-28T17-23-48-668Z-svg-filter-processed-artifact.json"));
  assert.deepEqual(pin,report.inputPin);assert.equal(pin.runId,40712501519);assert.equal(pin.experimentalMaximumBytes,100663296);
  assert.equal(pin.wasmSha256,"6ed83996764bed766960996baa82009e68fa38d1e1ab067bd6f8c566bb6375d4");
  assert.deepEqual(report.memory.map(row=>[row.initialPages,row.maximumPages,row.shared]),[[24,1536,false]]);
  assert.equal(report.glueMatchesPriorPrivateCandidate,true);assert.equal(report.staticAbi.namesAndKindsEqual,true);
  assert.equal(report.ownedRuntimeRemoved,true);assert.equal(report.localBinaryCopiesRetained,false);
  assert.equal(report.browserAcceptance,false);assert.deepEqual(report.failures,[]);
});

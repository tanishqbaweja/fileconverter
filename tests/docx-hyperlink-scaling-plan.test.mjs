import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
const plan=JSON.parse(await readFile("evidence/2026-11-20-docx-hyperlink-scaling-plan.json"));
const driver=await readFile("scripts/qualify-docx-html.mjs","utf8");
test("distinct current-model scaling3x2 plus a clean largest1x plan retains original limits and fixed metadata",()=>{
  assert.deepEqual(plan.sessions.map(s=>[s.sizes,s.repeatsEach]),[[[2048,32768],3],[[32768],1]]);
  assert.equal(plan.primaryLimitMiB,250);assert.equal(plan.cleanupLimitMiB,96);
  assert.equal(plan.servicesDisabled,false);assert.equal(plan.forceGarbageCollection,false);
  assert.equal(plan.inputReadLimitBytes,262144);assert.equal(plan.outputWriteAndQueueLimitBytes,65536);
  assert.equal(plan.maximumPendingWrites,1);assert.equal(plan.productionSourcesChanged,false);
  assert.equal(plan.sourceFixture.fixedExternalRelationships,1024);assert.equal(plan.sourceFixture.fixedBookmarkNames,64);
  assert.equal(plan.publicPromotion,false);assert.equal(plan.wholeGoalComplete,false);
  assert.match(driver,/const scalingPlan = hyperlinkFresh \? Object\.freeze\(\{ \.\.\.defaultScalingPlan, paragraphs: Object\.freeze\(\[32768\]\), repeats: 1 \}\) : defaultScalingPlan/);
  assert.match(driver,/assert\.equal\(hashes\.length, scalingPlan\.repeats\)/);
  assert.match(driver,/freshLargestDocumentControlVerified = true/);
  assert.match(driver,/scalingFixtureHelper, "validate", binding\.file/);
});
test("prior private qualification remains source-exact for every production module; only test tooling changes",async()=>{
  const r=JSON.parse(await readFile("evidence/2026-11-20T11-26-08-834Z-docx-html-qualification.json"));
  for(const [file,pin]of Object.entries(r.sourcePins))if(/^(workers|lib|app)\//.test(file))
    assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"),pin,file);
});

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proofBytes = await read("evidence/mpeg2-allocation-attempt-build-38138821153.json"), proof = JSON.parse(proofBytes);
test("recorded no-Docker build/source joins and scalar dispatch remain historical, not live native acceptance", async () => {
  assert.equal(proof.status, "actual-allocation-attempt-build-unit-verified-not-browser-acceptance");
  assert.equal(proof.run.databaseId,38138821153);assert.equal(proof.run.conclusion,"success");
  const branch=JSON.parse(await read("evidence/mpeg2-allocation-attempt-build-branch-2026-10-11-binding-fix.json"));
  assert.equal(proof.run.headSha,branch.commit);assert.equal(branch.remoteVerified,true);
  assert.equal(branch.mainUnchanged,true);assert.equal(branch.canonicalHeadIndexAndWorkflowUnchanged,true);
  assert.equal(sha(await read(branch.workflow.path)),branch.workflow.canonicalSha256);
  for(const [file,hash]of Object.entries(proof.manifest.artifacts))assert.equal(proof.files.find(row=>row.file===file)?.sha256,hash,file);
  const attempt = proof.manifest.allocationAttempt;
  assert.equal(attempt.slotBytes, 64); assert.equal(attempt.actualWasm32SyntheticDispatch.passed, 9);
  assert.deepEqual(attempt.actualWasm32SyntheticDispatch.failurePhasesObserved, [1, 4]);
  for (const key of ["actualOriginalFailureObserved", "failureCauseProven", "allocatorPolicyChanged", "heapLimitsRaised",
    "codecOptionsChanged", "publicAcceptance", "speedImprovementProven"]) assert.equal(attempt[key], false, key);
  assert.equal(proof.smoke.sequentialReuses, 200000); assert.equal(proof.smoke.sequentialFreshAllocations, 1);
  assert.equal(proof.downloadRuntimeRemoved, true); assert.equal(proof.hostedCleanupStepPassed, true);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.browserConversionsPerformed, 0);
});
test("actual collector exact generated source/preimages and finally cleanup are retained", async () => {
  const collector = JSON.parse(await read("evidence/mpeg2-allocation-attempt-collector-38138821153.json"));
  assert.equal(collector.failure, null); assert.equal(collector.revision, "binding-fix");
  assert.equal(sha(collector.generatedSource), collector.generatedSha256); assert.equal(collector.generatedSha256, proof.collectorSourceSha256);
  for (const [file, hash] of Object.entries(collector.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(collector.preimages[file], "base64")), hash, file);
  }
  assert.equal(collector.ownedRuntimeRemoved, true); await assert.rejects(access(collector.ownedRuntime), { code: "ENOENT" });
});
test("only source-bound disposable hosted artifact is removed; verified small diagnostic tools remain reusable", async () => {
  const cleanup = JSON.parse(await read("evidence/mpeg2-allocation-attempt-hosted-cleanup-38138821153.json"));
  assert.equal(cleanup.proofSha256, sha(proofBytes)); assert.equal(cleanup.artifactBefore.id, proof.artifact.id);
  assert.equal(cleanup.artifactCountAfter, 0); assert.equal(cleanup.localToolsRetained, proof.reusableToolDirectory);
  assert.equal(cleanup.localToolBytes, 9634350); assert.equal(cleanup.ownedRuntimeRemoved, true);
  assert.equal(cleanup.browserConversionsPerformed, 0); assert.equal(cleanup.publicAcceptance, false);
});

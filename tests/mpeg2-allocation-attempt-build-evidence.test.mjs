import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmMemoryLimits } from "../scripts/lib/wasm-memory-limits.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proofBytes = await read("evidence/mpeg2-allocation-attempt-build-38138821153.json"), proof = JSON.parse(proofBytes);
test("actual no-Docker compiled core/source/build joins and fixed32+16MiB pass without becoming original failure resolution", async () => {
  assert.equal(proof.status, "actual-allocation-attempt-build-unit-verified-not-browser-acceptance");
  assert.equal(proof.run.databaseId, 38138821153); assert.equal(proof.run.conclusion, "success");
  const branch = JSON.parse(await read("evidence/mpeg2-allocation-attempt-build-branch-2026-10-11-binding-fix.json"));
  assert.equal(proof.run.headSha, branch.commit); assert.equal(branch.remoteVerified, true);
  assert.equal(branch.mainUnchanged, true); assert.equal(branch.canonicalHeadIndexAndWorkflowUnchanged, true);
  assert.equal(sha(await read(branch.workflow.path)), branch.workflow.canonicalSha256);
  const readTool = file => readFile(path.join(proof.reusableToolDirectory, file));
  for (const row of proof.files) { const bytes = await readTool(row.file); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256, row.file); }
  const manifestBytes = await readTool("build-manifest.json"); assert.deepEqual(JSON.parse(manifestBytes), proof.manifest);
  for (const [file, hash] of Object.entries(proof.manifest.artifacts)) assert.equal(proof.files.find(row => row.file === file)?.sha256, hash, file);
  for (const [file, hash] of Object.entries(proof.manifest.sources)) {
    assert.equal(file === branch.workflow.path ? branch.workflow.generatedSha256 : sha(await read(file)), hash, file);
  }
  const decoder = await readTool("within-mpeg2-split.wasm"), encoder = await readTool("split-encoder.wasm");
  assert.equal(sha(decoder), "9ce862602f8db5e61f5047e4ecdccea1d8f7e8c98452fb486a95befeeb558039");
  assert.equal(sha(encoder), "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.deepEqual(readWasmMemoryLimits(decoder), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.deepEqual(readWasmMemoryLimits(encoder), [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }]);
  assert.ok(WebAssembly.Module.imports(new WebAssembly.Module(decoder)).some(row => row.name === "within_bind_allocator_attempt_slot"));
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

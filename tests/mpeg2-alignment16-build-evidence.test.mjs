import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmMemoryLimits } from "../scripts/lib/wasm-memory-limits.mjs";
import { readWasmFunctionNames } from "../scripts/lib/wasm-stack-symbols.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proofBytes = await read("evidence/mpeg2-alignment16-build-38161556498.json"), proof = JSON.parse(proofBytes);
test("actual changed decoder/build/head/all53sources/artifacts/fixed32+16MiB and unchanged encoder are joined, not browser acceptance", async () => {
  assert.equal(proof.status, "actual-alignment16-build-unit-verified-not-browser-acceptance");
  assert.equal(proof.run.databaseId, 38161556498); assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "success");
  const branch = JSON.parse(await read("evidence/mpeg2-alignment16-build-branch-2026-10-11-origin-fix.json"));
  assert.equal(proof.run.headSha, branch.commit); assert.equal(branch.commit, "51da078101f96b9194269c179384cdf9a1a82a33");
  assert.equal(sha(await read(branch.workflow.path)), branch.workflow.canonicalSha256);
  assert.equal(branch.remoteVerified, true); assert.equal(branch.mainUnchanged, true); assert.equal(branch.canonicalHeadIndexAndWorkflowUnchanged, true);
  for (const [file, hash] of Object.entries(branch.sourcePins)) assert.equal(sha(await read(file)), hash);
  assert.equal(proof.reusableToolDirectory, path.join(root, "work/mpeg2-alignment16-38161556498"));
  const tool = file => readFile(path.join(proof.reusableToolDirectory, file));
  for (const row of proof.files) { const bytes = await tool(row.file); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256, row.file); }
  assert.deepEqual(JSON.parse(await tool("build-manifest.json")), proof.manifest);
  for (const [file, hash] of Object.entries(proof.manifest.artifacts)) assert.equal(proof.files.find(row => row.file === file)?.sha256, hash, file);
  assert.equal(Object.keys(proof.manifest.sources).length, 53);
  for (const [file, hash] of Object.entries(proof.manifest.sources)) assert.equal(file === branch.workflow.path ? branch.workflow.generatedSha256 : sha(await read(file)), hash, file);
  const decoder = await tool("within-mpeg2-split.wasm"), encoder = await tool("split-encoder.wasm");
  assert.equal(sha(decoder), "417182a9ed0f5e19e77c5248545c80265b87abd477984872d9ccf4094d8b1014");
  assert.equal(sha(encoder), "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.deepEqual(readWasmMemoryLimits(decoder), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.deepEqual(readWasmMemoryLimits(encoder), [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }]);
  assert.ok(WebAssembly.Module.imports(new WebAssembly.Module(decoder)).some(row => row.name === "within_bind_allocator_attempt_slot"));
  const names = readWasmFunctionNames(decoder);
  for (const [index, name] of [[4188, "av_buffer_allocz"], [4312, "av_malloc"], [4436, "emscripten_builtin_malloc"], [4441, "sbrk"], [4471, "__wrap_posix_memalign"]]) assert.equal(names.get(index), name);
  const map = (await tool("decoder-link.map")).toString();
  assert.match(map, /^\s*1b4318\s+0\s+1f0\s+_gm_$/m); assert.match(map, /^\s*1d4710\s+0\s+40\s+within_allocator_attempt_words$/m);
  assert.match(map, /^\s*1d4750\s+0\s+40\s+within_refstruct_abort_words$/m);
  // Current addresses/names are re-read from the changed binary/map, not assumed
  // from the older binary. Original fatal PCs/bodies MUST NOT be substituted.
  assert.equal(proof.hostedCleanupStepPassed, true); assert.equal(proof.downloadRuntimeRemoved, true);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.browserConversionsPerformed, 0);
});
test("actual13-case alignment contracts plus existing9 dispatch/200000 lifecycle reuses pass without converting media", async () => {
  const tool = file => readFile(path.join(proof.reusableToolDirectory, file));
  const alignment = proof.manifest.alignment16, actual = JSON.parse(await tool("alignment16-smoke.json"));
  assert.deepEqual(actual, alignment.actualWasmSmoke);
  assert.deepEqual(actual, { cases: 13, passed: 13, mallocAlignment: 16, observedRequestBytes: 1597463, largeWrapperRejectedFreshPointer: false, heapBytes: 33554432, conversionsPerformed: 0 });
  assert.equal(alignment.originalSdkSourceSha256, "175ef7cab6d59b858471ad8ba16ee8a2f0536ddf666742b5e044b187171695d6");
  assert.equal(alignment.generatedSdkSourceSha256, "2ad4ca73bfc509445d6bce8df0ceab4296dbc1eef917fda9f56db0108514d546");
  for (const key of ["separateEncoderSdkRestored", "upstreamAllocatorBodyUnchanged", "allocatorPolicyChanged"]) assert.equal(alignment[key], true);
  for (const key of ["liveReferencesChanged", "codecSettingsChanged", "heapLimitsRaised", "browserFidelityVerified", "speedGainProven", "publicAcceptance"]) assert.equal(alignment[key], false);
  const attempt = proof.manifest.allocationAttempt;
  assert.deepEqual(JSON.parse(await tool("allocation-attempt-smoke.json")), attempt.actualWasm32SyntheticDispatch);
  assert.equal(attempt.actualWasm32SyntheticDispatch.passed, 9); assert.equal(attempt.allocatorPolicyChanged, true);
  assert.equal(attempt.actualOriginalFailureObserved, false); assert.equal(attempt.failureCauseProven, false);
  assert.equal(proof.smoke.sequentialReuses, 200000); assert.equal(proof.smoke.sequentialFreshAllocations, 1); assert.equal(proof.smoke.zeroEveryTimePassed, true);
  assert.equal(proof.smoke.liveReferencesUnchanged, true); assert.equal(proof.smoke.conversionsPerformed, 0);
});
test("actual successful collector retains exact generated source and current/source preimages, removes owned download/runtime", async () => {
  const collector = JSON.parse(await read("evidence/mpeg2-alignment16-collector-38161556498.json"));
  assert.equal(collector.failure, null); assert.equal(collector.revision, "origin-fix");
  assert.equal(sha(collector.generatedSource), collector.generatedSha256); assert.equal(collector.generatedSha256, proof.collectorSourceSha256);
  for (const [file, hash] of Object.entries(collector.sourcePins)) { assert.equal(sha(await read(file)), hash); assert.equal(sha(Buffer.from(collector.preimages[file], "base64")), hash); }
  assert.equal(collector.ownedRuntimeRemoved, true); await assert.rejects(access(collector.ownedRuntime), { code: "ENOENT" });
  assert.equal(collector.publicAcceptance, false); assert.equal(collector.browserConversionsPerformed, 0);
});
test("only actual source/head/digest-bound disposable remote artifact deleted; verified small local tools remain", async () => {
  const cleanup = JSON.parse(await read("evidence/mpeg2-alignment16-hosted-cleanup-38161556498.json"));
  assert.equal(cleanup.proofSha256, sha(proofBytes)); assert.equal(cleanup.artifactBefore.id, proof.artifact.id);
  assert.equal(cleanup.artifactBefore.workflow_run.head_sha, proof.run.headSha); assert.equal(cleanup.artifactBefore.digest, proof.artifact.digest);
  assert.equal(cleanup.artifactCountAfter, 0); assert.equal(cleanup.localToolsRetained, proof.reusableToolDirectory);
  assert.equal(cleanup.localToolBytes, 9635564); assert.equal(cleanup.ownedRuntimeRemoved, true);
  assert.equal(cleanup.browserConversionsPerformed, 0); assert.equal(cleanup.publicAcceptance, false);
});

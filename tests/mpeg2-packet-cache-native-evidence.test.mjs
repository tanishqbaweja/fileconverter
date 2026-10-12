import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmMemoryLimits } from "../scripts/lib/wasm-memory-limits.mjs";
import { makePacketCacheStrictCollector } from "../scripts/lib/mpeg2-packet-cache-strict-build-recipe.mjs";
import { applyHevcSingleIdleGetBuffer, reverseHevcSingleIdleGetBuffer, makeHevcSingleIdleBuffer } from "../media/ffmpeg/mpeg2-hevc-plane-source.mjs";
import { reverseSingleIdlePlaneBuffer } from "../media/ffmpeg/mpeg2-encoder-plane-source.mjs";
import { reversePlaneFactoryPrototype } from "../media/ffmpeg/mpeg2-encoder-plane-prototype-source.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proofBytes = await read("evidence/mpeg2-packet-cache-build-38206263853.json"), proof = JSON.parse(proofBytes);
const tool = file => readFile(path.join(proof.reusableToolDirectory, file));
test("actual fixed-heap packet cache200000 reuses, aliases/deferred close and four injected failures pass without browser/speed acceptance", () => {
  const cache = proof.manifest.packetCache, smoke = cache.actualWasmLifecycle;
  assert.equal(smoke.status, "actual-libavutil-packet-cache-lifecycle-not-conversion"); assert.equal(smoke.reuseIterations, 200000);
  assert.equal(smoke.maximumIdleLeases, 1); assert.equal(smoke.payloadLimitBytes, 1048576); assert.equal(smoke.injectedFailureCases, 4);
  assert.equal(smoke.ownedAllocationsBalanced, true); assert.equal(smoke.aliasesAndDeferredClose, true);
  assert.equal(sha(cache.actualWasmLifecycleExactSource), cache.actualWasmLifecycleSha256); assert.deepEqual(JSON.parse(cache.actualWasmLifecycleExactSource), smoke);
  assert.equal(cache.allocateActualRequiredBytes, true); assert.equal(cache.maximumIdleLeases, 1); assert.equal(cache.paddingBytes, 64);
  for (const key of ["liveReferencesChanged", "codecSettingsChanged", "heapLimitsRaised", "browserFidelityVerified", "fullOriginalCompleted", "completeChromiumMemoryAcceptance", "speedGainProven", "publicAcceptance"]) assert.equal(cache[key], false);
  for (const key of ["generatedOuterBuilder", "generatedHevcWrapper"]) assert.equal(sha(cache[key]), cache[key + "Sha256"]);
  assert.equal(sha(cache.generatedPipeline.generated), cache.generatedPipeline.generatedSha256);
});
test("all72 actual Git-head preimages recover byte-exactly; only canonical workflow differs, every current/post source and capturer unchanged", async () => {
  const retained = JSON.parse(await read("evidence/packet-cache-native-sources-38206263853.json"));
  assert.equal(retained.proof.sha256, sha(proofBytes)); assert.equal(retained.executedHead, proof.run.headSha);
  assert.equal(retained.sourceCount, 72); assert.equal(retained.allSourcesMatchedExecutedGitHead, true); assert.equal(retained.workflowCanonicalDiffOnly, true);
  assert.deepEqual(retained.sourcePins, proof.manifest.sources); assert.deepEqual(retained.postSourcePins, retained.currentSourcePins);
  const zipped = await read(retained.archive.path); assert.equal(zipped.length, retained.archive.bytes); assert.equal(sha(zipped), retained.archive.sha256);
  const restored = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(restored.length, retained.archive.restoredBytes); assert.equal(sha(restored), retained.archive.restoredSha256);
  const payload = JSON.parse(restored); assert.deepEqual(payload.sourcePins, retained.sourcePins); assert.equal(Object.keys(payload.sourcePreimages).length, 72);
  for (const [file, hash] of Object.entries(retained.sourcePins)) {
    assert.equal(sha(Buffer.from(payload.sourcePreimages[file].data, "base64")), hash); assert.equal(sha(await read(file)), retained.currentSourcePins[file]);
  }
  assert.equal(sha(await read(retained.ownSource.path)), retained.ownSource.sha256); assert.equal(sha(Buffer.from(retained.ownSource.preimage, "base64")), retained.ownSource.sha256);
  assert.equal(retained.conversions, 0); assert.equal(retained.originalRead, false); assert.equal(retained.memoryAcceptance, false); assert.equal(retained.speedGainProven, false);
});
test("actual successful changed HEVC build joins72 executed sources,20 artifacts, Git head and unchanged fixed heaps/encoder", async () => {
  assert.equal(proof.status, "actual-packet-cache-build-unit-verified-not-browser-acceptance");
  assert.equal(proof.run.databaseId, 38206263853); assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "success");
  const branch = JSON.parse(await read("evidence/mpeg2-packet-cache-build-branch-2026-10-12-warning-fix.json"));
  assert.equal(proof.run.headSha, branch.commit); assert.equal(branch.commit, "021552ac0875bd22fa4f156ab329b13769ac9113");
  assert.equal(branch.remoteVerified, true); assert.equal(branch.mainUnchanged, true); assert.equal(branch.canonicalHeadIndexAndWorkflowUnchanged, true);
  assert.equal(sha(await read(branch.workflow.path)), branch.workflow.canonicalSha256);
  assert.equal(Object.keys(proof.manifest.sources).length, 72);
  for (const [file, digest] of Object.entries(proof.manifest.sources))
    assert.equal(file === branch.workflow.path ? branch.workflow.generatedSha256 : sha(await read(file)), digest, file);
  for (const [file, digest] of Object.entries(branch.sourcePins)) assert.equal(sha(await read(file)), digest, file);
  assert.equal(proof.reusableToolDirectory, path.join(root, "work/mpeg2-packet-cache-38206263853"));
  assert.equal(proof.reusableToolBytes, 9716351); assert.equal(proof.files.length, 20);
  for (const row of proof.files) { const bytes = await tool(row.file); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256, row.file); }
  assert.deepEqual(JSON.parse(await tool("build-manifest.json")), proof.manifest);
  for (const [file, digest] of Object.entries(proof.manifest.artifacts)) assert.equal(proof.files.find(row => row.file === file)?.sha256, digest, file);
  const decoder = await tool("within-mpeg2-split.wasm"), encoder = await tool("split-encoder.wasm");
  assert.equal(sha(decoder), "4421339c802d2031c27c6c62ee948174b454797a7176d338cfe451b19c2945cb");
  assert.equal(sha(encoder), "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.deepEqual(readWasmMemoryLimits(decoder), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.deepEqual(readWasmMemoryLimits(encoder), [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }]);
  assert.equal(proof.hostedCleanupStepPassed, true); assert.equal(proof.downloadRuntimeRemoved, true);
  assert.equal(proof.originalRead, false); assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.publicAcceptance, false);
});
test("actual compiled libavutil80 selectors/200000 lifetimes plus13 alignment/9 dispatch pass, not codec fidelity or full-file acceptance", async () => {
  const planes = proof.manifest.hevcPlanes, smoke = JSON.parse(await tool("hevc-plane-smoke.json"));
  assert.deepEqual(smoke, planes.actualWasmLifecycle); assert.equal(smoke.status, "passed");
  assert.equal(smoke.scope, "actual-libavutil-hevc-plane-lifecycle-not-conversion");
  assert.equal(smoke.selectorConfigurations, 80); assert.equal(smoke.sequentialReuses, 200000);
  assert.equal(smoke.sequentialFreshAllocations, 1); assert.equal(smoke.maximumIdleEntriesPerSelectedPool, 1); assert.equal(smoke.conversionsPerformed, 0);
  for (const key of ["liveReferencesUnchanged", "uninitWithLiveReferencesPassed", "allocatorCallbackFailurePassed", "zeroEveryAcquisitionPassed", "nonselectedCacheUnchanged"]) assert.equal(smoke[key], true);
  const get = (await tool("hevc-plane-get-buffer.c")).toString(), buffer = (await tool("hevc-plane-buffer.c")).toString();
  assert.equal(sha(get), planes.getBufferSha256); assert.equal(sha(buffer), planes.bufferSha256);
  assert.equal(applyHevcSingleIdleGetBuffer(reverseHevcSingleIdleGetBuffer(get)), get);
  assert.equal(makeHevcSingleIdleBuffer(reverseSingleIdlePlaneBuffer(reversePlaneFactoryPrototype(buffer))), buffer);
  assert.equal(planes.privateFramePoolFieldAddedBytes, 4); assert.equal(planes.zeroEveryAcquisitionIncludingPadding, true);
  assert.equal(sha(planes.generatedOuterBuilder), planes.generatedOuterBuilderSha256);
  for (const key of ["liveReferencesChanged", "codecSettingsChanged", "publicStructAbiChanged", "heapLimitsRaised", "browserFidelityVerified", "fullOriginalCompleted", "completeChromiumMemoryAcceptance", "speedGainProven", "publicAcceptance"]) assert.equal(planes[key], false);
  const alignment = JSON.parse(await tool("alignment16-smoke.json"));
  assert.deepEqual(alignment, proof.manifest.alignment16.actualWasmSmoke);
  assert.equal(alignment.cases, 13); assert.equal(alignment.passed, 13); assert.equal(alignment.mallocAlignment, 16); assert.equal(alignment.heapBytes, 33554432);
  assert.equal(alignment.observedRequestBytes, 1597463); assert.equal(alignment.largeWrapperRejectedFreshPointer, false);
  assert.equal(proof.manifest.alignment16.separateEncoderSdkRestored, true); assert.equal(proof.manifest.alignment16.upstreamAllocatorBodyUnchanged, true);
  const attempt = JSON.parse(await tool("allocation-attempt-smoke.json"));
  assert.deepEqual(attempt, proof.manifest.allocationAttempt.actualWasm32SyntheticDispatch); assert.equal(attempt.passed, 9);
  assert.equal(proof.smoke.sequentialReuses, 200000); assert.equal(proof.smoke.sequentialFreshAllocations, 1);
});
test("actual collector7 current/pre/post preimages and exact generated derivative retained; owned scratch absent", async () => {
  const collector = JSON.parse(await read("evidence/packet-cache-strict-collector-38206263853.json"));
  assert.equal(collector.failure, null); assert.equal(collector.runId, "38206263853");
  assert.equal(Object.keys(collector.sourcePins).length, 7); assert.deepEqual(collector.postSourcePins, collector.sourcePins);
  for (const [file, digest] of Object.entries(collector.sourcePins)) { assert.equal(sha(await read(file)), digest, file); assert.equal(sha(Buffer.from(collector.preimages[file], "base64")), digest); }
  assert.deepEqual(makePacketCacheStrictCollector((await read("scripts/collect-mpeg2-single-idle-build.mjs")).toString(), root), collector.recipe);
  assert.equal(sha(collector.recipe.generated), proof.collectorSourceSha256); assert.equal(collector.ownedRuntimeRemoved, true);
  await assert.rejects(access(collector.ownedRuntime), { code: "ENOENT" });
});
test("only verified-head/id/digest hosted duplicate deleted; all verified local tools retained and destructive recipe reverses exactly", async () => {
  const cleanup = JSON.parse(await read("evidence/mpeg2-packet-cache-hosted-cleanup-38206263853.json"));
  assert.equal(cleanup.proofSha256, sha(proofBytes)); assert.equal(cleanup.artifactBefore.id, proof.artifact.id);
  assert.equal(cleanup.artifactBefore.id, 11727487740); assert.equal(cleanup.artifactBefore.digest, proof.artifact.digest);
  assert.equal(cleanup.artifactBefore.workflow_run.head_sha, proof.run.headSha); assert.equal(cleanup.artifactCountAfter, 0);
  assert.equal(cleanup.localToolsRetained, proof.reusableToolDirectory); assert.equal(cleanup.localToolBytes, 9716351); assert.equal(cleanup.ownedRuntimeRemoved, true);
  const executed = JSON.parse(await read("evidence/packet-cache-cleanup-executed-source-38206263853.json"));
  const original = Buffer.from(executed.sourcePreimage, "base64").toString();
  assert.equal(sha(original), executed.sourceSha256); assert.equal(sha(await read(executed.sourcePath)), executed.sourceSha256);
  assert.equal(sha(executed.generatedSource), executed.generatedSha256); let reversed = executed.generatedSource;
  for (const [before, after] of executed.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, original); assert.equal(executed.reverseExact, true); assert.equal(executed.ownedRuntimeRemoved, true);
  assert.equal(cleanup.browserConversionsPerformed, 0); assert.equal(cleanup.publicAcceptance, false);
});

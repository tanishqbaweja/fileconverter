import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmMemoryLimits } from "../scripts/lib/wasm-memory-limits.mjs";
import { makeLargestIdleCollector } from "../scripts/lib/mpeg2-packet-largest-idle-build-recipe.mjs";
import { verifyPacketLargestIdleNativeEnvelope } from "../scripts/lib/packet-largest-idle-native-envelope.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proofBytes = await read("evidence/mpeg2-packet-largest-idle-build-38327579000.json"), proof = JSON.parse(proofBytes);
const tool = file => readFile(path.join(proof.reusableToolDirectory, file));
test("actual matched real-libavutil policy controls pass200000 reuses, aliases/deferred close/failures and allocation-volume reduction", () => {
  const p = proof.manifest.packetLargestIdle, candidate = p.actualCandidate, control = p.actualControl;
  for (const row of [candidate, control]) {
    assert.equal(row.status, "actual-libavutil-packet-cache-lifecycle-not-conversion");
    assert.equal(row.reuseIterations, 200000); assert.equal(row.matchedWorkloadRounds, 2000);
    assert.equal(row.maximumIdleLeases, 1); assert.equal(row.payloadLimitBytes, 1048576); assert.equal(row.injectedFailureCases, 4);
    assert.equal(row.ownedAllocationsBalanced, true); assert.equal(row.aliasesAndDeferredClose, true);
    assert.equal(row.conversionSpeedGainProven, false);
  }
  assert.equal(candidate.policy, "largest-idle"); assert.equal(control.policy, "first-idle");
  assert.equal(control.payloadAllocationCalls, 4001); assert.equal(candidate.payloadAllocationCalls, 2001);
  assert.equal(control.payloadAllocatedBytes, 628682088); assert.equal(candidate.payloadAllocatedBytes, 506088);
  assert.equal(sha(p.controlExactSource), p.controlSha256); assert.deepEqual(JSON.parse(p.controlExactSource), control);
  assert.equal(p.retainedIdleLeases, 1); assert.equal(p.maximumIdleCapacityBytes, 1048640);
  assert.equal(p.onlyReleaseSelectionChanged, true); assert.equal(p.actualFullFailureCauseProven, false);
  assert.equal(p.publicAcceptance, false); assert.equal(p.conversionSpeedGainProven, false);
});
test("79 actual executed/native source preimages and post-current pins recover; zero raw clock is unavailable, not measured speed", async () => {
  const retained = JSON.parse(await read("evidence/packet-largest-idle-native-sources-38327579000.json"));
  assert.equal(retained.proof.sha256, sha(proofBytes)); assert.equal(retained.sourceCount, 79);
  const zipped = await read(retained.archive.path); assert.equal(sha(zipped), retained.archive.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(sha(bytes), retained.archive.restoredSha256);
  const payload = JSON.parse(bytes); assert.deepEqual(payload.sourcePins, proof.manifest.sources);
  assert.equal(Object.keys(payload.sourcePreimages).length, 79);
  assert.deepEqual(retained.postSourcePins, retained.currentSourcePins);
  for (const [file, hash] of Object.entries(retained.sourcePins)) {
    assert.equal(sha(Buffer.from(payload.sourcePreimages[file].data, "base64")), hash, file);
    assert.equal(sha(await read(file)), retained.currentSourcePins[file], file);
  }
  for (const key of ["candidateElapsedMs", "controlElapsedMs", "speedup"]) assert.equal(retained.matchedWorkloadTiming[key], null);
  assert.equal(retained.matchedWorkloadTiming.candidateRawClockMs, 0); assert.equal(retained.matchedWorkloadTiming.controlRawClockMs, 0);
  assert.equal(sha(await read(retained.ownSource.path)), retained.ownSource.sha256);
  assert.equal(sha(Buffer.from(retained.ownSource.preimage, "base64")), retained.ownSource.sha256);
  assert.equal(retained.speedGainProven, false); assert.equal(retained.memoryAcceptance, false);
  const branch = JSON.parse(await read("evidence/mpeg2-packet-largest-idle-build-branch-2026-10-13.json"));
  const envelope = await verifyPacketLargestIdleNativeEnvelope(root, proof, proofBytes, branch);
  assert.equal(envelope.sourceCount, 79); assert.equal(envelope.allExecutedNativePreimagesVerified, true);
  assert.equal(envelope.unchanged128File2MiBEnvelopeCaps, true);
});
test("actual hosted success joins20 retained artifacts and changed fixed32MiB decoder, unchanged fixed16MiB encoder and cleanup", async () => {
  assert.equal(proof.run.headSha, "2748d632c14dc08624c858a77b4a4acaf21f43c1");
  assert.equal(proof.run.databaseId, 38327579000); assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.files.length, 20); assert.equal(proof.reusableToolBytes, 9722644);
  for (const row of proof.files) { const bytes = await tool(row.file); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256, row.file); }
  for (const [file, hash] of Object.entries(proof.manifest.artifacts)) assert.equal(proof.files.find(row => row.file === file)?.sha256, hash);
  assert.deepEqual(JSON.parse(await tool("build-manifest.json")), proof.manifest);
  const decoder = await tool("within-mpeg2-split.wasm"), encoder = await tool("split-encoder.wasm");
  assert.equal(sha(decoder), "7bb58a363d81030d38a8dc3187dc0adf541b77385f06bc0c576225ba29f78439");
  assert.equal(sha(encoder), "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.deepEqual(readWasmMemoryLimits(decoder), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.deepEqual(readWasmMemoryLimits(encoder), [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }]);
  assert.equal(proof.downloadRuntimeRemoved, true); assert.equal(proof.hostedCleanupStepPassed, true);
  assert.equal(proof.originalRead, false); assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.publicAcceptance, false);
});
test("actual generated collector source/pre/post/preimage joins, ownership finally and no false browser/full acceptance", async () => {
  const receipt = JSON.parse(await read("evidence/packet-largest-idle-collector-38327579000.json"));
  assert.equal(receipt.failure, null); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
  for (const [file, hash] of Object.entries(receipt.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(receipt.preimages[file], "base64")), hash, file);
  }
  assert.deepEqual(makeLargestIdleCollector((await read("scripts/collect-mpeg2-single-idle-build.mjs")).toString(), root), receipt.recipe);
  assert.equal(sha(receipt.recipe.generated), proof.collectorSourceSha256);
  assert.equal(receipt.ownedRuntimeRemoved, true); await assert.rejects(access(receipt.ownedRuntime), { code: "ENOENT" });
  for (const key of ["browserFidelityVerified", "fullOriginalCompleted", "completeChromiumMemoryAcceptance", "speedGainProven", "publicAcceptance"]) assert.equal(proof.manifest.packetCache[key], false);
});
test("only redundant exact-head/id/digest hosted archive deleted;20 verified local tools retained and destructive gates reverse", async () => {
  const cleanup = JSON.parse(await read("evidence/mpeg2-packet-largest-idle-hosted-cleanup-38327579000.json"));
  assert.equal(cleanup.proofSha256, sha(proofBytes)); assert.equal(cleanup.artifactBefore.id, 11781812619);
  assert.equal(cleanup.artifactBefore.id, proof.artifact.id); assert.equal(cleanup.artifactBefore.digest, proof.artifact.digest);
  assert.equal(cleanup.artifactBefore.workflow_run.head_sha, proof.run.headSha); assert.equal(cleanup.artifactCountAfter, 0);
  assert.equal(cleanup.localToolsRetained, proof.reusableToolDirectory); assert.equal(cleanup.localToolBytes, 9722644);
  assert.equal(cleanup.ownedRuntimeRemoved, true); assert.equal(cleanup.browserConversionsPerformed, 0);
  const executed = JSON.parse(await read("evidence/packet-largest-idle-cleanup-executed-source-38327579000.json"));
  assert.equal(sha(Buffer.from(executed.sourcePreimage, "base64")), executed.sourceSha256);
  assert.equal(sha(await read(executed.sourcePath)), executed.sourceSha256);
  let reversed = executed.generatedSource;
  for (const [before, after] of executed.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, Buffer.from(executed.sourcePreimage, "base64").toString()); assert.equal(executed.reverseExact, true);
});

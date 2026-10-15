import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proofFile = "evidence/packet-interleave-ownership-38671160915.json";
test("actual pinned Wasm experiment proves queue ownership but not conversion or speed acceptance", async () => {
  const proof = JSON.parse(await read(proofFile)), experiment = proof.experiment;
  assert.equal(experiment.status, "passed");
  assert.equal(experiment.scope, "actual-wasm32-libavformat-interleave-ownership-not-conversion");
  assert.equal(experiment.libavformatVersion, 4066406);
  assert.equal(experiment.matchedPackets, 8); assert.equal(experiment.queuedPayloadAllocations, 8);
  assert.equal(experiment.drainedPayloadAllocations, 1); assert.equal(experiment.repeatedPackets, 4000);
  for (const field of ["payloadPaddingAndPerStreamTimestampsVerified", "aliasesAndMuxHeldReferencesPreserved",
    "deferredClosePassed", "writeErrorPropagated", "abandonedQueueCleaned", "ownedAllocationsBalanced"])
    assert.equal(experiment[field], true);
  for (const field of ["productionQueuePolicyChanged", "actualFatalCacheOccupancyMeasured", "fullFailureCauseProven",
    "realContainerFidelityVerified", "fullOriginalCompleted", "speedGainProven", "publicAcceptance", "originalRead", "originalChanged"])
    assert.equal(proof[field], false);
  assert.equal(proof.conversionsPerformed, 0);
  assert.equal(proof.unchangedProductionDecoderSha256, "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576");
  assert.equal(proof.unchangedProductionEncoderSha256, "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
});
test("all107 executed native source preimages and exact generated collectors survive lossless archival", async () => {
  const proof = JSON.parse(await read(proofFile)), archive = await read(proof.archive.path);
  assert.equal(archive.length, proof.archive.bytes); assert.equal(sha(archive), proof.archive.sha256);
  const raw = gunzipSync(archive); assert.equal(raw.length, proof.archive.restoredBytes);
  assert.equal(sha(raw), proof.archive.restoredSha256); assert.ok(raw.length <= 2 * 1024 ** 2);
  const envelope = JSON.parse(raw); assert.equal(envelope.sources.length, 107);
  for (const row of envelope.sources) {
    const bytes = Buffer.from(row.preimage, "base64");
    assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256, row.path);
    assert.equal(sha(await read(row.path)), row.canonicalCurrentSha256, row.path);
    assert.equal(proof.currentPins[row.path], row.canonicalCurrentSha256);
  }
  const manifestBytes = Buffer.from(envelope.manifest.preimage, "base64");
  assert.equal(sha(manifestBytes), envelope.manifest.sha256);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(sha(manifest.packetInterleaveOwnership.exactSource), proof.experimentSha256);
  assert.deepEqual(JSON.parse(manifest.packetInterleaveOwnership.exactSource), proof.experiment);
  for (const key of ["collector", "branchCaller", "hostedBuilder"])
    assert.equal(sha(envelope[key].exactSource), envelope[key].sha256);
  assert.equal(sha(Buffer.from(envelope.ownSource.preimage, "base64")), proof.ownSource.sha256);
  assert.equal(sha(await read(proof.ownSource.path)), proof.ownSource.sha256);
  const parent = JSON.parse(await read(proof.parentProof.path));
  assert.equal(sha(await read(proof.parentProof.path)), proof.parentProof.sha256);
  assert.equal(parent.collectorSourceSha256, envelope.collector.sha256);
  assert.equal(proof.inheritedSourceCount, 99); assert.equal(proof.allInheritedSourcesRetained, true);
});
test("verified duplicate artifacts are removed while exact compact evidence and parent tools remain", async () => {
  const proof = JSON.parse(await read(proofFile));
  assert.equal(proof.cleanup.duplicateFilesRemoved, 20); assert.equal(proof.cleanup.duplicateBytesRemoved, 9741876);
  assert.equal(proof.cleanup.hostedArtifactDeleted, 11944443742); assert.equal(proof.cleanup.hostedArtifactCountAfter, 0);
  for (const field of ["disposableDuplicateCacheRemoved", "all19NonManifestFilesIdenticalToRetainedParent",
    "exactNewManifestArchived", "downloadedRuntimeRemoved", "terminalRuntimeRemoved", "hostedCleanupStepPassed"])
    assert.equal(proof.cleanup[field], true);
  await assert.rejects(access(path.join(root, "work/mpeg2-packet-interleave-38671160915")), { code: "ENOENT" });
  const parent = JSON.parse(await read(proof.parentProof.path));
  for (const row of parent.files.filter(row => row.file !== "build-manifest.json"))
    assert.equal(sha(await read(path.join(proof.cleanup.retainedParentDirectory, row.file))), row.sha256, row.file);
});

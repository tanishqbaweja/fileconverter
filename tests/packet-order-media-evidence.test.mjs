import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { comparePacketOrderProofs } from "../scripts/lib/packet-order-comparison.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proofFile = "evidence/packet-drain-media-timing-rejection-2026-10-15.json";
async function unpack(record, maximum) {
  const compressed = await read(record.path); assert.equal(sha(compressed), record.sha256);
  const raw = gunzipSync(compressed, { maxOutputLength: maximum }); assert.equal(sha(raw), record.restoredSha256);
  return JSON.parse(raw);
}
test("all twelve real conversions pass original gates but the exact timing comparison explicitly rejects the candidate", async () => {
  const proof = JSON.parse(await read(proofFile));
  assert.equal(proof.allTwelveGenuineConversionsPassedExistingGates, true);
  assert.equal(proof.independentExactTimingGatePassed, false); assert.equal(proof.candidateAccepted, false);
  assert.equal(proof.historicalGoldenChanged, false); assert.equal(proof.qualityOrTimingThresholdRelaxed, false);
  assert.deepEqual(proof.observedVideoDurationTicks, { baseline: 64000, candidate: 64002, timeBase: "1/16000", addedMicroseconds: 125 });
  assert.equal(proof.comparisons.length, 4);
  for (const comparison of proof.comparisons) {
    assert.equal(comparison.allPayloadHashesAndSizesMatch, true); assert.equal(comparison.completeDecodedVideoMatches, true);
    assert.equal(comparison.packetsPerVariant, 475); assert.equal(comparison.packetTimingPreservationPassed, false);
    assert.equal(comparison.packetFieldChangesExceptFilePositions.length, 8); assert.equal(comparison.outputSizeDelta, 68);
    assert.deepEqual(comparison.boxSizeDeltas, { ftyp: 0, moov: 0, moof: 68, mdat: 0 });
    assert.ok(comparison.packetFieldChangesExceptFilePositions.every(change => change.stream === 0 && [94, 95].includes(change.packet)));
  }
  for (const field of ["fullOriginalCompleted", "memoryAcceptance", "speedGainProven", "headedCoverageVerified", "publicAcceptance"])
    assert.equal(proof[field], false);
});
test("independent comparison detects payload corruption and retains the exact real timing regression", async () => {
  const proof = JSON.parse(await read(proofFile));
  const media = await Promise.all(proof.runs.filter(run => run.variant !== "initial").map(async run => JSON.parse(await read(run.mediaPath))));
  const reports = await Promise.all(media.map(value => unpack(value.report.archive, 2097152)));
  const rows = reports.map(report => report.rows.find(row => row.kind === "independent-packet-order-proof"));
  assert.deepEqual(comparePacketOrderProofs(...rows), proof.comparisons[0]);
  const altered = structuredClone(rows[1]); altered.packets[0].data_hash = "SHA256:" + "0".repeat(64);
  assert.equal(comparePacketOrderProofs(rows[0], altered).allPayloadHashesAndSizesMatch, false);
  assert.equal(comparePacketOrderProofs(rows[0], rows[0]).exactlyEquivalentApartFromFilePositions, true);
});
test("all321/303/325 source preimages, owned cleanup and lossless raw compaction remain verifiable", async () => {
  const proof = JSON.parse(await read(proofFile));
  assert.deepEqual(proof.runs.map(run => run.sourceCounts.distinct), [321, 303, 325]);
  for (const run of proof.runs) {
    assert.equal(sha(await read(run.mediaPath)), run.mediaSha256);
    assert.equal(sha(await read(run.supplementalPath)), run.supplementalSha256);
    const media = JSON.parse(await read(run.mediaPath)), extra = JSON.parse(await read(run.supplementalPath));
    const legacy = await unpack(media.generatedArchive, 8388608), supplemental = await unpack(extra.archive, 2097152);
    for (const [receipt, archive, base64] of [[media, legacy, false], [extra, supplemental, true]]) {
      assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
      for (const [file, hash] of Object.entries(receipt.sourcePins)) {
        assert.equal(sha(base64 ? Buffer.from(archive.preimages[file], "base64") : archive.sources[file]), hash);
        assert.equal(sha(await read(file)), hash, file);
      }
    }
    assert.equal(media.cleanup.ownedWrapperAbsent, true); assert.equal(media.cleanup.helpers.runtimeAbsent, true);
    await assert.rejects(access(media.cleanup.ownedWrapper), { code: "ENOENT" });
    await assert.rejects(access(media.cleanup.helpers.runtime), { code: "ENOENT" });
    assert.deepEqual(media.protectedPre, media.protectedPost);
  }
  assert.equal(proof.birthChecks.length, 9); assert.ok(proof.birthChecks.every(row => row.ownedBirthAbsent));
  assert.equal(proof.sampledPidChecks.length, 65);
  assert.ok(proof.sampledPidChecks.every(row => row.sampledProcessGone && row.birthWasNotRecordedInConversionSample));
  assert.equal(proof.removedRedundantRawJson.reduce((sum, row) => sum + row.bytes, 0), 4843744);
  for (const row of proof.removedRedundantRawJson) {
    await assert.rejects(access(path.join(root, row.path)), { code: "ENOENT" });
    assert.equal(sha(gunzipSync(await read(row.retainedLosslessArchive.path))), row.sha256);
  }
  for (const [file, source] of Object.entries(proof.ownSources)) {
    assert.equal(sha(await read(file)), source.sha256); assert.equal(sha(Buffer.from(source.preimage, "base64")), source.sha256);
  }
});

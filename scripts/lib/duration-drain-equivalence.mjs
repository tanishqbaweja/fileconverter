import assert from "node:assert/strict";
import { comparePacketOrderProofs } from "./packet-order-comparison.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
const baselineHash = "554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27";
export const DURATION_OUTPUT_SHA256 = "8b0d4370068bfa723f7e3a5f11e15369b138fa5bd4415f7a4d7f0b85b59be35c";
const rows = (report, kind) => report.rows.filter(row => row.kind === kind);
function comparableProbe(probe) {
  const result = structuredClone(probe);
  // These are the physical file location and derived whole-container size/rate,
  // not stream metadata. No stream clock, duration, codec or tag is excluded.
  for (const field of ["filename", "size", "bit_rate"]) delete result.format[field];
  return result;
}
export function verifyDurationEquivalenceReports(baseline, candidate) {
  const before = rows(baseline, "independent-packet-order-proof"), after = rows(candidate, "independent-packet-order-proof");
  assert.equal(before.length, 4); assert.equal(after.length, 4);
  const comparisons = before.map((proof, index) => comparePacketOrderProofs(proof, after[index]));
  for (const comparison of comparisons) {
    assert.equal(comparison.packetsPerVariant, 475);
    assert.equal(comparison.allPayloadHashesAndSizesMatch, true);
    assert.equal(comparison.completeDecodedVideoMatches, true);
    assert.equal(comparison.packetTimingPreservationPassed, true);
    assert.equal(comparison.exactlyEquivalentApartFromFilePositions, true);
    assert.deepEqual(comparison.packetFieldChangesExceptFilePositions, []);
    assert.equal(comparison.outputSizeDelta, 68);
    assert.deepEqual(comparison.boxSizeDeltas, { ftyp: 0, moov: 0, moof: 68, mdat: 0 });
  }
  const probeHashes = [];
  const probesA = rows(baseline, "independent-pre-assertion-probes"), probesB = rows(candidate, "independent-pre-assertion-probes");
  assert.equal(probesA.length, 4); assert.equal(probesB.length, 4);
  for (let i = 0; i < 4; i++) {
    const a = comparableProbe(probesA[i].outputProbe), b = comparableProbe(probesB[i].outputProbe);
    assert.deepEqual(a, b, "All stream/format/chapter metadata must match, except physical file size/location/rate");
    const primary = b.streams.find(stream => stream.codec_type === "video" && !stream.disposition?.attached_pic);
    assert.equal(primary.avg_frame_rate, "24/1"); assert.equal(primary.duration_ts, 64000);
    probeHashes.push(sha(JSON.stringify(a)));
  }
  for (const kind of ["attached-picture-preservation", "exact-stream-title-mapping", "independent-decoded-audio", "independent-copied-audio-timeline",
    "independent-presentation-timeline-passed"])
    assert.deepEqual(rows(baseline, kind), rows(candidate, kind), kind);
  for (const [report, expectedHash, expectedBytes] of [[baseline, baselineHash, 2245558], [candidate, DURATION_OUTPUT_SHA256, 2245626]]) {
    const outputs = report.rows.filter(row => (!row.kind && row.status === "passed") || row.kind === "independent-frame-diagnostic");
    assert.equal(outputs.length, 8);
    for (const output of outputs) { assert.equal(output.outputSha256, expectedHash); assert.equal(output.outputBytes, expectedBytes); }
    for (const frame of rows(report, "independent-frame-diagnostic")) {
      assert.equal(frame.nativeFullDecodePassed, true); assert.ok(frame.ordinalSsim >= .98);
    }
  }
  return { comparisons, metadataProbeHashes: probeHashes, exactPacketPayloadAndTimingPreservation: true,
    completeDecodedVideoAndAudioMatch: true, allStreamChapterAndUserMetadataMatch: true,
    historicalBaselineOutputHash: baselineHash, candidateRepeatableOutputHash: DURATION_OUTPUT_SHA256,
    historicalContainerByteIdentity: false, fragmentHeaderGrowthBytes: 68, allEightCurrentOutputsRepeatable: true,
    qualityOrTimingThresholdRelaxed: false, smallFixtureFidelityQualified: true,
    fullOriginalAcceptance: false, primaryMemoryAcceptance: false, publicAcceptance: false, speedGainProven: false };
}

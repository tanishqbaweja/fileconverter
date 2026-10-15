import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
function groups(packets) {
  assert.ok(Array.isArray(packets) && packets.length > 0 && packets.length <= 1024);
  return Object.groupBy(packets, packet => packet.stream_index);
}
export function comparePacketOrderProofs(baseline, candidate) {
  const a = groups(baseline.packets), b = groups(candidate.packets);
  assert.deepEqual(Object.keys(a), Object.keys(b));
  const changes = [], streams = [];
  for (const index of Object.keys(a)) {
    assert.equal(a[index].length, b[index].length);
    let payloadsMatch = true;
    for (let ordinal = 0; ordinal < a[index].length; ordinal++) {
      const previous = a[index][ordinal], current = b[index][ordinal];
      assert.match(previous.data_hash, /^SHA256:[a-f0-9]{64}$/);
      assert.match(current.data_hash, /^SHA256:[a-f0-9]{64}$/);
      if (previous.data_hash !== current.data_hash || previous.size !== current.size) payloadsMatch = false;
      for (const field of new Set([...Object.keys(previous), ...Object.keys(current)])) {
        // File positions change with container layout; every other field is compared.
        if (field !== "pos" && !isDeepStrictEqual(previous[field], current[field]))
          changes.push({ stream: Number(index), packet: ordinal, field, baseline: previous[field], candidate: current[field] });
      }
    }
    streams.push({ index: Number(index), packets: a[index].length, payloadHashesAndSizesMatch: payloadsMatch });
  }
  const boxTotals = boxes => {
    assert.ok(boxes.length > 0 && boxes.length <= 1024);
    return boxes.reduce((result, box) => {
      result[box.type] = (result[box.type] ?? 0) + box.size; return result;
    }, {});
  };
  const totalsA = boxTotals(baseline.topLevelBoxes), totalsB = boxTotals(candidate.topLevelBoxes);
  const boxDeltas = Object.fromEntries([...new Set([...Object.keys(totalsA), ...Object.keys(totalsB)])]
    .map(type => [type, (totalsB[type] ?? 0) - (totalsA[type] ?? 0)]));
  const allPayloadsMatch = streams.every(stream => stream.payloadHashesAndSizesMatch);
  const decodedVideoMatches = baseline.decodedVideoHash === candidate.decodedVideoHash;
  const exactlyEquivalentApartFromPositions = changes.length === 0 && decodedVideoMatches && allPayloadsMatch;
  return { streams, packetsPerVariant: baseline.packets.length, allPayloadHashesAndSizesMatch: allPayloadsMatch,
    completeDecodedVideoMatches: decodedVideoMatches, decodedVideoHash: baseline.decodedVideoHash,
    packetFieldChangesExceptFilePositions: changes, exactlyEquivalentApartFromFilePositions: exactlyEquivalentApartFromPositions,
    packetTimingPreservationPassed: changes.every(change => !["pts", "pts_time", "dts", "dts_time", "duration", "duration_time"].includes(change.field)),
    canonicalPerStreamPacketHashes: { baseline: sha(JSON.stringify(a)), candidate: sha(JSON.stringify(b)) },
    boxSizeDeltas: boxDeltas, outputSizeDelta: candidate.outputBytes - baseline.outputBytes,
    baselineTopLevelBoxes: baseline.topLevelBoxes, candidateTopLevelBoxes: candidate.topLevelBoxes,
    candidateAccepted: false, fullOriginalAcceptance: false, memoryAcceptance: false, speedGainProven: false };
}

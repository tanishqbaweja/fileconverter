import assert from "node:assert/strict";

// Qualification fixture uses millisecond Matroska ticks. A different MP4
// track timebase can change the rational average without changing cadence.
// Compare every presentation timestamp and retain the exact measured deltas.
export function compareSmallMkvPacketClocks(source, output) {
  assert.ok(Array.isArray(source) && Array.isArray(output));
  assert.ok(source.length > 0 && source.length <= 4096 && output.length <= 4096);
  function perTrack(packets) {
    const tracks = [[], []];
    for (const { stream_index, pts_time, dts_time } of packets) {
      assert.ok(stream_index === 0 || stream_index === 1);
      assert.match(pts_time, /^-?\d+\.\d{6}$/);
      const ptsUs = Math.round(Number(pts_time) * 1e6);
      const dtsUs = dts_time === undefined || dts_time === "N/A" ? null : Math.round(Number(dts_time) * 1e6);
      assert.ok(Number.isSafeInteger(ptsUs) && (dtsUs === null || Number.isSafeInteger(dtsUs)));
      tracks[stream_index].push({ ptsUs, dtsUs });
    }
    return tracks;
  }
  const before = perTrack(source), after = perTrack(output);
  return after.map((packets, streamIndex) => {
    const base = before[streamIndex]; assert.equal(packets.length, base.length); assert.ok(packets.length > 0);
    let maximumPtsErrorUs = 0, maximumComparableDtsErrorUs = 0, comparableDts = 0;
    let lastDts = -Infinity, outputDtsMonotonic = true;
    for (const [index, packet] of packets.entries()) {
      maximumPtsErrorUs = Math.max(maximumPtsErrorUs, Math.abs(packet.ptsUs - base[index].ptsUs));
      if (packet.dtsUs === null || packet.dtsUs < lastDts) outputDtsMonotonic = false;
      if (packet.dtsUs !== null) {
        lastDts = packet.dtsUs;
        if (base[index].dtsUs !== null) {
          comparableDts++;
          maximumComparableDtsErrorUs = Math.max(maximumComparableDtsErrorUs, Math.abs(packet.dtsUs - base[index].dtsUs));
        }
      }
    }
    return { streamIndex, packets: packets.length, maximumPtsErrorUs, comparableDts,
      maximumComparableDtsErrorUs: comparableDts ? maximumComparableDtsErrorUs : null, outputDtsMonotonic };
  });
}

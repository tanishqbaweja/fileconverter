// Independent small-fixture validator, not a conversion or full-file reader.
import assert from "node:assert/strict";

const MAX_PACKETS = 4096;
const TIME_TOLERANCE_SECONDS = 0.001;
const time = (value, label) => {
  assert.ok(typeof value === "string" && value.length > 0, `${label} unavailable`);
  const parsed = Number(value);
  assert.ok(Number.isFinite(parsed), `${label} unavailable`);
  return parsed;
};
const padding = (packet, field) => {
  const entries = (packet.side_data_list ?? []).filter((s) => s.side_data_type === "Skip Samples");
  assert.ok(entries.length <= 1, "Duplicate Skip Samples metadata");
  if (!entries.length) return 0;
  const value = entries[0][field];
  assert.ok(Number.isSafeInteger(value) && value >= 0, `${field} unavailable`);
  return value;
};

/**
 * Compare per-track packet clocks and exact decoder trim, not mux interleave.
 * Absence of Skip Samples means zero; unavailable/malformed values never do.
 * Only bounded small fixtures use this array-based independent validator.
 */
export function validateCopiedAudioTiming(sourcePackets, outputPackets, sourceIndices, outputIndices) {
  assert.ok(sourcePackets.length <= MAX_PACKETS && outputPackets.length <= MAX_PACKETS,
    "Small audio timeline packet cap exceeded");
  assert.ok(sourceIndices.length > 0 && sourceIndices.length <= 32);
  assert.equal(sourceIndices.length, outputIndices.length);
  assert.equal(new Set(sourceIndices).size, sourceIndices.length);
  assert.equal(new Set(outputIndices).size, outputIndices.length);
  assert.ok(sourcePackets.every((p) => sourceIndices.includes(p.stream_index)), "Unknown source audio track");
  assert.ok(outputPackets.every((p) => outputIndices.includes(p.stream_index)), "Unknown output audio track");
  return sourceIndices.map((index, ordinal) => {
    const before = sourcePackets.filter((p) => p.stream_index === index);
    const after = outputPackets.filter((p) => p.stream_index === outputIndices[ordinal]);
    assert.ok(before.length > 0, "Copied audio has no packets");
    assert.equal(before.length, after.length, `Audio ${ordinal} packet count`);
    let maximumPtsErrorSeconds = 0, maximumDtsErrorSeconds = 0, maximumDurationErrorSeconds = null;
    for (let i = 0; i < before.length; i++) {
      const label = `Audio ${ordinal} packet ${i}`;
      const ptsError = Math.abs(time(before[i].pts_time, `${label} source PTS`) - time(after[i].pts_time, `${label} output PTS`));
      const dtsError = Math.abs(time(before[i].dts_time, `${label} source DTS`) - time(after[i].dts_time, `${label} output DTS`));
      assert.ok(ptsError <= TIME_TOLERANCE_SECONDS + 1e-12, `${label} PTS changed`);
      assert.ok(dtsError <= TIME_TOLERANCE_SECONDS + 1e-12, `${label} DTS changed`);
      maximumPtsErrorSeconds = Math.max(maximumPtsErrorSeconds, ptsError);
      maximumDtsErrorSeconds = Math.max(maximumDtsErrorSeconds, dtsError);
      if (before[i].duration_time != null) {
        const error = Math.abs(time(before[i].duration_time, `${label} source duration`) -
          time(after[i].duration_time, `${label} output duration`));
        assert.ok(error <= TIME_TOLERANCE_SECONDS + 1e-12, `${label} duration changed`);
        maximumDurationErrorSeconds = Math.max(maximumDurationErrorSeconds ?? 0, error);
      }
      for (const field of ["skip_samples", "discard_padding"])
        assert.equal(padding(after[i], field), padding(before[i], field), `${label} ${field} changed`);
    }
    return { sourceStreamIndex: index, outputStreamIndex: outputIndices[ordinal], packets: before.length,
      maximumPtsErrorSeconds, maximumDtsErrorSeconds, maximumDurationErrorSeconds,
      initialSkipSamples: padding(before[0], "skip_samples") };
  });
}

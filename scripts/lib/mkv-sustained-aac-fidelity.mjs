import assert from "node:assert/strict";
import { boundedNativeLines, parseCompactAacPacket } from "./bounded-native-lines.mjs";

// The first fully trimmed Matroska packet can have no presented duration.
// Keep it unavailable, while requiring the exact payload, clocks and trim,
// a real output duration, and separately the exact complete decoded PCM.
export async function compareMkvSustainedAac(source, output) {
  const a = source[Symbol.asyncIterator](), b = output[Symbol.asyncIterator]();
  const tolerance = 0.001 + 1e-12;
  let packets = 0, initialSkipSamples, unavailableSourceDuration = 0, last;
  let maximumPtsErrorSeconds = 0, maximumDtsErrorSeconds = 0, maximumDurationErrorSeconds = 0;
  try {
    for (;;) {
      const [x, y] = await Promise.all([a.next(), b.next()]);
      assert.equal(x.done, y.done, "AAC packet count changed");
      if (x.done) break;
      const p = x.value, q = y.value;
      assert.ok(++packets <= 10_000_000);
      assert.equal(p.streamIndex, 1); assert.equal(q.streamIndex, 1);
      assert.equal(q.hash, p.hash, `AAC packet bytes or order changed at ${packets}`);
      assert.equal(q.skip, p.skip, `AAC leading trim changed at ${packets}`);
      assert.equal(q.tail, p.tail, `AAC trailing trim changed at ${packets}`);
      if (packets === 1) initialSkipSamples = p.skip;
      else { assert.equal(p.skip, 0); assert.equal(last.tail, 0); assert.ok(q.dts >= last.dts); }
      assert.ok(q.duration > 0, "AAC output packet duration unavailable");
      if (p.duration === null) {
        assert.ok(packets === 1 && p.explicitTrim && p.skip === 1024 && p.tail === 0, "Only the declared, fully trimmed AAC-LC preroll may lack source duration");
        unavailableSourceDuration++;
      } else {
        const duration = Math.abs(q.duration - p.duration);
        assert.ok(duration <= tolerance, `AAC packet duration changed at ${packets}`);
        maximumDurationErrorSeconds = Math.max(maximumDurationErrorSeconds, duration);
      }
      const pts = Math.abs(q.pts - p.pts), dts = Math.abs(q.dts - p.dts);
      assert.ok(pts <= tolerance && dts <= tolerance, `AAC packet clock changed at ${packets}`);
      maximumPtsErrorSeconds = Math.max(maximumPtsErrorSeconds, pts);
      maximumDtsErrorSeconds = Math.max(maximumDtsErrorSeconds, dts);
      last = q;
    }
  } finally { await Promise.allSettled([a.return?.(), b.return?.()]); }
  assert.ok(packets > 1);
  return { packets, initialSkipSamples, trailingDiscardSamples: last.tail, unavailableSourceDuration,
    maximumPtsErrorSeconds, maximumDtsErrorSeconds, maximumDurationErrorSeconds, packetBytesIdentical: true };
}

export function probeMkvSustainedAac(file, options) {
  const lines = boundedNativeLines("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_packets", "-show_entries",
    "packet=stream_index,pts_time,dts_time,duration_time,data_hash:packet_side_data=side_data_type,skip_samples,discard_padding",
    "-show_data_hash", "sha256", "-of", "compact", file], options);
  return (async function* () { for await (const line of lines) yield parseCompactAacPacket(line); })();
}

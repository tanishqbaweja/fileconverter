// Independent bounded VFR Matroska -> fragmented MP4 validation. No nominal
// frame-rate assumptions, timestamp rebasing or unavailable-duration-as-zero.
import assert from "node:assert/strict";
import { compareComplexMkvPackets } from "./mkv-complex-fidelity.mjs";
const clockTolerance = 0.001, headerTolerance = 0.050;
const time = (value, label) => {
  assert.ok(typeof value === "string" && value.trim().length > 0, `${label} unavailable`);
  const n = Number(value); assert.ok(Number.isFinite(n), `${label} unavailable`); return n;
};
const near = (a, b, label) => assert.ok(Math.abs(a - b) <= clockTolerance + 1e-12, `${label} changed`);
const trim = (packet, name) => {
  const rows = (packet.side_data_list ?? []).filter(s => s.side_data_type === "Skip Samples");
  assert.ok(rows.length <= 1);
  if (!rows.length) return 0;
  assert.ok(Number.isSafeInteger(rows[0][name]) && rows[0][name] >= 0, `${name} unavailable`); return rows[0][name];
};
function edges(probe, packets) {
  assert.deepEqual(probe.streams.slice(0, 3).map(s => s.codec_name), ["h264", "aac", "aac"]);
  const video = packets.filter(p => p.stream_index === 0).map(p => ({ p, pts: time(p.pts_time, "Video PTS") })).sort((a, b) => a.pts - b.pts);
  assert.equal(video.length, 72);
  assert.ok(video.every((p, i) => !i || p.pts > video[i - 1].pts), "Unique presentation clocks required");
  const last = video.at(-1), duration = time(last.p.duration_time, "Final presented video packet duration");
  assert.ok(duration > 0 && duration <= 1);
  const tracks = [{ kind: "video", start: video[0].pts, end: last.pts + duration }];
  for (const index of [1, 2]) {
    const audio = packets.filter(p => p.stream_index === index); assert.equal(audio.length, 189);
    const rate = time(probe.streams[index].sample_rate, "Audio sample rate");
    assert.ok(Number.isSafeInteger(rate) && rate >= 8000 && rate <= 192000);
    const endDuration = time(audio.at(-1).duration_time, "Final audio duration");
    assert.ok(endDuration > 0 && endDuration <= 1);
    const start = time(audio[0].pts_time, "Audio first PTS") + trim(audio[0], "skip_samples") / rate;
    const end = time(audio.at(-1).pts_time, "Audio final PTS") + endDuration - trim(audio.at(-1), "discard_padding") / rate;
    assert.ok(end > start); tracks.push({ kind: "audio", index, start, end });
  }
  return { tracks, start: Math.min(...tracks.map(t => t.start)), end: Math.max(...tracks.map(t => t.end)) };
}

export function validateComplexPositiveStartTimeline({ sourceProbe, outputProbe, sourcePackets, outputPackets,
  sourceDecodedHashes, outputDecodedHashes }) {
  assert.equal(sourceProbe.format.format_name, "matroska,webm");
  assert.equal(outputProbe.format.format_name, "mov,mp4,m4a,3gp,3g2,mj2");
  assert.match(sourceDecodedHashes, /^0,v,SHA256=[a-f0-9]{64}\r?\n1,a,SHA256=[a-f0-9]{64}\r?\n2,a,SHA256=[a-f0-9]{64}$/);
  assert.equal(outputDecodedHashes, sourceDecodedHashes, "Complete decoded content changed");
  const packetIdentityAndClocks = compareComplexMkvPackets(sourcePackets, outputPackets);
  const source = edges(sourceProbe, sourcePackets), output = edges(outputProbe, outputPackets);
  assert.ok(source.start > 0, "This is a positive-start control, not a rebased zero-start substitute");
  for (let i = 0; i < source.tracks.length; i++) {
    near(source.tracks[i].start, output.tracks[i].start, `Track ${i} presentation start`);
    near(source.tracks[i].end, output.tracks[i].end, `Track ${i} presentation end`);
  }
  const sourceStart = time(sourceProbe.format.start_time, "Source header start"), outputStart = time(outputProbe.format.start_time, "Output header start");
  near(sourceStart, source.start, "Source header start"); near(outputStart, output.start, "Output header start");
  const sourceDuration = time(sourceProbe.format.duration, "Source segment endpoint"), outputDuration = time(outputProbe.format.duration, "Output presentation span");
  assert.ok(sourceDuration > 0 && outputDuration > 0);
  const sourceHeaderEndErrorSeconds = Math.abs(sourceDuration - source.end);
  const outputHeaderEndErrorSeconds = Math.abs(outputStart + outputDuration - output.end);
  assert.ok(sourceHeaderEndErrorSeconds < headerTolerance, "Source header endpoint inconsistent");
  assert.ok(outputHeaderEndErrorSeconds < headerTolerance, "Output header endpoint inconsistent");
  near(source.end - source.start, output.end - output.start, "Actual presentation span");
  return { source, output, packetIdentityAndClocks, clockToleranceSeconds: clockTolerance,
    headerToleranceSeconds: headerTolerance, sourceHeaderEndErrorSeconds, outputHeaderEndErrorSeconds,
    rawFormatDurationDifferenceSeconds: Math.abs(sourceDuration - outputDuration),
    sourceHeaderMeaning: "Matroska zero-origin segment endpoint", outputHeaderMeaning: "Fragmented MP4 presentation span",
    defaultDurationNotUsedAsCadence: true, noTimestampRebasing: true, completeDecodedContentEqual: true };
}

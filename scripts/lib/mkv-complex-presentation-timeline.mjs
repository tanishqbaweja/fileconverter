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

export function validateComplexFragmentedTimeline({ sourceProbe, outputProbe, sourcePackets, outputPackets,
  sourceDecodedHashes, outputDecodedHashes, serializedTimeline, requirePositiveStart = false }) {
  assert.equal(sourceProbe.format.format_name, "matroska,webm");
  assert.equal(outputProbe.format.format_name, "mov,mp4,m4a,3gp,3g2,mj2");
  assert.match(sourceDecodedHashes, /^0,v,SHA256=[a-f0-9]{64}\r?\n1,a,SHA256=[a-f0-9]{64}\r?\n2,a,SHA256=[a-f0-9]{64}$/);
  assert.equal(outputDecodedHashes, sourceDecodedHashes, "Complete decoded content changed");
  const packetIdentityAndClocks = compareComplexMkvPackets(sourcePackets, outputPackets);
  const source = edges(sourceProbe, sourcePackets), output = edges(outputProbe, outputPackets);
  assert.ok(source.start >= 0);
  if (requirePositiveStart) assert.ok(source.start > 0, "This is a positive-start control, not a rebased zero-start substitute");
  for (let i = 0; i < source.tracks.length; i++) {
    near(source.tracks[i].start, output.tracks[i].start, `Track ${i} presentation start`);
    near(source.tracks[i].end, output.tracks[i].end, `Track ${i} presentation end`);
  }
  const sourceStart = time(sourceProbe.format.start_time, "Source header start"), outputStart = time(outputProbe.format.start_time, "Output header start");
  near(sourceStart, source.start, "Source header start"); near(outputStart, output.start, "Output header start");
  const sourceDuration = time(sourceProbe.format.duration, "Source segment endpoint"), outputDuration = time(outputProbe.format.duration, "Output reported duration");
  assert.ok(sourceDuration > 0 && outputDuration > 0);
  const sourceHeaderEndErrorSeconds = Math.abs(sourceDuration - source.end);
  assert.ok(sourceHeaderEndErrorSeconds < headerTolerance, "Source header endpoint inconsistent");
  // The physical fMP4 headers explicitly have unknown (zero) duration. The
  // MOV demuxer derives reported track duration from fragment decode endpoints
  // before the edit offset, NOT from the final presented frame. Check that
  // estimate against every actual decode packet, and validate presentation
  // clocks/endpoints and serialized edits independently. Never enlarge 50ms
  // to hide the 52ms raw cross-container scalar difference in the B-frame case.
  assert.equal(serializedTimeline.movie.durationTicks, "0");
  assert.ok(Number.isSafeInteger(serializedTimeline.movie.timeScale) && serializedTimeline.movie.timeScale > 0);
  assert.equal(serializedTimeline.tracks.length, 3);
  const outputDecodeSpans = [0, 1, 2].map(index => {
    const rows = outputPackets.filter(p => p.stream_index === index);
    const first = time(rows[0].dts_time, "First output DTS"), last = rows.at(-1);
    const finalDuration = time(last.duration_time, "Final decode duration");
    assert.ok(finalDuration > 0 && finalDuration <= 1);
    const end = time(last.dts_time, "Final output DTS") + finalDuration;
    const span = end - first; assert.ok(span > 0);
    near(time(outputProbe.streams[index].duration, "Reported track duration"), span, `Track ${index} reported decode span`);
    const box = serializedTimeline.tracks[index];
    assert.equal(box.kind, index ? "soun" : "vide"); assert.equal(box.durationTicks, "0");
    assert.equal(box.firstFragmentDecodeTimeTicks, "0"); assert.equal(box.editListPresent, true);
    assert.ok(Number.isSafeInteger(box.timeScale) && box.timeScale > 0);
    if (index) assert.equal(box.timeScale, Number(outputProbe.streams[index].sample_rate));
    const edits = box.edits; assert.equal(edits.length, source.start > 0 ? 2 : 1);
    assert.ok(edits.every(e => e.mediaRateInteger === 1 && e.mediaRateFraction === 0));
    if (source.start > 0) {
      assert.equal(edits[0].mediaTimeTicks, "-1");
      near(Number(edits[0].segmentDurationTicks) / serializedTimeline.movie.timeScale, output.tracks[index].start, `Track ${index} empty edit delay`);
    }
    const active = edits.at(-1); assert.equal(active.segmentDurationTicks, "0");
    const expectedMediaTime = index ? trim(rows[0], "skip_samples")
      : Math.round((time(rows[0].pts_time, "First output PTS") - first) * box.timeScale);
    assert.equal(active.mediaTimeTicks, String(expectedMediaTime), `Track ${index} edit time`);
    return { index, start: first, end, span };
  });
  const expectedOutputReportedDuration = Math.max(...outputDecodeSpans.map(t => t.span));
  const outputProbeDurationErrorSeconds = Math.abs(outputDuration - expectedOutputReportedDuration);
  assert.ok(outputProbeDurationErrorSeconds < headerTolerance, "Output reported decode duration inconsistent");
  near(source.end - source.start, output.end - output.start, "Actual presentation span");
  return { source, output, packetIdentityAndClocks, clockToleranceSeconds: clockTolerance,
    headerToleranceSeconds: headerTolerance, sourceHeaderEndErrorSeconds, outputProbeDurationErrorSeconds,
    outputDecodeSpans, expectedOutputReportedDuration, serializedUnknownDurationsAndEditsChecked: true,
    rawFormatDurationDifferenceSeconds: Math.abs(sourceDuration - outputDuration),
    sourceHeaderMeaning: "Matroska zero-origin segment endpoint", outputHeaderMeaning: "Physical fMP4 durations unknown; FFprobe reports maximum fragment decode span before edits",
    defaultDurationNotUsedAsCadence: true, noTimestampRebasing: true, completeDecodedContentEqual: true };
}

export function validateComplexPositiveStartTimeline(input) {
  return validateComplexFragmentedTimeline({ ...input, requirePositiveStart: true });
}

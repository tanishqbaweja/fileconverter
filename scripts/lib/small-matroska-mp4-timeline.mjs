// Independent bounded fixture validation, never a converter or a large-file reader.
import assert from "node:assert/strict";
import { validateCopiedAudioTiming } from "./copied-audio-timing.mjs";

const CLOCK_SECONDS = 0.001, DURATION_SECONDS = 0.060;
const number = (value, name) => {
  assert.ok(typeof value === "string" && value.trim().length > 0, `${name} unavailable`);
  const result = Number(value);
  assert.ok(Number.isFinite(result), `${name} unavailable`);
  return result;
};
const trim = (packet, field) => {
  const rows = (packet.side_data_list ?? []).filter((row) => row.side_data_type === "Skip Samples");
  assert.ok(rows.length <= 1, "Duplicate decoder trim");
  if (!rows.length) return 0;
  assert.ok(Number.isSafeInteger(rows[0][field]) && rows[0][field] >= 0, `${field} unavailable`);
  return rows[0][field];
};
const near = (a, b, name) => assert.ok(Math.abs(a - b) <= CLOCK_SECONDS + 1e-12, `${name} changed`);
const frameStep = (rate) => {
  assert.ok(typeof rate === "string" && /^[1-9][0-9]*\/[1-9][0-9]*$/.test(rate), "CFR rate unavailable");
  const [n, d] = rate.split("/").map(Number);
  assert.ok(Number.isSafeInteger(n) && Number.isSafeInteger(d) && n / d >= 1 && n / d <= 120);
  return d / n;
};

function edges(probe, frames, packets) {
  const videos = probe.streams.filter((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  assert.equal(videos.length, 1, "Exactly one primary fixture video");
  assert.ok(frames.length >= 2 && frames.length <= 2048, "Small video frame history cap");
  assert.equal(Number(videos[0].nb_read_frames), frames.length, "Full decoded frame count");
  const step = frameStep(videos[0].avg_frame_rate);
  assert.ok(frames.every(Number.isFinite), "Video PTS unavailable");
  for (let i = 1; i < frames.length; i++) near(frames[i] - frames[i - 1], step, "CFR video step");
  const tracks = [{ type: "video", start: frames[0], end: frames.at(-1) + step }];
  const audio = probe.streams.filter((s) => s.codec_type === "audio");
  assert.ok(audio.length > 0 && audio.length <= 32);
  for (const stream of audio) {
    assert.equal(stream.codec_name, "aac", "This validator covers copied AAC only");
    const rate = number(stream.sample_rate, "Audio sample rate");
    assert.ok(Number.isSafeInteger(rate) && rate >= 8000 && rate <= 192000);
    const group = packets.filter((p) => p.stream_index === stream.index);
    assert.ok(group.length >= 2, "Audio needs a known final packet");
    const pts = group.map((p) => number(p.pts_time, "Audio PTS"));
    assert.ok(pts.every((p, i) => i === 0 || p > pts[i - 1]), "Audio PTS order");
    // Unknown preroll packet duration is not fabricated as zero. The final
    // known packet bounds the endpoint; exact packet/PCM/trim checks below
    // independently guard all content, including preroll and discarded tail.
    const last = group.at(-1), duration = number(last.duration_time, "Final audio packet duration");
    assert.ok(duration > 0 && duration <= 1);
    const start = pts[0] + trim(group[0], "skip_samples") / rate;
    const end = pts.at(-1) + duration - trim(last, "discard_padding") / rate;
    assert.ok(end > start, "Audio endpoint invalid");
    tracks.push({ type: "audio", index: stream.index, start, end });
  }
  return { tracks, start: Math.min(...tracks.map((t) => t.start)), end: Math.max(...tracks.map((t) => t.end)) };
}

/**
 * FFmpeg Matroska exposes the Segment Duration (zero-origin endpoint).
 * Fragmented MOV has unknown mvhd duration and estimates a presentation span.
 * Comparing those unlike scalars rejects preserved positive-start material.
 * Instead require exact per-track clocks/trim/decoded PCM/frame counts, then
 * check BOTH headers against packet-derived endpoints at the original 60ms.
 * This is deliberately restricted to bounded CFR Matroska -> MP4 AAC fixtures.
 */
export function validateSmallMatroskaMp4Timeline(input) {
  const { sourceProbe, outputProbe, sourceFrames, outputFrames, sourcePackets, outputPackets,
    sourceDecodedAudioHashes, outputDecodedAudioHashes } = input;
  assert.equal(sourceProbe.format.format_name, "matroska,webm", "Source container semantics unavailable");
  assert.equal(outputProbe.format.format_name, "mov,mp4,m4a,3gp,3g2,mj2", "Output container semantics unavailable");
  const sourceAudio = sourceProbe.streams.filter((s) => s.codec_type === "audio");
  const outputAudio = outputProbe.streams.filter((s) => s.codec_type === "audio");
  const copiedAudio = validateCopiedAudioTiming(sourcePackets, outputPackets,
    sourceAudio.map((s) => s.index), outputAudio.map((s) => s.index));
  assert.equal(sourceDecodedAudioHashes.length, sourceAudio.length, "Decoded audio tracks unavailable");
  assert.ok(sourceDecodedAudioHashes.every((h) => typeof h === "string" && /^SHA256=[a-f0-9]{64}$/.test(h)));
  assert.deepEqual(outputDecodedAudioHashes, sourceDecodedAudioHashes, "Complete decoded audio changed");
  assert.ok(sourceFrames.length >= 2 && sourceFrames.length <= 2048 &&
    outputFrames.length >= 2 && outputFrames.length <= 2048, "Small video frame history cap");
  assert.equal(sourceFrames.length, outputFrames.length, "Video frame count changed");
  for (let i = 0; i < sourceFrames.length; i++) near(sourceFrames[i], outputFrames[i], `Video ${i} PTS`);
  const source = edges(sourceProbe, sourceFrames, sourcePackets), output = edges(outputProbe, outputFrames, outputPackets);
  assert.equal(source.tracks.length, output.tracks.length);
  for (let i = 0; i < source.tracks.length; i++) {
    near(source.tracks[i].start, output.tracks[i].start, `Track ${i} audible start`);
    near(source.tracks[i].end, output.tracks[i].end, `Track ${i} presentation end`);
  }
  const sourceStart = number(sourceProbe.format.start_time, "Source header start");
  const outputStart = number(outputProbe.format.start_time, "Output header start");
  near(sourceStart, source.start, "Source header start"); near(outputStart, output.start, "Output header start");
  const sourceDuration = number(sourceProbe.format.duration, "Source header duration");
  const outputDuration = number(outputProbe.format.duration, "Output header duration");
  assert.ok(sourceDuration > 0 && outputDuration > 0);
  const sourceHeaderEndErrorSeconds = Math.abs(sourceDuration - source.end);
  const outputHeaderEndErrorSeconds = Math.abs(outputStart + outputDuration - output.end);
  assert.ok(sourceHeaderEndErrorSeconds < DURATION_SECONDS, "Source duration/header endpoint inconsistent");
  assert.ok(outputHeaderEndErrorSeconds < DURATION_SECONDS, "Output duration/header endpoint inconsistent");
  near(source.end - source.start, output.end - output.start, "Actual presentation duration");
  return { source, output, copiedAudio, clockToleranceSeconds: CLOCK_SECONDS,
    durationToleranceSeconds: DURATION_SECONDS, sourceHeaderEndErrorSeconds, outputHeaderEndErrorSeconds,
    rawFormatDurationDifferenceSeconds: Math.abs(sourceDuration - outputDuration),
    sourceHeaderMeaning: "Matroska zero-origin segment duration", outputHeaderMeaning: "Fragmented MP4 presentation span" };
}

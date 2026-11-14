import assert from "node:assert/strict";
import { compareSmallMkvPacketClocks } from "./mkv-direct-packet-clocks.mjs";
import { validateCopiedAudioTiming } from "./copied-audio-timing.mjs";

export const complexMkvFixture = Object.freeze({ file: "fixtures/media/complex-remux-source.mkv", bytes: 780989,
  sha256: "33d7ac90faed1d7598a5226bb0eae98892e4b4914080915b4902b7acf1f7f65f" });
export const bframeMkvFixture = Object.freeze({ file: "fixtures/media/within-test-h264-bframes.mkv", bytes: 765366,
  sha256: "a17d9a37d8336967551a71d1c8c4cea2024be53e182e14ecc28cdd254f727559" });

export function assertBFrameMkvSource(probe, packets) {
  assert.equal(probe.streams[0].codec_name, "h264");
  assert.equal(probe.streams[0].has_b_frames, 2, "Fixture must really use B frames");
  const video = packets.filter(p => p.stream_index === 0);
  assert.equal(video.length, 72);
  const pts = video.map(p => Number(p.pts_time));
  assert.ok(pts.every(Number.isFinite) && pts.some((p, i) => i > 0 && p < pts[i - 1]), "Fixture presentation order must differ from decode order");
  const missing = video.filter(p => p.dts_time === undefined || p.dts_time === "N/A").length;
  assert.equal(missing, 2, "Fixture keeps its two unavailable initial source DTS, never fabricates zero");
  assert.ok(video.slice(0, 2).every(p => p.dts_time === undefined || p.dts_time === "N/A") &&
    video.slice(2).every(p => /^-?\d+\.\d{6}$/.test(p.dts_time)), "Only the initial two source DTS may be unavailable");
  return { hasBFrames: 2, reorderedPresentationInDecodeOrder: true, unavailableSourceVideoDts: missing,
    availableSourceVideoDts: video.length - missing };
}

// Only the existing four-second fixture. Offline validators have a finite stdout
// and packet cap, never read media payloads into JS, and never remux an output.
export function compareComplexMkvPackets(source, output) {
  for (const rows of [source, output]) {
    assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 4096);
    assert.ok(rows.every(p => [0, 1, 2].includes(p.stream_index)));
  }
  const clocks = [];
  for (const index of [0, 1, 2]) {
    const before = source.filter(p => p.stream_index === index), after = output.filter(p => p.stream_index === index);
    assert.equal(before.length, [72, 189, 189][index]);
    assert.equal(after.length, before.length, `Stream ${index} packet count changed`);
    for (let i = 0; i < before.length; i++) {
      assert.match(before[i].data_hash ?? "", /^SHA256:[a-f0-9]{64}$/);
      assert.equal(after[i].data_hash, before[i].data_hash, `Stream ${index} payload/decode order changed at ${i}`);
    }
  }
  for (const audioIndex of [1, 2]) {
    const select = packets => packets.filter(p => p.stream_index === 0 || p.stream_index === audioIndex)
      .map(p => ({ ...p, stream_index: p.stream_index === 0 ? 0 : 1 }));
    const pair = compareSmallMkvPacketClocks(select(source), select(output));
    for (const row of pair) {
      assert.ok(row.maximumPtsErrorUs <= 1000, `Complex PTS changed by more than one Matroska tick: ${JSON.stringify(row)}`);
      assert.ok(row.outputDtsMonotonic && row.maximumComparableDtsErrorUs !== null && row.maximumComparableDtsErrorUs <= 1000,
        `Complex DTS changed or is unavailable/nonmonotonic: ${JSON.stringify(row)}`);
    }
    if (audioIndex === 1) clocks.push(pair[0]);
    clocks.push({ ...pair[1], streamIndex: audioIndex });
  }
  const video = source.filter(p => p.stream_index === 0).map(p => Number(p.pts_time));
  // Cadence is a presentation-order property. Packet payload/PTS/DTS checks
  // above deliberately remain in decode order, including reordered B frames.
  const presentation = [...video].sort((a, b) => a - b);
  const cadenceMs = [...new Set(presentation.slice(1).map((pts, i) => Math.round((pts - presentation[i]) * 1000)))].sort((a, b) => a - b);
  assert.ok(cadenceMs.includes(83) && cadenceMs.includes(42), "Existing VFR fixture must retain both presentation cadences");
  const aac = validateCopiedAudioTiming(source.filter(p => p.stream_index > 0), output.filter(p => p.stream_index > 0), [1, 2], [1, 2]);
  return { clocks, aac, sourceCadenceMs: cadenceMs, packetBytesIdentical: true, packetCounts: [72, 189, 189],
    cadenceMeasuredInPresentationOrder: true, sourceVideoPtsReorderedInDecodeOrder: video.some((p, i) => i > 0 && p < video[i - 1]),
    videoPresentationAndComparableDecodeTimesChecked: true,
    // Matroska DefaultDuration is not the varying inter-presentation interval.
    videoDefaultDurationNotUsedAsVfrCadence: true };
}

const rotation = stream => stream.side_data_list?.find(s => s.side_data_type === "Display Matrix")?.rotation;
const tag = (tags, name) => Object.entries(tags ?? {}).find(([key]) => key.toLowerCase() === name)?.[1];
export function assertComplexMkvStructure(source, output, warnings) {
  assert.deepEqual(source.streams.map(s => s.codec_type), ["video", "audio", "audio", "subtitle", "attachment"]);
  assert.equal(source.chapters.length, 2);
  assert.deepEqual(output.streams.map(s => s.codec_name), ["h264", "aac", "aac"]);
  assert.equal(output.streams[0].has_b_frames, source.streams[0].has_b_frames, "Video reorder depth changed");
  assert.match(output.format.format_name, /mp4/);
  const fields = ["width", "height", "pix_fmt", "sample_aspect_ratio", "display_aspect_ratio", "color_range",
    "color_space", "color_transfer", "color_primaries", "chroma_location", "field_order"];
  for (const field of fields) assert.equal(output.streams[0][field], source.streams[0][field], `Video ${field} changed`);
  assert.equal(rotation(source.streams[0]), 90); assert.equal(rotation(output.streams[0]), 90);
  for (const index of [1, 2]) {
    for (const field of ["profile", "sample_rate", "channels", "channel_layout"])
      assert.equal(output.streams[index][field], source.streams[index][field], `Audio ${index} ${field} changed`);
    assert.equal(output.streams[index].tags.language, source.streams[index].tags.language);
    assert.equal(output.streams[index].disposition.default, source.streams[index].disposition.default);
  }
  for (const name of ["title", "comment"]) assert.equal(tag(output.format.tags, name), tag(source.format.tags, name));
  for (const index of [0, 1, 2]) {
    assert.equal(tag(output.streams[index].tags, "title") ?? tag(output.streams[index].tags, "name"),
      tag(source.streams[index].tags, "title"), `Stream ${index} title changed`);
  }
  assert.deepEqual(output.chapters ?? [], []);
  const warningText = warnings.join(" ").toLowerCase();
  for (const excluded of ["subtitle", "attachment", "chapter"]) assert.ok(warningText.includes(excluded), `${excluded} exclusion not disclosed`);
  const durationDeltaSeconds = Math.abs(Number(output.format.duration) - Number(source.format.duration));
  assert.ok(Number.isFinite(durationDeltaSeconds) && durationDeltaSeconds < 0.05, "Complex container duration differs by at least 50 ms");
  return { videoFields: fields, rotationDegrees: 90, audioLanguages: output.streams.slice(1).map(s => s.tags.language),
    audioDefaultDispositions: output.streams.slice(1).map(s => s.disposition.default), titleAndCommentPreserved: true, streamTitlesPreserved: true,
    subtitleDisclosed: true, attachmentDisclosed: true, chapterDisclosed: true, durationDeltaSeconds };
}

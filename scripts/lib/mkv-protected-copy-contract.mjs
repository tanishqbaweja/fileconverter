import assert from "node:assert/strict";

export const mkvProtectedCopy = Object.freeze({ bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34",
  seconds: 12340.096, videoPackets: 296160, primingSamples: 5058, minOutputBytes: 2900000000, maxOutputBytes: 3100000000 });

export function assertMkvProtectedSource(source) {
  const [v, a, subtitle, image] = source.streams;
  assert.deepEqual(source.streams.map(s => [s.index, s.codec_name]), [[0, "hevc"], [1, "aac"], [2, "subrip"], [3, "png"]]);
  assert.deepEqual([v.profile, v.width, v.height, v.r_frame_rate, v.time_base], ["Main", 1920, 804, "24/1", "1/1000"]);
  assert.deepEqual([a.profile, a.sample_rate, a.channels, a.channel_layout, a.tags?.language], ["HE-AAC", "48000", 6, "5.1", "hin"]);
  assert.equal(subtitle.tags?.language, "eng");
  assert.deepEqual([image.width, image.height, image.disposition.attached_pic], [250, 140, 1]);
  assert.deepEqual([Number(source.format.duration), Number(source.format.size)], [mkvProtectedCopy.seconds, mkvProtectedCopy.bytes]);
  assert.equal(source.format.format_name, "matroska,webm");
  assert.deepEqual(source.chapters, []);
}

export function assertMkvProtectedOutput(source, output, warnings, bytes) {
  assertMkvProtectedSource(source);
  assert.deepEqual(output.streams.map(s => [s.index, s.codec_name]), [[0, "hevc"], [1, "aac"]]);
  assert.match(output.format.format_name, /mp4/);
  assert.equal(Number(output.format.size), bytes);
  assert.ok(bytes >= mkvProtectedCopy.minOutputBytes && bytes <= mkvProtectedCopy.maxOutputBytes);
  assert.deepEqual(output.chapters, source.chapters);
  const comparable = [["profile", "width", "height", "r_frame_rate", "sample_aspect_ratio", "display_aspect_ratio", "pix_fmt",
    "color_range", "color_space", "color_transfer", "color_primaries", "chroma_location"],
  ["profile", "sample_rate", "channels", "channel_layout", "extradata_size"]];
  for (const [index, fields] of comparable.entries()) {
    for (const field of fields) assert.ok(output.streams[index][field] === source.streams[index][field], `Stream ${index} ${field} changed`);
    for (const flag of ["default", "forced", "hearing_impaired", "visual_impaired", "comment", "original"])
      assert.ok(output.streams[index].disposition[flag] === source.streams[index].disposition[flag], `Stream ${index} disposition ${flag} changed`);
  }
  assert.equal(output.streams[1].tags?.language, "hin");
  const subtitleDisclosed = warnings.some(text => /subtitle.*(excluded|not supported|cannot)/i.test(text));
  const artworkDisclosed = warnings.some(text => /(attached picture|attachment|cover art).*(excluded|not supported|cannot)/i.test(text));
  assert.ok(subtitleDisclosed && artworkDisclosed, "Both documented exclusions must be disclosed by the browser");
  return { streamPropertiesMatch: true, languagePreserved: true, subtitleDisclosed, artworkDisclosed,
    durationDeltaSeconds: Math.abs(Number(output.format.duration) - Number(source.format.duration)) };
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeAudioMuxerOrderCandidate } from "./audio-muxer-order-candidate.mjs";
export function makeAudioOggArtworkCandidate(parent, helper, orderHelper, artworkHelper, options) {
  const base = makeAudioMuxerOrderCandidate(parent, helper, orderHelper, options);
  assert.ok(artworkHelper.startsWith("#ifndef WITHIN_AUDIO_OGG_ARTWORK_H\n"));
  assert.match(artworkHelper, /static int add_bounded_ogg_audio_artwork\(/);
  const before = "  AVStream *artwork_output_stream = NULL;\n  if (artwork_stream_index >= 0) {\n";
  const after = '  if (artwork_stream_index >= 0 && (opus_output || vorbis_output)) {\n' +
    '    AVStream *cover = input_format->streams[artwork_stream_index];\n' +
    '    int width = 0, height = 0;\n' +
    '    if (!audio_artwork_dimensions(cover, &width, &height)) {\n' +
    '      result = AVERROR_INVALIDDATA; goto cleanup;\n' +
    '    }\n' +
    '    result = add_bounded_ogg_audio_artwork(&output_stream->metadata, cover, width, height);\n' +
    '    if (result < 0) {\n' +
    '      report_av_error("Bounded Ogg cover serialization failed", result);\n' +
    '      goto cleanup;\n' +
    '    }\n' +
    '  }\n' +
    '  AVStream *artwork_output_stream = NULL;\n' +
    '  if (artwork_stream_index >= 0 && !opus_output && !vorbis_output) {\n';
  const edits = [
    [orderHelper + "\n", orderHelper + "\n" + artworkHelper + "\n"],
    ["      if (!mp3_output && !flac_output) {\n", "      if (!mp3_output && !flac_output && !opus_output && !vorbis_output) {\n"],
    ["bounded MP3/FLAC artwork accepts JPEG or PNG.", "bounded MP3/FLAC/Ogg/Opus artwork accepts JPEG or PNG."],
    [before, after],
  ];
  let generated = base.generated;
  const start = generated.indexOf("static int within_audio_transcode("), end = generated.indexOf("static int write_video_packets(", start);
  assert.ok(start > 0 && end > start);
  for (const [old, replacement] of edits.slice(1)) {
    assert.equal(generated.slice(start, end).split(old).length, 2, "Only the selected audio function may change");
    assert.equal(generated.split(old).length, 2); generated = generated.replace(old, replacement);
  }
  assert.equal(generated.split(edits[0][0]).length, 2); generated = generated.replace(...edits[0]);
  let reversed = generated;
  // Header insertion occurred last, while the audio edits retain their order.
  for (const [old, replacement] of [edits[0], ...edits.slice(1).toReversed()]) {
    assert.equal(reversed.split(replacement).length, 2); reversed = reversed.replace(replacement, old);
  }
  assert.equal(reversed, base.generated);
  const sha = value => createHash("sha256").update(value).digest("hex");
  return { generated, generatedSha256: sha(generated), parentSha256: base.parentSha256, helperSha256: base.helperSha256,
    muxerOrderHelperSha256: base.muxerOrderHelperSha256, artworkHelperSha256: sha(artworkHelper), sixEditSourceSha256: base.generatedSha256,
    extraEdits: edits, allowedSourceEdits: 10, scope: "private-bounded-Ogg-Opus-picture-comment-preservation",
    codecSettingsChanged: false, ioChanged: false, memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false };
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeAudioCommentWrapperCandidate } from "./audio-comment-wrapper-candidate.mjs";
export function makeAudioMuxerOrderCandidate(parent, helper, orderHelper, options) {
  const base = makeAudioCommentWrapperCandidate(parent, helper, options);
  assert.ok(orderHelper.startsWith("#ifndef WITHIN_AUDIO_MUXER_METADATA_ORDER_H\n"));
  assert.match(orderHelper, /static int partition_bounded_audio_muxer_metadata\(AVDictionary \*\*metadata\)/);
  const before = "  result = avformat_write_header(output_format, &muxer_options);\n  av_dict_free(&muxer_options);\n";
  const after = '  if (flac_output) {\n' +
    '    result = partition_bounded_audio_muxer_metadata(&output_format->metadata);\n' +
    '    if (result < 0) {\n' +
    '      report_av_error("Bounded FLAC metadata order preparation failed", result);\n' +
    '      goto cleanup;\n' +
    '    }\n' +
    '  }\n' + before;
  const edits = [[helper + "\n", helper + "\n" + orderHelper + "\n"], [before, after]];
  // Video header calls look similar: restrict the call edit to audio's function.
  let generated = base.generated;
  assert.equal(generated.split(edits[0][0]).length, 2); generated = generated.replace(...edits[0]);
  const start = generated.indexOf("static int within_audio_transcode("), end = generated.indexOf("static int write_video_packets(", start);
  assert.ok(start > 0 && end > start); const audio = generated.slice(start, end); assert.equal(audio.split(before).length, 2);
  generated = generated.slice(0, start) + audio.replace(before, after) + generated.slice(end);
  let reversed = generated;
  for (const [old, replacement] of edits.toReversed()) { assert.equal(reversed.split(replacement).length, 2); reversed = reversed.replace(replacement, old); }
  assert.equal(reversed, base.generated);
  const sha = value => createHash("sha256").update(value).digest("hex");
  return { generated, generatedSha256: sha(generated), parentSha256: base.parentSha256, helperSha256: base.helperSha256,
    muxerOrderHelperSha256: sha(orderHelper), fourEditSourceSha256: base.generatedSha256, extraEdits: edits, allowedSourceEdits: 6,
    scope: "private-FLAC-only-stable-order-around-muxer-reserved-fields", codecSettingsChanged: false, ioChanged: false,
    memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false };
}

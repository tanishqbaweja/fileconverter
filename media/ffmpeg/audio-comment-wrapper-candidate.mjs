// Compose a fourth, audio-metadata-only edit on the audited three-edit parent.
// Parser preservation alone is insufficient: plain av_dict_copy loses duplicates.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeAudioTextMetadataCandidate } from "./audio-text-metadata-candidate.mjs";
export function makeAudioCommentWrapperCandidate(parent, helper, options) {
  const base = makeAudioTextMetadataCandidate(parent, helper, options);
  const before = '  av_dict_copy(&output_stream->metadata, input_stream->metadata, 0);\n' +
    '  av_dict_copy(&output_format->metadata, input_format->metadata, 0);\n  if (mp3_output || flac_output) {';
  const after = '  if (opus_output || vorbis_output) {\n' +
    '    /* Preserve stream precedence and repeated winning-scope values before\n' +
    '     * Ogg merges container defaults. Never reconstruct from the lossy copy. */\n' +
    '    result = merge_bounded_audio_text_metadata(\n' +
    '        &output_stream->metadata, input_stream->metadata,\n' +
    '        input_format->metadata);\n' +
    '    if (result < 0) {\n' +
    '      report_av_error("Bounded Ogg stream metadata copy failed", result);\n' +
    '      goto cleanup;\n' +
    '    }\n' +
    '  } else {\n' +
    '    av_dict_copy(&output_stream->metadata, input_stream->metadata, 0);\n' +
    '  }\n' +
    '  av_dict_copy(&output_format->metadata, input_format->metadata, 0);\n  if (mp3_output || flac_output) {';
  const start = base.generated.indexOf("static int within_audio_transcode("), end = base.generated.indexOf("static int write_video_packets(", start);
  assert.ok(start > 0 && end > start); assert.equal(base.generated.split(before).length, 2);
  assert.equal(base.generated.slice(start, end).split(before).length, 2);
  const generated = base.generated.replace(before, after); assert.equal(generated.replace(after, before), base.generated);
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"), parentSha256: base.parentSha256,
    helperSha256: base.helperSha256, threeEditSourceSha256: base.generatedSha256, allowedSourceEdits: 4, extraEdits: [[before, after]],
    scope: "private-bounded-Ogg-stream-copy-preserving-existing-stream-precedence", codecSettingsChanged: false, ioChanged: false,
    memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false };
}

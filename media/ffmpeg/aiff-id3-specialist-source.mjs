// Private metadata-only derivative of the exact published AIFF specialist.
// Never alter public C, codec settings, audio samples, I/O, or memory limits.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const PUBLISHED_AIFF_SOURCE_SHA256 = "a542881bee3e4cd407f61be87d284fabe6a9ab7b70d2c1db63e542f745395814";
export const AIFF_ID3_SPECIALIST_EDITS = Object.freeze([
  ['if (!mp3_output && !flac_output) {', 'if (!mp3_output && !flac_output && !aiff_output) {'],
  ['bounded MP3/FLAC artwork accepts JPEG or PNG.', 'bounded MP3/FLAC/AIFF artwork accepts JPEG or PNG.'],
  ['if (mp3_output || flac_output) {', 'if (mp3_output || flac_output || aiff_output) {'],
  ['  AVStream *artwork_output_stream = NULL;\n',
    '  if (aiff_output && !av_dict_get(output_format->metadata, "author", NULL, 0)) {\n' +
    '    AVDictionaryEntry *artist =\n' +
    '        av_dict_get(output_format->metadata, "artist", NULL, 0);\n' +
    '    if (artist) {\n' +
    '      result = av_dict_set(&output_format->metadata, "author", artist->value, 0);\n' +
    '      if (result < 0) {\n' +
    '        report_av_error("AIFF author metadata mapping failed", result);\n' +
    '        goto cleanup;\n' +
    '      }\n' +
    '    }\n' +
    '  }\n\n' +
    '  AVStream *artwork_output_stream = NULL;\n'],
  ['  if (alac_output || m4a_aac_output) {\n',
    '  if (aiff_output) {\n' +
    '    result = av_dict_set(&muxer_options, "write_id3v2", "1", 0);\n' +
    '    if (result < 0) {\n' +
    '      report_av_error("AIFF ID3 muxer option failed", result);\n' +
    '      goto cleanup;\n' +
    '    }\n' +
    '  }\n' +
    '  if (alac_output || m4a_aac_output) {\n'],
].map(edit => Object.freeze(edit)));

export function makeAiffId3SpecialistSource(source) {
  assert.equal(createHash("sha256").update(source).digest("hex"), PUBLISHED_AIFF_SOURCE_SHA256,
    "Published specialist source changed; never repin historical acceptance");
  let candidate = source;
  for (const [before, after] of AIFF_ID3_SPECIALIST_EDITS) {
    assert.equal(candidate.split(before).length, 2, "Expected exactly one metadata boundary");
    candidate = candidate.replace(before, after);
  }
  let reversed = candidate;
  for (const [before, after] of AIFF_ID3_SPECIALIST_EDITS.toReversed()) {
    assert.equal(reversed.split(after).length, 2, "Expected exactly one reversible metadata delta");
    reversed = reversed.replace(after, before);
  }
  assert.equal(reversed, source, "Every non-metadata specialist byte must remain exact");
  return candidate;
}

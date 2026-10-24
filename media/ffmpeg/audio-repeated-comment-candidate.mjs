// One reversible metadata-only upstream patch, for a private candidate build.
// The caller must use the existing checksum-pinned FFmpeg8.1.2 source archive.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const AUDIO_COMMENT_FFMPEG_ARCHIVE_SHA256 = "464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c";
const sha = text => createHash("sha256").update(text).digest("hex");
export function makeAudioRepeatedCommentCandidate(source, { sourceArchiveSha256 } = {}) {
  assert.equal(sourceArchiveSha256, AUDIO_COMMENT_FFMPEG_ARCHIVE_SHA256, "Unpinned dependency source is not a reproducible candidate");
  assert.ok(typeof source === "string" && Buffer.byteLength(source) <= 1048576);
  const start = source.indexOf("static int vorbis_parse_single_comment("), end = source.indexOf("\nint ff_vorbis_comment(", start);
  assert.ok(start >= 0 && end > start, "Expected the authenticated FFmpeg comment parser");
  const before = '        if (av_dict_get(*m, t, NULL, 0))\n' +
    '            av_dict_set(m, t, ";", AV_DICT_APPEND);\n' +
    '        av_dict_set(m, t, v, AV_DICT_APPEND);';
  const after = '        const int result = av_dict_set(m, t, v, AV_DICT_MULTIKEY);\n' +
    '        if (result < 0) {\n' +
    '            t[tl] = \'=\';\n' +
    '            v[vl] = backup;\n' +
    '            return result;\n' +
    '        }';
  assert.equal(source.split(before).length, 2); assert.equal(source.slice(start, end).split(before).length, 2);
  const generated = source.replace(before, after); assert.equal(generated.split(after).length, 2); assert.equal(generated.replace(after, before), source);
  return { generated, originalSha256: sha(source), generatedSha256: sha(generated), sourceArchiveSha256,
    edits: [[before, after]], scope: "private-single-comment-parser-multikey-preservation", codecSettingsChanged: false,
    ioChanged: false, memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false };
}

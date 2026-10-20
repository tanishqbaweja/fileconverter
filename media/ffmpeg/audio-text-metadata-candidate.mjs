// Exact metadata-only source derivative. Published sources/binaries stay untouched
// until real browser preservation, correctness, memory and promotion gates pass.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = text => createHash("sha256").update(text).digest("hex");
export const AUDIO_METADATA_PARENT_SHA256 = "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068";
export function makeAudioTextMetadataCandidate(source, helper, { expectedParentSha256 = AUDIO_METADATA_PARENT_SHA256 } = {}) {
  assert.match(expectedParentSha256, /^[0-9a-f]{64}$/);
  assert.equal(sha(source), expectedParentSha256, "Never repin or overwrite an unverified published/source preimage");
  const start = source.indexOf("static int merge_common_audio_text_metadata("), end = source.indexOf("\nstatic int within_audio_transcode(", start);
  assert.ok(start > 0 && end > start);
  const original = source.slice(start, end);
  assert.ok(original.includes('"title", "artist", "album", "genre", "date", "track", "comment"'));
  assert.ok(helper.startsWith("#ifndef WITHIN_AUDIO_TEXT_METADATA_H\n"));
  assert.ok(helper.includes("static int merge_bounded_audio_text_metadata("));
  const edits = [[original, helper + "\n"], ["result = merge_common_audio_text_metadata(", "result = merge_bounded_audio_text_metadata("],
    ['      report_av_error("Common audio metadata copy failed", result);',
      '      if (result == AVERROR(ENOSPC)) {\n' +
      '        within_message(2, "Audio metadata exceeds the bounded 4096-entry / 2 MiB text allowance; refusing silent tag loss.");\n' +
      '      } else {\n' +
      '        report_av_error("Bounded audio metadata copy failed", result);\n' +
      '      }']];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source);
  return { generated, generatedSha256: sha(generated), parentSha256: sha(source), helperSha256: sha(helper), edits,
    scope: "private-checked-bounded-audio-metadata-merge-only", codecSettingsChanged: false, ioChanged: false,
    memoryLimitsRaised: false, publicAcceptance: false, browserFixVerified: false };
}

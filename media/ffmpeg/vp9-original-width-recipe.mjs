// PRIVATE original-resolution candidate. Public policy remains unchanged.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeVp9StreamDurationSource } from "./vp9-stream-duration-recipe.mjs";
const sha = value => createHash("sha256").update(value).digest("hex");
export function makeVp9OriginalWidthSource(source) {
  const duration = makeVp9StreamDurationSource(source), start = duration.generated.indexOf("static int within_video_reencode("),
    end = duration.generated.indexOf("  if (input.size <= 0)", start);
  assert.ok(start > 0 && end > start, "Exact video-reencode validation boundary required");
  const before = duration.generated.slice(start, end), anchor = "      !valid_video_max_width(requested_max_width) ||\n";
  assert.equal(before.split(anchor).length, 2);
  const after = before.replace(anchor,
    "      !(valid_video_max_width(requested_max_width) ||\n" +
    "        (vp9 && requested_max_width == 1920)) ||\n");
  const generated = duration.generated.replace(before, after), edits = [...duration.edits, [before, after]];
  let reversed = generated;
  for (const [oldText, newText] of edits.toReversed()) { assert.equal(reversed.split(newText).length, 2); reversed = reversed.replace(newText, oldText); }
  assert.equal(reversed, source);
  return { generated, edits, parentSha256: sha(source), generatedSha256: sha(generated), streamDurationCandidateSha256: duration.generatedSha256,
    scope: "Private VP9-only explicit1920 width qualification; retain existing default640 policy and all bitrate/quality/thread/memory guards",
    investigation: "evidence/2026-11-06-vp9-original-cpu-startup-attempt2.json",
    privateVp9ExplicitWidth: 1920, proposedBitRateBps: 4000000, publicWidthRegistryOrControlsChanged: false,
    otherCodecsAndWidthsUnchanged: true, defaultWidthPolicyChanged: false, codecSettingsChanged: false, ioChanged: false,
    memoryLimitsRaised: false, nativeBuildExecuted: false, browserValidated: false, publicAcceptance: false };
}

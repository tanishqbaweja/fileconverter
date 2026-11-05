import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { makeVp9OriginalWidthSource } from "../media/ffmpeg/vp9-original-width-recipe.mjs";
import { makeVp9StreamDurationSource } from "../media/ffmpeg/vp9-stream-duration-recipe.mjs";
const source = await readFile(new URL("../media/ffmpeg/within_remux.c", import.meta.url), "utf8"), sha = value => createHash("sha256").update(value).digest("hex");
test("original-width candidate is three exact reversible edits, retaining both verified duration corrections", () => {
  const result = makeVp9OriginalWidthSource(source), duration = makeVp9StreamDurationSource(source);
  assert.equal(result.edits.length, 3); assert.equal(result.streamDurationCandidateSha256, duration.generatedSha256);
  assert.deepEqual(result.edits.slice(0, 2), duration.edits);
  let reversed = result.generated; for (const [before, after] of result.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source); assert.equal(result.generatedSha256, sha(result.generated));
  assert.equal(sha(source), "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068");
});
test("only VP9 explicit1920 is newly allowed, not an unbounded width or changed public/default memory policy", () => {
  const result = makeVp9OriginalWidthSource(source), [[before, after]] = result.edits.slice(2);
  assert.equal(after.replace("!(valid_video_max_width(requested_max_width) ||\n        (vp9 && requested_max_width == 1920))", "!valid_video_max_width(requested_max_width)"), before);
  assert.ok(after.includes("!valid_video_bit_rate(requested_bit_rate)")); assert.ok(after.includes("!valid_video_frame_rate(requested_frame_rate)"));
  assert.equal(result.proposedBitRateBps, 4000000);
  for (const field of ["publicWidthRegistryOrControlsChanged", "defaultWidthPolicyChanged", "codecSettingsChanged", "ioChanged", "memoryLimitsRaised", "nativeBuildExecuted", "browserValidated", "publicAcceptance"])
    assert.equal(result[field], false);
  const offset = result.generated.indexOf(after), duration = makeVp9StreamDurationSource(source).generated;
  assert.equal(result.generated.slice(offset + after.length), duration.slice(duration.indexOf(before) + before.length));
});
test("missing/duplicated width validation anchors fail instead of changing another codec or globally raising safety allowlists", () => {
  for (const changed of [source.replace("      !valid_video_max_width(requested_max_width) ||", "      missing_width_guard ||"),
    source.replace("      !valid_video_max_width(requested_max_width) ||", "      !valid_video_max_width(requested_max_width) ||\n      !valid_video_max_width(requested_max_width) ||")])
    assert.throws(() => makeVp9OriginalWidthSource(changed));
});
test("three-edit candidate also derives from the exact authenticated general-core base rather than only canonical source", async context => {
  const base = await readFile(new URL("../work/vp9-duration-input-42020605269/within_remux.base.c", import.meta.url), "utf8")
    .catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (base === null) { context.skip("Optional authenticated local tools absent; canonical derivation still mandatory"); return; }
  const result = makeVp9OriginalWidthSource(base);
  assert.equal(result.parentSha256, "ff8926c995010617bcc76701f0ea75feb5a2c99dadb136d8b8d1c8703e5d6dcd");
  assert.equal(result.streamDurationCandidateSha256, "3742b033b2dc4ebd4e27b0017eff0540ee6298c91893099d1a81f925b8affb52");
  assert.equal(result.edits.length, 3); assert.equal(result.nativeBuildExecuted, false);
});

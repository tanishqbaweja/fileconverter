// One private, reversible input-gain policy change in checksum-pinned LAME4.0.
// No quantizer, bitrate, lookahead, buffer, thread, format or wrapper changes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const MP3_GAIN_ARCHIVE_SHA256 = "3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb";
export const MP3_GAIN_PARENT_SHA256 = "feb47d97b3014e201d52fa75930b02e18c18568caf6b2f9d9bb02a42a0313ec3";
const sha = text => createHash("sha256").update(text).digest("hex");
export function makeMp3InputGainCandidate(source, { sourceArchiveSha256 } = {}) {
  assert.equal(sourceArchiveSha256, MP3_GAIN_ARCHIVE_SHA256); assert.equal(typeof source, "string");
  assert.equal(sha(source), MP3_GAIN_PARENT_SHA256, "Only the exact audited LAME4.0 presets may be patched");
  const before = "    lame_set_scale(gfp, lame_get_scale(gfp) * abr_switch_map[r].scale);";
  const after = "    /* Within private candidate: retain caller input gain instead of preset attenuation. */\n" +
    "    (void) abr_switch_map[r].scale;";
  assert.equal(source.split(before).length, 2); const generated = source.replace(before, after);
  assert.equal(generated.replace(after, before), source);
  return { generated, originalSha256: sha(source), generatedSha256: sha(generated), sourceArchiveSha256,
    sourceEdits: 1, scope: "private-LAME-preset-input-gain-policy-only", codecSettingsChanged: true,
    bitRateAndQualityUnchanged: true, ioChanged: false, memoryLimitsRaised: false,
    browserFixVerified: false, clippingAcceptance: false, publicAcceptance: false };
}

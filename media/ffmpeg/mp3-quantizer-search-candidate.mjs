// One exact private encoder-search change. No gain, bitrate, I/O or heap change.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeAudioOggArtworkCandidate } from "./audio-ogg-artwork-candidate.mjs";
export const MP3_QUANTIZER_PARENT_SHA256 = "92ed2d1ef8c3446eccf3895a37169ce440d50d53cf93f605616c2f6e74e690ed";
const sha = text => createHash("sha256").update(text).digest("hex");
export function makeMp3QuantizerSearchCandidate(source) {
  assert.equal(sha(source), MP3_QUANTIZER_PARENT_SHA256, "Only the exact ten-edit metadata wrapper may be extended");
  const before = '    av_dict_set(&encoder_options, "compression_level", "9", 0);';
  const after = '    av_dict_set(&encoder_options, "compression_level", "2", 0);';
  assert.equal(source.split(before).length, 2);
  const generated = source.replace(before, after); assert.equal(generated.replace(after, before), source);
  return { generated, parentCompiledSha256: sha(source), generatedSha256: sha(generated), sourceEdits: 1,
    priorCompressionLevel: 9, compressionLevel: 2, bitRateUnchanged: true, inputGainUnchanged: true,
    ioChanged: false, memoryLimitsRaised: false, clippingAcceptance: false, publicAcceptance: false };
}
export function makeMp3QuantizerSearchCore(parent, helper, orderHelper, artworkHelper, options) {
  const base = makeAudioOggArtworkCandidate(parent, helper, orderHelper, artworkHelper, options);
  const { generated, ...policy } = makeMp3QuantizerSearchCandidate(base.generated);
  return { ...base, generated, generatedSha256: sha(generated), mp3QuantizerSearchPolicy: policy,
    allowedSourceEdits: 11, codecSettingsChanged: true, bitRateUnchanged: true,
    scope: "private-MP3-quantization-search-candidate-not-clipping-or-public-acceptance" };
}

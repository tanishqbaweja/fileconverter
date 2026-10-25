import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = text => createHash("sha256").update(text).digest("hex");
export const AUDIO_OGG_ARTWORK_BASELINE_SHA256 = "aa4c4f2d3f3432116e2dcfa02625446c0de8a1a6af0ea409f3c96cdbff6ac6ff";

// Derive a private experiment; NEVER edit the already measured baseline header.
// Keep libavutil's encoder. Only complete three-byte groups can be concatenated:
// a <=3-byte bridge joins the header remainder and beginning of the image.
export function makeAudioOggArtworkLowerCopyCandidate(source) {
  assert.equal(sha(source), AUDIO_OGG_ARTWORK_BASELINE_SHA256, "Use the measured, unchanged serializer baseline");
  const edits = [
    ["  uint8_t *block = av_malloc(block_bytes);\n  char *encoded = NULL;\n  if (!block) { result = AVERROR(ENOMEM); goto cleanup; }\n",
      "  /* At most 32 fixed bytes, 10 MIME bytes and 4095 description bytes. */\n  uint8_t header[32 + 10 + 4095];\n  char *encoded = NULL;\n"],
    ["  uint8_t *at = block;\n", "  uint8_t *at = header;\n"],
    ["  memcpy(at, artwork->attached_pic.data, (size_t)artwork->attached_pic.size);\n" +
      "  if (!av_base64_encode(encoded, (int)encoded_bytes, block, (int)block_bytes)) {\n" +
      "    result = AVERROR_INVALIDDATA; goto cleanup;\n  }\n",
      "  const size_t header_bytes = (size_t)(at - header);\n" +
      "  const size_t prefix_bytes = header_bytes - header_bytes % 3;\n" +
      "  size_t written = 0;\n" +
      "  if (!av_base64_encode(encoded, (int)encoded_bytes, header, (int)prefix_bytes)) {\n" +
      "    result = AVERROR_INVALIDDATA; goto cleanup;\n  }\n" +
      "  written += prefix_bytes / 3 * 4;\n" +
      "  const uint8_t *image = artwork->attached_pic.data;\n" +
      "  size_t remaining_image_bytes = (size_t)artwork->attached_pic.size;\n" +
      "  const size_t remainder = header_bytes - prefix_bytes;\n" +
      "  if (remainder) {\n" +
      "    uint8_t bridge[3];\n" +
      "    const size_t take = remaining_image_bytes < 3 - remainder ? remaining_image_bytes : 3 - remainder;\n" +
      "    memcpy(bridge, header + prefix_bytes, remainder);\n" +
      "    memcpy(bridge + remainder, image, take);\n" +
      "    if (!av_base64_encode(encoded + written, (int)(encoded_bytes - written), bridge, (int)(remainder + take))) {\n" +
      "      result = AVERROR_INVALIDDATA; goto cleanup;\n    }\n" +
      "    written += (remainder + take + 2) / 3 * 4;\n" +
      "    image += take; remaining_image_bytes -= take;\n" +
      "  }\n" +
      "  if (remaining_image_bytes && !av_base64_encode(encoded + written, (int)(encoded_bytes - written), image, (int)remaining_image_bytes)) {\n" +
      "    result = AVERROR_INVALIDDATA; goto cleanup;\n  }\n"],
    ["  av_free(block); av_free(encoded); av_dict_free(&next);\n", "  av_free(encoded); av_dict_free(&next);\n"],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source);
  return { generated, generatedSha256: sha(generated), baselineSha256: sha(source), edits,
    scope: "private-lower-copy-picture-serialization-experiment", maximumHeaderStackBytes: 4137, maximumBridgeStackBytes: 3,
    codecSettingsChanged: false, ioChanged: false, memoryLimitsRaised: false,
    browserSpeedVerified: false, browserConversionVerified: false, publicAcceptance: false };
}

// The Matroska reader deliberately skips HEVC header parsing upstream. In our
// decoder-free HEVC copy core that prevents the validated SPS delay export.
// Change only that reader policy; never decode/re-encode a picture or guess DTS.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const hevcHeaderParserBuildRef = "codex/mkv-hevc-header-parser-native-20261115";
export const hevcMatroskaParentSha256 = "45261fc3f0bc3f3cce0395966eeadfdacc4779d97fb4b31d2ae490a2ce99e093";
export const hevcMatroskaHeaderSha256 = "4aabbf70e250dbb3f3538abe27ae1e6030b336e794a055e846488437c9d4c1ee";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function makeHevcMatroskaHeaderParser(bytes) {
  assert.equal(sha(bytes), hevcMatroskaParentSha256, "Exact FFmpeg8.1.2 Matroska reader required");
  const before = "    if (par->codec_id != AV_CODEC_ID_HEVC)\n        sti->need_parsing = AVSTREAM_PARSE_HEADERS;";
  const after = "    /* Private stream-copy core: HEVC SPS metadata must reach the parser\n       even when no HEVC decoder is linked. Parse headers, never pictures. */\n    sti->need_parsing = AVSTREAM_PARSE_HEADERS;";
  const original = bytes.toString(); assert.equal(original.split(before).length, 2);
  const generated = original.replace(before, () => after); assert.equal(generated.split(after).length, 2);
  assert.equal(generated.replace(after, () => before), original); assert.equal(sha(generated), hevcMatroskaHeaderSha256);
  return { generated, proof: { parentSha256: hevcMatroskaParentSha256, generatedSha256: hevcMatroskaHeaderSha256,
    exactReversal: true, onlyHevcHeaderParsingPolicyChanged: true, decodedPicturesAdded: false,
    probeBoundsChanged: false, startupBoundsChanged: false, wasmBoundsChanged: false,
    upstream: "https://github.com/FFmpeg/FFmpeg/blob/n8.1.2/libavformat/matroskadec.c#L2828" } };
}

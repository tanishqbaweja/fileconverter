import { createHash } from "node:crypto";
import { makeAudioOggArtworkCandidate } from "./audio-ogg-artwork-candidate.mjs";
import { makeAudioOggArtworkLowerCopyCandidate } from "./audio-ogg-artwork-lower-copy-candidate.mjs";
export function makeAudioOggArtworkLowerCopyCore(parent, helper, orderHelper, artworkHelper, options) {
  const original = makeAudioOggArtworkCandidate(parent, helper, orderHelper, artworkHelper, options);
  const lower = makeAudioOggArtworkLowerCopyCandidate(artworkHelper);
  const candidate = makeAudioOggArtworkCandidate(parent, helper, orderHelper, lower.generated, options);
  return { ...candidate, allowedSourceEdits: 14, artworkHelperSha256: lower.baselineSha256,
    lowerCopyArtworkHelperSha256: lower.generatedSha256, lowerCopyParentCompiledSha256: original.generatedSha256,
    compiledSourceSha256: createHash("sha256").update(candidate.generated).digest("hex"),
    scope: "private-lower-copy-Ogg-artwork-not-browser-performance-acceptance" };
}

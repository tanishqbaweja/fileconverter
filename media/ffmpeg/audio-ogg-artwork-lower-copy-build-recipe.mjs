import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeAudioOggArtworkBuildRecipe } from "./audio-ogg-artwork-build-recipe.mjs";
export function makeAudioOggArtworkLowerCopyBuildRecipe(source) {
  const base = makeAudioOggArtworkBuildRecipe(source);
  const before = '  cp -- "${BUILD_ROOT}/within_remux.metadata.c" "${BUILD_ROOT}/within_remux.c"\n';
  const after = '  node "${SCRIPT_DIR}/make-audio-ogg-artwork-lower-copy-candidate.mjs"\n' + before;
  assert.equal(base.generated.split(before).length, 2);
  const generated = base.generated.replace(before, after);
  assert.equal(generated.replace(after, before), base.generated);
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"),
    baselineRecipeSha256: base.generatedSha256, codecSettingsChanged: false, ioChanged: false,
    memoryLimitsRaised: false, browserSpeedVerified: false, publicAcceptance: false };
}

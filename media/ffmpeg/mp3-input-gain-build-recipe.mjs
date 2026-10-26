import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeAudioOggArtworkBuildRecipe } from "./audio-ogg-artwork-build-recipe.mjs";
export function makeMp3InputGainBuildRecipe(source) {
  const base = makeAudioOggArtworkBuildRecipe(source);
  const before = 'run_build_step ./build-lame.sh "${BUILD_ROOT}/lame"\n';
  const after = 'node "${SCRIPT_DIR}/make-mp3-input-gain-candidate.mjs" "${BUILD_ROOT}/lame/libmp3lame/presets.c" "${OUTPUT_ROOT}"\n' + before;
  assert.equal(base.generated.split(before).length, 2); const generated = base.generated.replace(before, after);
  assert.equal(generated.replace(after, before), base.generated);
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"),
    baseRecipeSha256: base.generatedSha256, codecSettingsChanged: true,
    bitRateAndQualityUnchanged: true, memoryLimitsRaised: false, publicAcceptance: false };
}

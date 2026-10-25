import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeAudioRepeatedCommentBuildRecipe } from "./audio-repeated-comment-build-recipe.mjs";
export function makeAudioOggArtworkBuildRecipe(source) {
  const base = makeAudioRepeatedCommentBuildRecipe(source, { preserveStreamComments: true, preserveMuxerOrder: true });
  const before = '  cp -- "${BUILD_ROOT}/within_remux.metadata.c" "${BUILD_ROOT}/within_remux.c"\n';
  const after = '  node "${SCRIPT_DIR}/make-audio-ogg-artwork-candidate.mjs"\n' + before;
  assert.equal(base.generated.split(before).length, 2);
  const generated = base.generated.replace(before, after); assert.equal(generated.replace(after, before), base.generated);
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"),
    baseRecipeSha256: base.generatedSha256, codecSettingsChanged: false, memoryLimitsRaised: false, publicAcceptance: false };
}

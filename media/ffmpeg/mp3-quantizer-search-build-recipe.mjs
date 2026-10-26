import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeMp3InputGainBuildRecipe } from "./mp3-input-gain-build-recipe.mjs";
export function makeMp3QuantizerSearchBuildRecipe(source) {
  const base = makeMp3InputGainBuildRecipe(source);
  const before = '  cp -- "${BUILD_ROOT}/within_remux.metadata.c" "${BUILD_ROOT}/within_remux.c"\n';
  const after = '  node "${SCRIPT_DIR}/make-mp3-quantizer-search-candidate.mjs"\n' + before;
  assert.equal(base.generated.split(before).length, 2); const generated = base.generated.replace(before, after);
  assert.equal(generated.replace(after, before), base.generated);
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"),
    baseRecipeSha256: base.generatedSha256, codecSettingsChanged: true, bitRateUnchanged: true,
    mp3CompressionLevel: 2, memoryLimitsRaised: false, publicAcceptance: false };
}

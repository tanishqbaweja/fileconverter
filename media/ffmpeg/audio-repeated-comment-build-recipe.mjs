import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeAudioTextMetadataBuildRecipe } from "./audio-text-metadata-build-recipe.mjs";
// Keep the already-audited three wrapper edits, configure/codec/linker surface,
// source-archive checksums, heap sizes and cleanup. Patch BEFORE library compile.
export function makeAudioRepeatedCommentBuildRecipe(source) {
  const base = makeAudioTextMetadataBuildRecipe(source);
  const before = 'patch --directory="${BUILD_ROOT}/ffmpeg" --strip=1 < amr-bounded-packets.patch\n./build-libraries.sh\n';
  const after = before.replace('./build-libraries.sh\n', 'node "${SCRIPT_DIR}/make-audio-repeated-comment-candidate.mjs"\n./build-libraries.sh\n');
  assert.equal(base.generated.split(before).length, 2);
  const generated = base.generated.replace(before, after); assert.equal(generated.replace(after, before), base.generated);
  assert.ok(generated.indexOf(after) < generated.indexOf('WITHIN_BUILD_CORE_FILTER=within-remux ./build-remux.sh'));
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"), baseRecipeSha256: base.generatedSha256,
    extraEdits: [[before, after]], compiledBeforeLibraryBuild: true, codecSettingsChanged: false, memoryLimitsRaised: false, publicAcceptance: false };
}

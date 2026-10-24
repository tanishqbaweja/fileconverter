import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeAudioTextMetadataBuildRecipe } from "./audio-text-metadata-build-recipe.mjs";
// Keep the already-audited three wrapper edits, configure/codec/linker surface,
// source-archive checksums, heap sizes and cleanup. Patch BEFORE library compile.
export function makeAudioRepeatedCommentBuildRecipe(source, { preserveStreamComments = false, preserveMuxerOrder = false } = {}) {
  if (preserveMuxerOrder) assert.equal(preserveStreamComments, true);
  const base = makeAudioTextMetadataBuildRecipe(source);
  const before = 'patch --directory="${BUILD_ROOT}/ffmpeg" --strip=1 < amr-bounded-packets.patch\n./build-libraries.sh\n';
  const after = before.replace('./build-libraries.sh\n', 'node "${SCRIPT_DIR}/make-audio-repeated-comment-candidate.mjs"\n./build-libraries.sh\n');
  assert.equal(base.generated.split(before).length, 2);
  let generated = base.generated.replace(before, after); const extraEdits = [[before, after]];
  if (preserveStreamComments) {
    const marker = '  cp -- "${BUILD_ROOT}/within_remux.metadata.c" "${BUILD_ROOT}/within_remux.c"\n';
    const patched = '  node "${SCRIPT_DIR}/make-audio-comment-wrapper-candidate.mjs"\n' +
      (preserveMuxerOrder ? '  node "${SCRIPT_DIR}/make-audio-muxer-order-candidate.mjs"\n' : "") + marker;
    assert.equal(generated.split(marker).length, 2); generated = generated.replace(marker, patched); extraEdits.push([marker, patched]);
  }
  let reversed = generated; for (const [old, replacement] of extraEdits.toReversed()) reversed = reversed.replace(replacement, old);
  assert.equal(reversed, base.generated);
  assert.ok(generated.indexOf(after) < generated.indexOf('WITHIN_BUILD_CORE_FILTER=within-remux ./build-remux.sh'));
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"), baseRecipeSha256: base.generatedSha256,
    extraEdits, preserveStreamComments, preserveMuxerOrder, compiledBeforeLibraryBuild: true, codecSettingsChanged: false, memoryLimitsRaised: false, publicAcceptance: false };
}

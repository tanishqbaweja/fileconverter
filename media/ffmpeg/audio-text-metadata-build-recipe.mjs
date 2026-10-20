import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = text => createHash("sha256").update(text).digest("hex");
export function makeAudioTextMetadataBuildRecipe(source) {
  assert.equal(sha(source), "6323620da9f7046d440aac362cd3211f21e4e19a679cd3c4b2f09182cb457f5e");
  const start = source.indexOf("comparison_files=()\n"); assert.ok(start > 0);
  const originalEnd = source.slice(start);
  assert.ok(originalEnd.endsWith("printf 'Exact non-Docker FFmpeg artifact comparison passed.\\n'\n"));
  const link = "  WITHIN_BUILD_CORE_FILTER=within-remux ./build-remux.sh\n";
  const replacement = '  cp -- "${BUILD_ROOT}/within_remux.c" "${BUILD_ROOT}/within_remux.parent.c"\n' +
    '  node "${SCRIPT_DIR}/make-audio-text-metadata-candidate.mjs" "${BUILD_ROOT}/within_remux.c" "${BUILD_ROOT}/within_remux.metadata.c"\n' +
    '  cp -- "${BUILD_ROOT}/within_remux.metadata.c" "${BUILD_ROOT}/within_remux.c"\n' + link +
    '  cp -- "${BUILD_ROOT}/within_remux.parent.c" "${OUTPUT_ROOT}/within_remux.parent.c"\n' +
    '  cp -- "${BUILD_ROOT}/within_remux.metadata.c" "${OUTPUT_ROOT}/within_remux.metadata.c"\n' +
    '  cp -- "${BUILD_ROOT}/ffmpeg/config_components.h" "${OUTPUT_ROOT}/config_components.h"\n';
  const edits = [
    ['SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"', 'SCRIPT_DIR="${WITHIN_AUDIO_METADATA_SCRIPT_DIR:?Explicit repository source directory required}"'],
    ['KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"', 'KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"\n[[ "${WITHIN_BUILD_CORE_FILTER:-}" == "within-remux" && "${KEEP_OUTPUT}" == "1" ]] || exit 2'],
    [link, replacement],
    [originalEnd, "# Private changed-source build, never comparison to or replacement of public assets.\nprintf 'Private bounded audio metadata candidate compiled; browser and promotion gates remain pending.\\n'\n"],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source);
  return { generated, generatedSha256: sha(generated), edits, publicAcceptance: false, publicArtifactsChanged: false,
    originalDependencyConfigureAndLinkerFlagsRetained: true };
}

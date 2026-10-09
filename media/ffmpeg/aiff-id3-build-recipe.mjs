// Private changed-source compilation, NOT reproduction of the unchanged public binary.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const AIFF_BASE_REPRO_SHA = "6323620da9f7046d440aac362cd3211f21e4e19a679cd3c4b2f09182cb457f5e";
export const AIFF_BASE_LINK_SHA = "904f06e36b2a3ee4509a7cb8faeda3a375314ffd5d1fd119017eb90ad0bb3a9e";
const sha = value => createHash("sha256").update(value).digest("hex");
export function makeAiffId3BuildRecipe(source) {
  assert.equal(sha(source), AIFF_BASE_REPRO_SHA);
  const comparisonOffset = source.indexOf("comparison_files=()\n"); assert.ok(comparisonOffset > 0);
  const comparison = source.slice(comparisonOffset);
  assert.ok(comparison.endsWith("printf 'Exact non-Docker FFmpeg artifact comparison passed.\\n'\n"));
  const end = "# Changed private candidate: no comparison to, or modification of, published binaries.\n" +
    "printf 'Private AIFF ID3 specialist compiled; browser fidelity/memory/reproducibility acceptance still required.\\n'\n";
  const linker = "  WITHIN_BUILD_CORE_FILTER=within-aiff ./build-remux.sh\n";
  const edits = [
    ['SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"', 'SCRIPT_DIR="${WITHIN_AIFF_ID3_SCRIPT_DIR:?Explicit repository source directory required}"'],
    ['KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"', 'KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"\n[[ "${WITHIN_BUILD_CORE_FILTER:-}" == "within-aiff" && "${KEEP_OUTPUT}" == "1" ]] || exit 2'],
    ['node "${SCRIPT_DIR}/make-aiff-specialist.mjs" \\', 'node "${SCRIPT_DIR}/make-aiff-id3-specialist.mjs" \\'],
    [linker, linker + '  cp -- "${BUILD_ROOT}/within_aiff.c" "${OUTPUT_ROOT}/within_aiff.c"\n' +
      '  cp -- "${BUILD_ROOT}/ffmpeg/config_components.h" "${OUTPUT_ROOT}/config_components.h"\n'],
    [comparison, end],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "Existing dependencies, configure, linker, public source, disk checks and cleanup remain exact");
  return { generated, generatedSha256: sha(generated), edits,
    scope: "private-metadata-only-specialist-compilation-not-published-reproduction", publicAcceptance: false };
}

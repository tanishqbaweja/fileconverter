import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const baseRecipeSha256 = "6323620da9f7046d440aac362cd3211f21e4e19a679cd3c4b2f09182cb457f5e";
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function deriveMkvEditListBuildRecipe(bytes) {
  assert.equal(sha256(bytes), baseRecipeSha256, "Exact released reproduction recipe required");
  const source = bytes.toString("utf8");
  const directLink = `  WITHIN_BUILD_CORE_FILTER=within-direct ./build-remux.sh\n`;
  const nextCore = `elif [[ "\${requested_core}" != "within-remux"`;
  const comparison = source.indexOf("\ncomparison_files=()\n");
  assert.ok(comparison > 0);
  const edits = [
    ['SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
      'SCRIPT_DIR="${WITHIN_MKV_TIMELINE_SCRIPT_DIR:?}"'],
    ['WORK_ROOT="${PROJECT_ROOT}/work"', 'WORK_ROOT="${WITHIN_MKV_TIMELINE_BUILD_ROOT:?}"'],
    ['BUILD_ROOT="${WORK_ROOT}/ffmpeg-nondocker-build"', 'BUILD_ROOT="${WORK_ROOT}/build"'],
    ['OUTPUT_ROOT="${WORK_ROOT}/ffmpeg-nondocker-output"', 'OUTPUT_ROOT="${WORK_ROOT}/compiled"'],
    ['requested_core="${WITHIN_BUILD_CORE_FILTER:-all}"', 'requested_core=within-direct'],
    [directLink + nextCore,
      '  node "${SCRIPT_DIR}/build-mkv-edit-list-candidate.mjs" --prepare "${BUILD_ROOT}" "${OUTPUT_ROOT}"\n' +
      directLink + '  cp -- "${BUILD_ROOT}/ffmpeg/COPYING.LGPLv3" "${OUTPUT_ROOT}/LICENSE.ffmpeg-lgpl3"\n' + nextCore],
    [source.slice(comparison), "\nprintf 'Unpublished MKV timeline tool compiled; no public reproduction or browser acceptance claim.\\n'\n"],
  ];
  const replace = (text, [from, to]) => {
    assert.equal(text.split(from).length, 2, "Expected exactly one reviewed build-recipe anchor");
    return text.replace(from, () => to);
  };
  const generated = edits.reduce(replace, source);
  assert.equal(edits.toReversed().reduce((text, [from, to]) => replace(text, [to, from]), generated), source);
  return { generated, generatedSha256: sha256(generated), baseRecipeSha256, exactReversal: true };
}

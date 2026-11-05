// Isolated private build. Published reproduction scripts and source stay exact.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = value => createHash("sha256").update(value).digest("hex");
export function makeVp9DurationBuildRecipe(source) {
  assert.equal(sha(source), "6323620da9f7046d440aac362cd3211f21e4e19a679cd3c4b2f09182cb457f5e");
  const tail = source.slice(source.indexOf("comparison_files=()\n"));
  assert.ok(tail.startsWith("comparison_files=()\n") && tail.endsWith("printf 'Exact non-Docker FFmpeg artifact comparison passed.\\n'\n"));
  const link = "  WITHIN_BUILD_CORE_FILTER=within-remux ./build-remux.sh\n";
  const edits = [
    ['SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"', 'SCRIPT_DIR="${WITHIN_VP9_DURATION_SCRIPT_DIR:?Explicit repository source directory required}"'],
    ['${WORK_ROOT}/ffmpeg-nondocker-build', '${WORK_ROOT}/vp9-duration-build'],
    ['${WORK_ROOT}/ffmpeg-nondocker-output', '${WORK_ROOT}/vp9-duration-output'],
    ['KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"', 'KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"\n[[ "${WITHIN_BUILD_CORE_FILTER:-}" == "within-remux" && "${KEEP_OUTPUT}" == "1" ]] || exit 2'],
    [link, '  cp -- "${BUILD_ROOT}/within_remux.c" "${BUILD_ROOT}/within_remux.base.c"\n' +
      '  node "${SCRIPT_DIR}/make-vp9-duration-source.mjs"\n' +
      '  cp -- "${BUILD_ROOT}/within_remux.duration.c" "${BUILD_ROOT}/within_remux.c"\n' + link +
      '  cp -- "${BUILD_ROOT}/within_remux.base.c" "${OUTPUT_ROOT}/within_remux.base.c"\n' +
      '  cp -- "${BUILD_ROOT}/within_remux.duration.c" "${OUTPUT_ROOT}/within_remux.duration.c"\n' +
      '  cp -- "${BUILD_ROOT}/vp9-duration-source-proof.json" "${OUTPUT_ROOT}/vp9-duration-source-proof.json"\n' +
      '  cp -- "${BUILD_ROOT}/ffmpeg/config_components.h" "${OUTPUT_ROOT}/config_components.h"\n' +
      '  cp -- "${BUILD_ROOT}/ffmpeg/COPYING.LGPLv3" "${OUTPUT_ROOT}/LICENSE.ffmpeg-lgpl3"\n' +
      '  cp -- "${BUILD_ROOT}/libvpx/LICENSE" "${OUTPUT_ROOT}/LICENSE.libvpx"\n'],
    [tail, "# Private changed native source: NOT a public artifact reproduction claim.\nprintf 'Private VP9 duration candidate compiled; browser gates remain pending.\\n'\n"],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reverse = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
  assert.equal(reverse, source);
  return { generated, generatedSha256: sha(generated), parentSha256: sha(source), edits,
    dependencyRecipesChanged: false, compilerSettingsChanged: false, memoryLimitsRaised: false,
    allCoreBuildSelected: false, publicAcceptance: false };
}

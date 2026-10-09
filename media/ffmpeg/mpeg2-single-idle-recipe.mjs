import assert from "node:assert/strict";
import { makeLateRefstructRecipe } from "./mpeg2-late-refstruct-recipe.mjs";
export function makeSingleIdleRecipe(source) {
  const prior = makeLateRefstructRecipe(source);
  const smoke = `emcc "\${SCRIPT_DIR}/mpeg2-single-idle-smoke.c" "\${SCRIPT_DIR}/mpeg2-late-refstruct-slot.c" "\${SCRIPT_DIR}/mpeg2-aligned-reuse.c" -I"\${PREFIX}/include" -I"\${SCRIPT_DIR}" \\
  "\${PREFIX}/lib/libavutil.a" -O2 -UNDEBUG -pthread -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc \\
  -sENVIRONMENT=node -sFILESYSTEM=0 -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sMODULARIZE=0 -sEXPORT_ES6=0 \\
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 -Wl,--wrap=posix_memalign \\
  -o "\${BUILD_ROOT}/single-idle-smoke.js"
node "\${BUILD_ROOT}/single-idle-smoke.js" > "\${OUTPUT_ROOT}/single-idle-smoke.json"
test -s "\${OUTPUT_ROOT}/single-idle-smoke.json"
`;
  const edits = [
    ['sha256sum ffmpeg/libavutil/refstruct.c > "${OUTPUT_ROOT}/late-refstruct-source.sha256"',
      'node "${SCRIPT_DIR}/patch-mpeg2-single-idle.mjs" "${BUILD_ROOT}/ffmpeg/libavutil/refstruct.c"\n' +
      'sha256sum ffmpeg/libavutil/refstruct.c > "${OUTPUT_ROOT}/late-refstruct-source.sha256"'],
    ['cp "${SCRIPT_DIR}/mpeg2-hevc-auxiliary-policy.h"', 'cp "${SCRIPT_DIR}/mpeg2-hevc-single-idle-policy.h"'],
    ['# Compile the preserved production AVIO/kernel with the separate codec hooks.', smoke + '# Compile the preserved production AVIO/kernel with the separate codec hooks.'],
    ['cp ffmpeg/COPYING.LGPLv2.1',
      'cp ffmpeg/libavutil/refstruct.c "${OUTPUT_ROOT}/single-idle-refstruct.c"\n' +
      'cp ffmpeg/libavcodec/hevc/mpeg2-hevc-auxiliary-policy.h "${OUTPUT_ROOT}/single-idle-hevc-policy.h"\n' +
      'cp ffmpeg/COPYING.LGPLv2.1'],
  ];
  let generated = prior;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior, "Same frozen FFmpeg/dependencies/codec/live frames/fixed heaps/encoder/IO; only idle admission changes");
  return generated;
}

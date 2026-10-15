import assert from "node:assert/strict";
import { makeMvfArenaRecipe } from "./mpeg2-mvf-arena-recipe.mjs";
export function makePacketInterleaveRecipe(source) {
  const parent = makeMvfArenaRecipe(source).generated;
  const marker = "# Compile the preserved production AVIO/kernel with the separate codec hooks.";
  const smoke = `# Actual pinned libavformat queue/refcount experiment, NOT a media conversion.
emcc "\${SCRIPT_DIR}/mpeg2-packet-interleave-smoke.c" \\
  "\${SCRIPT_DIR}/mpeg2-aligned-reuse.c" "\${SCRIPT_DIR}/mpeg2-late-refstruct-slot.c" \\
  -I"\${BUILD_ROOT}/ffmpeg" -I"\${PREFIX}/include" -I"\${SCRIPT_DIR}" \\
  "\${PREFIX}/lib/libavformat.a" "\${PREFIX}/lib/libavcodec.a" \\
  "\${PREFIX}/lib/libswscale.a" "\${PREFIX}/lib/libavutil.a" \\
  -O2 -msimd128 -Wall -Wextra -Werror -Wno-error=unused-command-line-argument -UNDEBUG -pthread \\
  -Wl,--wrap=posix_memalign -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc -sENVIRONMENT=node \\
  -sFILESYSTEM=0 -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sMODULARIZE=0 -sEXPORT_ES6=0 \\
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 \\
  -o "\${BUILD_ROOT}/packet-interleave-smoke.js"
node "\${BUILD_ROOT}/packet-interleave-smoke.js" > "\${OUTPUT_ROOT}/packet-interleave-smoke.json"
test -s "\${OUTPUT_ROOT}/packet-interleave-smoke.json"
`;
  assert.equal(parent.split(marker).length, 2);
  const generated = parent.replace(marker, smoke + marker);
  assert.equal(generated.replace(smoke + marker, marker), parent);
  return { generated, parent, productionKernelChanged: false, codecSettingsChanged: false,
    heapLimitsChanged: false, publicAcceptance: false };
}
export const makePacketInterleaveShellRecipe = source => makePacketInterleaveRecipe(source).generated;

import assert from "node:assert/strict";
import { makeHevcPlaneRecipe } from "./mpeg2-hevc-plane-recipe.mjs";
export function makePacketCacheRecipe(source) {
  const prior = makeHevcPlaneRecipe(source);
  const marker = "# Compile the preserved production AVIO/kernel with the separate codec hooks.";
  const smoke = `# Real pinned libavutil packet lifetime/failure test; no media conversion.
emcc "\${SCRIPT_DIR}/mpeg2-packet-cache-smoke.c" "\${SCRIPT_DIR}/mpeg2-allocation-attempt.c" \\
  -I"\${PREFIX}/include" -I"\${SCRIPT_DIR}" "\${PREFIX}/lib/libavutil.a" \\
  -O2 -Wall -Wextra -Werror -UNDEBUG -pthread -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc \\
  -sENVIRONMENT=node -sFILESYSTEM=0 -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sMODULARIZE=0 -sEXPORT_ES6=0 \\
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 \\
  -Wl,--wrap=posix_memalign -o "\${BUILD_ROOT}/packet-cache-smoke.js"
node "\${BUILD_ROOT}/packet-cache-smoke.js" > "\${OUTPUT_ROOT}/packet-cache-smoke.json"
test -s "\${OUTPUT_ROOT}/packet-cache-smoke.json"
`;
  const edits = [[marker, smoke + marker], ["make-mpeg2-split-pipeline.mjs", "make-mpeg2-packet-cache-pipeline.mjs"]];
  let generated = prior; for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior, "All actual HEVC planes, SDK restoration, encoder, heap, codec and I/O gates preserved");
  return generated;
}

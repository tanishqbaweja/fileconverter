import assert from "node:assert/strict";
import { makeReallocAttemptRecipe } from "./mpeg2-realloc-attempt-recipe.mjs";
export function makeEbmlReuseRecipe(source) {
  const parent = makeReallocAttemptRecipe(source).generated;
  const configure = "(\n  cd ffmpeg\n";
  const patch = `# Pinned Matroska block-only final-unref reuse; fixed heaps and codecs unchanged.
node "\${SCRIPT_DIR}/mpeg2-ebml-reuse-source.mjs" ffmpeg/libavformat/matroskadec.c
cp "\${SCRIPT_DIR}/mpeg2-ebml-reuse.h" ffmpeg/libavformat/mpeg2-ebml-reuse.h
`;
  const marker = "# Compile the preserved production AVIO/kernel with the separate codec hooks.";
  const smoke = `# Real pinned libavutil lifecycle/content/failure controls; no browser acceptance.
emcc "\${SCRIPT_DIR}/mpeg2-ebml-reuse-smoke.c" -I"\${PREFIX}/include" -I"\${SCRIPT_DIR}" \\
  "\${PREFIX}/lib/libavutil.a" "\${SCRIPT_DIR}/mpeg2-allocation-attempt.c" \\
  -O2 -Wall -Wextra -Werror -Wno-error=unused-command-line-argument -UNDEBUG -pthread \\
  -Wl,--wrap=posix_memalign -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc -sENVIRONMENT=node \\
  -sFILESYSTEM=0 -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sMODULARIZE=0 -sEXPORT_ES6=0 \\
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 \\
  -o "\${BUILD_ROOT}/ebml-reuse-smoke.js"
node "\${BUILD_ROOT}/ebml-reuse-smoke.js" > "\${OUTPUT_ROOT}/ebml-reuse-smoke.json"
test -s "\${OUTPUT_ROOT}/ebml-reuse-smoke.json"
`;
  const edits = [[configure, patch + configure], [marker, smoke + marker]];
  let generated = parent;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, parent);
  return { generated, parent, edits, codecSettingsChanged: false, heapLimitsChanged: false, publicAcceptance: false };
}
export const makeEbmlReuseShellRecipe = source => makeEbmlReuseRecipe(source).generated;

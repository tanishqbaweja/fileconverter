import assert from "node:assert/strict";
import { makeEbmlReuseRecipe } from "./mpeg2-ebml-reuse-recipe.mjs";
export function makeMvfArenaRecipe(source) {
  const parent = makeEbmlReuseRecipe(source).generated;
  const configure = "(\n  cd ffmpeg\n";
  const patch = `# Private bounded HEVC MVF placement; same sizes/references/fixed heaps.
node "\${SCRIPT_DIR}/mpeg2-mvf-arena-source.mjs" --refstruct "\${BUILD_ROOT}/ffmpeg/libavutil/refstruct.c"
node "\${SCRIPT_DIR}/mpeg2-mvf-arena-source.mjs" --hevc "\${BUILD_ROOT}/ffmpeg/libavcodec/hevc/hevcdec.c"
sha256sum ffmpeg/libavutil/refstruct.c > "\${OUTPUT_ROOT}/late-refstruct-source.sha256"
sha256sum ffmpeg/libavutil/refstruct.c ffmpeg/libavcodec/hevc/hevcdec.c > "\${OUTPUT_ROOT}/mvf-source.sha256"
`;
  const marker = "# Compile the preserved production AVIO/kernel with the separate codec hooks.";
  const smoke = `# Include actual patched pool source; link real pinned libavutil memory/thread API.
emcc "\${SCRIPT_DIR}/mpeg2-mvf-arena-smoke.c" "\${SCRIPT_DIR}/mpeg2-late-refstruct-slot.c" \\
  "\${SCRIPT_DIR}/mpeg2-aligned-reuse.c" -I"\${PREFIX}/include" -I"\${SCRIPT_DIR}" -I"\${BUILD_ROOT}/ffmpeg" \\
  "\${PREFIX}/lib/libavutil.a" -O2 -Wall -Wextra -Werror -Wno-error=unused-command-line-argument -UNDEBUG -pthread \\
  -Wl,--wrap=posix_memalign -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc -sENVIRONMENT=node \\
  -sFILESYSTEM=0 -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sMODULARIZE=0 -sEXPORT_ES6=0 \\
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 \\
  -o "\${BUILD_ROOT}/mvf-arena-smoke.js"
node "\${BUILD_ROOT}/mvf-arena-smoke.js" > "\${OUTPUT_ROOT}/mvf-arena-smoke.json"
test -s "\${OUTPUT_ROOT}/mvf-arena-smoke.json"
`;
  const edits = [[configure, patch + configure], [marker, smoke + marker]];
  let generated = parent;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let restored = generated;
  for (const [before, after] of edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, parent);
  return { generated, parent, edits, codecSettingsChanged: false, heapLimitsChanged: false, publicAcceptance: false };
}
export const makeMvfArenaShellRecipe = source => makeMvfArenaRecipe(source).generated;

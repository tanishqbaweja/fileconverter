// Exact additive diagnostic derivative. Never changes the historical recipe.
import assert from "node:assert/strict";
import { makeAlignedReuseRecipe } from "./mpeg2-aligned-reuse-recipe.mjs";
export function makeLateRefstructRecipe(source) {
  const aligned = makeAlignedReuseRecipe(source);
  const patchBoundary = 'if [[ "${ALLOCATOR_DIAGNOSTIC}" == 1 || "${FRAME_ALLOCATION_DIAGNOSTIC}" == 1 ]]; then\n  # Read-only private pool telemetry';
  const unit = `# Synthetic actual-libavutil slot lifecycle; no media and no browser acceptance.
emcc "\${SCRIPT_DIR}/mpeg2-late-refstruct-smoke.c" "\${SCRIPT_DIR}/mpeg2-late-refstruct-slot.c" -I"\${PREFIX}/include" \\
  "\${PREFIX}/lib/libavutil.a" -O2 -UNDEBUG -pthread -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc \\
  -sENVIRONMENT=node -sFILESYSTEM=0 -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sMODULARIZE=0 -sEXPORT_ES6=0 \\
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 \\
  -o "\${BUILD_ROOT}/late-refstruct-smoke.js"
node "\${BUILD_ROOT}/late-refstruct-smoke.js" > "\${OUTPUT_ROOT}/late-refstruct-smoke.json"
test -s "\${OUTPUT_ROOT}/late-refstruct-smoke.json"
`;
  const edits = [
    [patchBoundary, 'node "${SCRIPT_DIR}/patch-late-refstruct.mjs" "${BUILD_ROOT}/ffmpeg/libavutil/refstruct.c"\n' +
      'sha256sum ffmpeg/libavutil/refstruct.c > "${OUTPUT_ROOT}/late-refstruct-source.sha256"\n' + patchBoundary],
    ["# Compile the preserved production AVIO/kernel with the separate codec hooks.",
      unit + "# Compile the preserved production AVIO/kernel with the separate codec hooks."],
    ['"${SCRIPT_DIR}/mpeg2-aligned-reuse.c" -I"${PREFIX}/include"',
      '"${SCRIPT_DIR}/mpeg2-aligned-reuse.c" "${SCRIPT_DIR}/mpeg2-late-refstruct-slot.c" -I"${PREFIX}/include"'],
    ['-Wl,--wrap=posix_memalign -Wl,--no-entry',
      '-Wl,-Map,${OUTPUT_ROOT}/decoder-link.map -Wl,--wrap=posix_memalign -Wl,--no-entry'],
  ];
  let generated = aligned;
  for (const [before, after] of edits) {
    assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after);
  }
  let restored = generated;
  for (const [before, after] of edits.toReversed()) {
    assert.equal(restored.split(after).length, 2); restored = restored.replace(after, before);
  }
  assert.equal(restored, aligned, "Every old build/dependency/codec/heap/stack/thread/AVIO gate must reverse exactly");
  return generated;
}

// Failure-only private instrumentation. No allocator, codec or memory-policy change.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = value => createHash("sha256").update(value).digest("hex");
export const VP9_ALLOCATION_DIAGNOSTIC_PINS = Object.freeze({
  encoder: "9c831c453796fcd08598da8b8e27a494fde8d681e87349facd590c48949e9693",
  frameAllocator: "4b248ec01e4ec24194247379a3a9891b4f6d3ea024bb1c209ade86c514a92148",
  heapHeader: "c7ae99c29f94b6a2ea803c7e7e790e87e7078460980e2a68db98a8be7ee8fbde",
  allocatorHeader: "018d3fb45e17f3d0a9f2edcdab7f5b3be2479e193f38e076d72bf970418ee427",
});
function derive(source, expected, edits) {
  assert.equal(sha(source), expected, "Exact diagnostic parent source required");
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before.slice(0, 128)); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source);
  return { generated, parentSha256: sha(source), generatedSha256: sha(generated), edits, failureOnly: true,
    allocatorAlgorithmChanged: false, codecSettingsChanged: false, memoryLimitsRaised: false,
    speedGainProven: false, browserValidated: false, publicAcceptance: false };
}
export function makeVp9EncoderAllocationDiagnostic(source) {
  assert.equal(sha(source), VP9_ALLOCATION_DIAGNOSTIC_PINS.encoder);
  const needle = '"Failed to allocate frame buffer"', matches = [...source.matchAll(/"Failed to allocate frame buffer"/g)];
  assert.equal(matches.length, 3);
  // Include the preceding exact allocator/error block so each edit is unique.
  const sites = ["scale-hi", "scale-lo", "new-frame"], edits = matches.map((match, i) => {
    const from = source.lastIndexOf("          if (vpx_realloc_frame_buffer", match.index);
    const start = i === 2 ? source.lastIndexOf("  if (vpx_realloc_frame_buffer(get_frame_new_buffer", match.index) : from;
    assert.ok(start > 0 && match.index - start < 1000);
    const before = source.slice(start, match.index + needle.length),
      after = before.replace(needle, '"FB allocation failed site=' + sites[i] + ' w=%d h=%d b=%d a=%d",\n' +
        '                       cm->width, cm->height, VP9_ENC_BORDER_IN_PIXELS, cm->byte_alignment');
    return [before, after];
  });
  return { ...derive(source, VP9_ALLOCATION_DIAGNOSTIC_PINS.encoder, edits), sites };
}
export function makeVp9FrameAllocationDiagnostic(source) {
  const before = '      ybf->buffer_alloc = (uint8_t *)vpx_memalign(32, (size_t)frame_size);\n      if (!ybf->buffer_alloc) return -1;';
  const after = String.raw`      ybf->buffer_alloc = (uint8_t *)vpx_memalign(32, (size_t)frame_size);
      if (!ybf->buffer_alloc) {
        /* Sample only AFTER the failed allocation, before stderr formatting. */
        const size_t within_heap = emscripten_get_heap_size();
        const size_t within_max = emscripten_get_heap_max();
        const size_t within_managed = emmalloc_dynamic_heap_size();
        const size_t within_free = emmalloc_free_dynamic_memory();
        const size_t within_unclaimed = emmalloc_unclaimed_heap_memory();
        fprintf(stderr, "[within-vp9-alloc] w=%d h=%d b=%d a=%d frame=%llu heap=%zu max=%zu managed=%zu free=%zu unclaimed=%zu\n",
                width, height, border, byte_alignment,
                (unsigned long long)frame_size, within_heap, within_max,
                within_managed, within_free, within_unclaimed);
        return -1;
      }`;
  return derive(source, VP9_ALLOCATION_DIAGNOSTIC_PINS.frameAllocator, [
    ["#include <assert.h>", "#include <assert.h>\n#include <stdio.h>\n#include <emscripten/heap.h>\n#include <emscripten/emmalloc.h>"],
    [before, after],
  ]);
}
export function makeVp9AllocationConfigureProbe(source) {
  return { ...derive(source, "6414ea37233cf82ebb4cbac2352061ed830befbdf7eb395988b7c1e2d187f6cf", [
    ['--extra-ldflags="-O3 -pthread -L${PREFIX}/lib"', '--extra-ldflags="-O3 -pthread -sMALLOC=emmalloc -L${PREFIX}/lib"'],
    ['emmake make -j"$(nproc)"', 'if ! grep -qx \'#define CONFIG_LIBVPX_VP9_ENCODER 1\' config_components.h; then\n' +
      '  tail -n 160 ffbuild/config.log >&2\n  exit 1\nfi\nemmake make -j"$(nproc)"'],
  ]), failureOnly: false, scope: "Configure-link probes select the SAME allocator already required by the unchanged production final link",
  configureProbeAllocatorAlignedToFinal: true, productionFinalLinkFlagsChanged: false };
}

// Export-only synthetic control of the SAME compiled av_buffer_allocz. Never stage for media.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { DIRECT_BUFFER_DECODER_SHA256 } from "./direct-buffer-allocator-abort-capture.mjs";
export function makeDirectBufferExportControlRecipe(source) {
  assert.equal(sha(source), "c36cb9709449b54ec27917fbd0c1c38ac1f016f026617a83c62cda193daf8ddf");
  const edits = [
    ['export function createRefstructExportOnlyControl(bytes) {', 'export function createDirectBufferExportOnlyControl(bytes) {'],
    ['assert.equal(sha(bytes), LATE_COMPILED_CORE_SHA256, "Exact compiled private diagnostic only");',
      `assert.equal(sha(bytes), ${JSON.stringify(DIRECT_BUFFER_DECODER_SHA256)}, "Exact current decoder direct-buffer control only");`],
    ['new Set(["av_refstruct_pool_alloc", "av_refstruct_pool_get", "av_refstruct_unref", "av_malloc"])',
      'new Set(["av_buffer_allocz", "av_malloc", "emscripten_builtin_malloc", "avcodec_default_get_buffer2", "alloc_frame", "hevc_receive_frame"])'],
    [`    { originalName: "av_refstruct_pool_alloc", exportName: "control_pool_alloc", params: ["i32", "i32"] },
    { originalName: "av_refstruct_pool_get", exportName: "control_pool_get", params: ["i32"] },
    { originalName: "av_refstruct_unref", exportName: "control_unref", params: ["i32"] },`,
      '    { originalName: "av_buffer_allocz", exportName: "control_buffer_allocz", params: ["i32"] },'],
    ['assert.deepEqual(actual.results, row.originalName === "av_refstruct_unref" ? [] : ["i32"]);',
      'assert.deepEqual(actual.results, ["i32"]);'],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length - 1, 1, before); generated = generated.replace(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replace(after, before);
  assert.equal(reverse, source, "All original export-only/code/data/import/memory/type equality guards preserved");
  return { generated, edits, publicAcceptance: false };
}
// Keep the measured original export implementation immutable. Reuse its exact
// reversible recipe through an explicit factory supplied by the owned caller.
export function inspectDirectBufferExportControl(control) {
  assert.equal(control.originalSha256, DIRECT_BUFFER_DECODER_SHA256);
  assert.equal(control.onlyExportSectionChanged, true); assert.equal(control.allCodeDataTypesImportsTablesMemoryExact, true);
  assert.equal(control.originalCompiledCoreChanged, false); assert.equal(control.usableForMediaOrAcceptance, false);
  assert.equal(control.additions.length, 1); assert.equal(control.additions[0].exportName, "control_buffer_allocz");
  const expected = { av_buffer_allocz: 4187, av_malloc: 4311, emscripten_builtin_malloc: 4435,
    avcodec_default_get_buffer2: 708, alloc_frame: 2060, hevc_receive_frame: 1980 };
  for (const [name, index] of Object.entries(expected)) assert.equal(control.selected.find(row => row.name === name)?.functionIndex, index, name);
  return { qualifiedDirectBufferIndices: expected, allocatorRoot: 1786520, dynamicAllocationSizeKnown: false,
    historicalFullFailureResolved: false, publicAcceptance: false };
}

// Export-only actual compiled functions, NEVER a media candidate or published core.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { REALLOC_DECODER_SHA256 } from "./realloc-attempt-abort-capture.mjs";
export function makeReallocExportFactory(source) {
  assert.equal(sha(source), "c36cb9709449b54ec27917fbd0c1c38ac1f016f026617a83c62cda193daf8ddf");
  const edits = [
    ["export function createRefstructExportOnlyControl(bytes) {", "export function createReallocExportOnlyControl(bytes) {"],
    ['assert.equal(sha(bytes), LATE_COMPILED_CORE_SHA256, "Exact compiled private diagnostic only");', `assert.equal(sha(bytes), ${JSON.stringify(REALLOC_DECODER_SHA256)}, "Exact qualified realloc decoder only");`],
    ['new Set(["av_refstruct_pool_alloc", "av_refstruct_pool_get", "av_refstruct_unref", "av_malloc"])', 'new Set(["__wrap_av_buffer_realloc", "emscripten_builtin_malloc"])'],
    [`    { originalName: "av_refstruct_pool_alloc", exportName: "control_pool_alloc", params: ["i32", "i32"] },
    { originalName: "av_refstruct_pool_get", exportName: "control_pool_get", params: ["i32"] },
    { originalName: "av_refstruct_unref", exportName: "control_unref", params: ["i32"] },`,
      `    { originalName: "__wrap_av_buffer_realloc", exportName: "control_buffer_realloc", params: ["i32", "i32"] },
    { originalName: "emscripten_builtin_malloc", exportName: "control_malloc", params: ["i32"] },`],
    ['assert.deepEqual(actual.results, row.originalName === "av_refstruct_unref" ? [] : ["i32"]);', 'assert.deepEqual(actual.results, ["i32"]);'],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replace(after, before); assert.equal(reverse, source);
  return { generated, edits, generatedSha256: sha(generated), publicAcceptance: false };
}

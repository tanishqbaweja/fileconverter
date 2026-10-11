// Fresh07ff observer/control only. Preserve old proofs and all runtime gates.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16ExportRecipe, makeAlignment16ControlBrowserFactory, makeAlignment16ControlCaller } from "./alignment16-control-recipe.mjs";
export const HEVC_PLANE_DECODER_SHA256 = "07ff8c19e9f58205f21a9cd10f6d7f0e0fb8f1e7086b810818724846117d51e4";
const oldSha = "417182a9ed0f5e19e77c5248545c80265b87abd477984872d9ccf4094d8b1014";
const addedFiles = ["scripts/lib/hevc-plane-control-recipe.mjs", "scripts/check-hevc-plane-abort-control.mjs",
  "scripts/lib/hevc-plane-attempt-abort-capture.mjs", "scripts/lib/hevc-plane-composite-abort-capture.mjs", "tests/hevc-plane-control.test.mjs",
  "evidence/mpeg2-hevc-plane-build-38183370743.json", "evidence/mpeg2-hevc-plane-build-branch-2026-10-12-include-fix.json"];
function exact(source, edits) {
  let generated = source;
  for (const [before, after, count = 1] of edits) { assert.equal(generated.split(before).length - 1, count, before.slice(0, 160)); generated = generated.replaceAll(before, after); }
  let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replaceAll(after, before);
  assert.equal(reversed, source, "Only enumerated native-identity/source/observer edits; all ownership/cleanup/privacy/limits retained");
  return { generated, generatedSha256: sha(generated), edits, publicAcceptance: false };
}
export function makeHevcPlaneExportRecipe(source) {
  return exact(makeAlignment16ExportRecipe(source).generated, [[JSON.stringify(oldSha), JSON.stringify(HEVC_PLANE_DECODER_SHA256)]]);
}
export function makeHevcPlaneControlBrowserFactory(source) {
  const prior = makeAlignment16ControlBrowserFactory(source).generated;
  const served = '"alignment16-attempt-abort-capture.mjs","alignment16-composite-abort-capture.mjs"';
  return exact(prior, [
    ['from "./alignment16-attempt-abort-capture.mjs";', 'from "./hevc-plane-attempt-abort-capture.mjs";'],
    ['from "/alignment16-composite-abort-capture.mjs";', 'from "/hevc-plane-composite-abort-capture.mjs";'],
    [served, served + ',"hevc-plane-attempt-abort-capture.mjs","hevc-plane-composite-abort-capture.mjs"'],
    ["work/mpeg2-alignment16-38161556498", "work/mpeg2-hevc-planes-38183370743"],
    ["alignment16-abort-control", "hevc-plane-abort-control", 5],
    ["export const allocationAttemptControlFiles = [", "export const allocationAttemptControlFiles = [" + addedFiles.map(file => JSON.stringify(file) + ",").join("")],
  ]);
}
export function makeHevcPlaneControlCaller(source, root) {
  const prior = makeAlignment16ControlCaller(source, root).generated;
  const oldIndices = "av_malloc: 4312, emscripten_builtin_malloc: 4436, __wrap_posix_memalign: 4471,";
  const edits = [
    ["evidence/mpeg2-alignment16-build-38161556498.json", "evidence/mpeg2-hevc-plane-build-38183370743.json"],
    ["evidence/mpeg2-alignment16-build-branch-2026-10-11-origin-fix.json", "evidence/mpeg2-hevc-plane-build-branch-2026-10-12-include-fix.json"],
    ["actual-alignment16-build-unit-verified-not-browser-acceptance", "actual-hevc-plane-build-unit-verified-not-browser-acceptance"],
    ["work/mpeg2-alignment16-38161556498", "work/mpeg2-hevc-planes-38183370743"],
    [oldIndices, "av_malloc: 4313, emscripten_builtin_malloc: 4437, __wrap_posix_memalign: 4472,"],
    ["sbrk: 4441, av_refstruct_pool_get: 4380", "sbrk: 4442, av_refstruct_pool_get: 4381"],
    ['"alignment16-control-caller-"', '"hevc-plane-control-caller-"'],
    ["alignment16-abort-control", "hevc-plane-abort-control", 3],
  ];
  for (const [file, target, before, after] of [
    ["alignment16-attempt-abort-capture.mjs", "hevc-plane-attempt-abort-capture.mjs", "ALLOCATION_ATTEMPT_ROOT } from ", "ALLOCATION_ATTEMPT_ROOT } from "],
    ["alignment16-control-recipe.mjs", "hevc-plane-control-recipe.mjs", "import { makeAlignment16ExportRecipe as makeAllocationAttemptExportRecipe } from ", "import { makeHevcPlaneExportRecipe as makeAllocationAttemptExportRecipe } from "],
    ["alignment16-control-recipe.mjs", "hevc-plane-control-recipe.mjs", "import { makeAlignment16ControlBrowserFactory as makeAllocationAttemptBrowserFactory } from ", "import { makeHevcPlaneControlBrowserFactory as makeAllocationAttemptBrowserFactory } from "],
  ]) edits.push([before + JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", file)).href), after + JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", target)).href)]);
  return exact(prior, edits);
}

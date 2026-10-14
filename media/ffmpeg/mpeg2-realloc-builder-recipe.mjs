// Use every actually qualified old builder gate, adding only the 64-byte slot.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Builder as parentInner, makePacketCacheOuterBuilder as parentOuter,
  makePacketCacheHevcWrapper as parentHevc } from "./mpeg2-packet-largest-idle-builder-recipe.mjs";
export { makePacketCachePipelineGenerator } from "./mpeg2-packet-largest-idle-builder-recipe.mjs";
export const REALLOC_NATIVE_FILES = ["media/ffmpeg/mpeg2-realloc-attempt.c", "media/ffmpeg/mpeg2-realloc-attempt-smoke.c",
  "media/ffmpeg/mpeg2-realloc-avutil-smoke.c", "media/ffmpeg/mpeg2-realloc-attempt-recipe.mjs",
  "media/ffmpeg/mpeg2-realloc-builder-recipe.mjs", "media/ffmpeg/build-mpeg2-realloc-attempt.mjs", "tests/mpeg2-realloc-attempt.test.mjs"];
function transform(parent, edits) {
  let generated = parent.generated;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before.slice(0, 160)); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, parent.generated);
  return { generated, generatedSha256: sha(generated), edits, previousSha256: sha(parent.generated), publicAcceptance: false };
}
export function makeAlignment16Builder(source, root) {
  return transform(parentInner(source, root), [
    ["media/ffmpeg/mpeg2-packet-largest-idle-recipe.mjs", "media/ffmpeg/mpeg2-realloc-attempt-recipe.mjs"],
    ["makeLargestIdleRecipe as makeAlignedReuseRecipe", "makeReallocAttemptShellRecipe as makeAlignedReuseRecipe"],
  ]);
}
const helperEdit = root => [[pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-largest-idle-builder-recipe.mjs")).href,
  pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-realloc-builder-recipe.mjs")).href]];
export const makePacketCacheOuterBuilder = (source, root) => transform(parentOuter(source, root), helperEdit(root));
export const makePacketCacheHevcWrapper = (source, root) => transform(parentHevc(source, root), helperEdit(root));
export function makeReallocHostedBuilder(source, root) {
  const moduleUrl = file => pathToFileURL(path.join(root, file)).href;
  const edits = [
    ['const root = path.resolve(import.meta.dirname, "../..")', `const root = ${JSON.stringify(root)}`],
    ['from "./mpeg2-packet-largest-idle-builder-recipe.mjs"', `from ${JSON.stringify(moduleUrl("media/ffmpeg/mpeg2-realloc-builder-recipe.mjs"))}`],
    ['from "./mpeg2-packet-largest-idle-source.mjs"', `from ${JSON.stringify(moduleUrl("media/ffmpeg/mpeg2-packet-largest-idle-source.mjs"))}`],
    ...["stable-ui-headless-baseline-recipe.mjs", "owned-runtime-scratch.mjs", "wasm-memory-limits.mjs"].map(file =>
      [`from "../../scripts/lib/${file}"`, `from ${JSON.stringify(moduleUrl("scripts/lib/" + file))}`]),
    ["const sourceFiles = [", `const sourceFiles = [${REALLOC_NATIVE_FILES.map(file => JSON.stringify(file)).join(",")},`],
    ['manifest.scope = "private-fixed-heaps-largest-idle-packet-candidate-not-browser-acceptance";',
      'manifest.scope = "private-fixed-heaps-realloc-scalar-diagnostic-not-browser-acceptance";'],
    ['const manifestPath = path.join(output, "build-manifest.json")', `const dispatchPath = path.join(output, "realloc-attempt-smoke.json"), actualPath = path.join(output, "realloc-avutil-smoke.json");
  const dispatchBytes = await readFile(dispatchPath), actualBytes = await readFile(actualPath);
  const dispatch = JSON.parse(dispatchBytes), actual = JSON.parse(actualBytes);
  assert.equal(dispatch.scope, "synthetic-realloc-dispatch-not-real-libavutil-or-media-oom");
  assert.equal(dispatch.passed, 9); assert.equal(dispatch.cases, 9); assert.equal(dispatch.slotBytes, 64);
  assert.equal(actual.scope, "actual-libavutil-realloc-lifetime-not-conversion");
  assert.equal(actual.passed, 6); assert.equal(actual.cases, 6); assert.equal(actual.slotBytes, 64);
  assert.equal(actual.aliasContentPreserved, true); assert.equal(actual.constructorBindingVerified, true);
  assert.equal(actual.conversionsPerformed, 0); assert.equal(dispatch.conversionsPerformed, 0);
  const manifestPath = path.join(output, "build-manifest.json")`],
    ['await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");', `assert.notEqual(sha(decoder), "7bb58a363d81030d38a8dc3187dc0adf541b77385f06bc0c576225ba29f78439");
  manifest.reallocAttempt = { slotBytes: 64, maximumSlots: 1, schemaVersion: 1,
    actualWasmSyntheticDispatch: dispatch, actualWasmLibavutil: actual,
    dispatchExactSource: dispatchBytes.toString(), dispatchSha256: sha(dispatchBytes),
    actualExactSource: actualBytes.toString(), actualSha256: sha(actualBytes),
    nativePayloadRead: false, nativePayloadCopied: false, allocatorPolicyChanged: false,
    bufferReferenceOwnershipChanged: false, codecSettingsChanged: false, heapLimitsChanged: false,
    actualOriginalFailedRequestProven: false, browserFailurePathQualified: false,
    fullOriginalCompleted: false, completeChromiumMemoryAcceptance: false, speedGainProven: false, publicAcceptance: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");`],
    ["await unlink(controlPath);", "await unlink(dispatchPath); await unlink(actualPath);\n  await unlink(controlPath);"],
  ];
  return transform({ generated: source }, edits);
}

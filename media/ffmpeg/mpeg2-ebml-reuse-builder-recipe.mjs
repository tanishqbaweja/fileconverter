import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Builder as parentInner, makePacketCacheOuterBuilder as parentOuter,
  makePacketCacheHevcWrapper as parentHevc, makeReallocHostedBuilder } from "./mpeg2-realloc-builder-recipe.mjs";
export { makePacketCachePipelineGenerator } from "./mpeg2-realloc-builder-recipe.mjs";
export const EBML_REUSE_NATIVE_FILES = ["media/ffmpeg/mpeg2-ebml-reuse.h", "media/ffmpeg/mpeg2-ebml-reuse-smoke.c",
  "media/ffmpeg/mpeg2-ebml-reuse-source.mjs", "media/ffmpeg/mpeg2-ebml-reuse-recipe.mjs",
  "media/ffmpeg/mpeg2-ebml-reuse-builder-recipe.mjs", "media/ffmpeg/build-mpeg2-ebml-reuse.mjs", "tests/mpeg2-ebml-reuse.test.mjs"];
function transform(parent, edits) {
  let generated = parent.generated;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, parent.generated);
  return { generated, generatedSha256: sha(generated), previousSha256: sha(parent.generated), edits, publicAcceptance: false };
}
export function makeAlignment16Builder(source, root) {
  return transform(parentInner(source, root), [
    ["media/ffmpeg/mpeg2-realloc-attempt-recipe.mjs", "media/ffmpeg/mpeg2-ebml-reuse-recipe.mjs"],
    ["makeReallocAttemptShellRecipe as makeAlignedReuseRecipe", "makeEbmlReuseShellRecipe as makeAlignedReuseRecipe"],
  ]);
}
const helperEdit = root => [[pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-realloc-builder-recipe.mjs")).href,
  pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-ebml-reuse-builder-recipe.mjs")).href]];
export const makePacketCacheOuterBuilder = (source, root) => transform(parentOuter(source, root), helperEdit(root));
export const makePacketCacheHevcWrapper = (source, root) => transform(parentHevc(source, root), helperEdit(root));
export function makeEbmlReuseHostedBuilder(source, root) {
  const parent = makeReallocHostedBuilder(source, root);
  const validation = `const ebmlSmokePath = path.join(output, "ebml-reuse-smoke.json"), ebmlBytes = await readFile(ebmlSmokePath);
  const ebml = JSON.parse(ebmlBytes);
  assert.equal(ebml.scope, "actual-libavutil-ebml-reuse-not-conversion");
  assert.equal(ebml.reuseIterations, 200000); assert.equal(ebml.maximumIdleLeases, 1);
  assert.equal(ebml.maximumIdleCapacityBytes, 1048640); assert.equal(ebml.injectedFailureCases, 4);
  for (const field of ["logicalSizesPreserved", "aliasesAndDeferredClose", "existingReallocContentPreserved",
    "oversizedAndZeroDelegate", "ownedAllocationsBalanced"]) assert.equal(ebml[field], true);
  assert.equal(ebml.matchedWorkloadRounds, 20000); assert.equal(ebml.candidatePayloadAllocationCalls, 1);
  assert.equal(ebml.candidatePayloadAllocatedBytes, 273954); assert.equal(ebml.upstreamInitialRequests, 20000);
  assert.equal(ebml.conversionsPerformed, 0); assert.equal(ebml.conversionSpeedGainProven, false);
  manifest.ebmlReuse = { actualWasmLibavutil: ebml, exactSource: ebmlBytes.toString(), sha256: sha(ebmlBytes),
    allocatorPolicyChanged: true, scope: "matroska-simpleblock-and-block-initial-null-only",
    perDemuxerCache: true, maximumIdleLeases: 1, maximumIdleCapacityBytes: 1048640,
    logicalBufferSizesPreserved: true, liveAliasesNeverReused: true, oversizedBlocksRejected: false,
    metadataAndAttachmentAllocationsChanged: false, codecSettingsChanged: false, heapLimitsChanged: false,
    browserFidelityVerified: false, fullOriginalCompleted: false, completeChromiumMemoryAcceptance: false,
    conversionSpeedGainProven: false, publicAcceptance: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");
  await unlink(ebmlSmokePath);
`;
  return transform(parent, [
    [pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-realloc-builder-recipe.mjs")).href,
      pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-ebml-reuse-builder-recipe.mjs")).href],
    ["const sourceFiles = [", `const sourceFiles = [${EBML_REUSE_NATIVE_FILES.map(file => JSON.stringify(file)).join(",")},`],
    ["private-fixed-heaps-realloc-scalar-diagnostic-not-browser-acceptance", "private-fixed-heaps-ebml-reuse-candidate-not-browser-acceptance"],
    ["  const retained = JSON.parse(await readFile(manifestPath));", "  " + validation + "  const retained = JSON.parse(await readFile(manifestPath));"],
  ]);
}

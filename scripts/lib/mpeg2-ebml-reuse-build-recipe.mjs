import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Workflow as parentWorkflow, makeReallocBranchCaller, makeReallocCollector } from "./mpeg2-realloc-build-recipe.mjs";
function transform(parent, edits) {
  let generated = parent;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, parent);
  return { generated, generatedSha256: sha(generated), edits, publicAcceptance: false };
}
export const makeAlignment16Workflow = source => transform(parentWorkflow(source), [
  ["node media/ffmpeg/build-mpeg2-realloc-attempt.mjs", "node media/ffmpeg/build-mpeg2-ebml-reuse.mjs"],
]).generated;
export function makeEbmlReuseBranchCaller(source, root) {
  return transform(makeReallocBranchCaller(source, root).generated, [
    ["codex/mpeg2-realloc-attempt-20261014", "codex/mpeg2-ebml-reuse-20261014"],
    ["evidence/mpeg2-realloc-attempt-build-branch-2026-10-14", "evidence/mpeg2-ebml-reuse-build-branch-2026-10-14"],
    ["realloc-attempt-git-index-", "ebml-reuse-git-index-"],
    ['["scripts/prepare-mpeg2-realloc-build-branch.mjs",', '["scripts/prepare-mpeg2-ebml-reuse-build-branch.mjs", "scripts/lib/mpeg2-ebml-reuse-build-recipe.mjs", "scripts/prepare-mpeg2-realloc-build-branch.mjs",'],
    [pathToFileURL(path.join(root, "scripts/lib/mpeg2-realloc-build-recipe.mjs")).href,
      pathToFileURL(path.join(root, "scripts/lib/mpeg2-ebml-reuse-build-recipe.mjs")).href],
    ["Build bounded packet cache atop qualified HEVC planes with unchanged fixed heaps and encoder", "Build private Matroska final-unref buffer reuse with unchanged fixed heaps and codecs"],
  ]);
}
export function makeEbmlReuseCollector(source, root) {
  const gates = `  const ebml = manifest.ebmlReuse, smoke = ebml.actualWasmLibavutil;
  assert.equal(sha(ebml.exactSource), ebml.sha256); assert.deepEqual(JSON.parse(ebml.exactSource), smoke);
  assert.equal(ebml.scope, "matroska-simpleblock-and-block-initial-null-only");
  assert.equal(ebml.allocatorPolicyChanged, true); assert.equal(ebml.maximumIdleLeases, 1);
  assert.equal(ebml.maximumIdleCapacityBytes, 1048640); assert.equal(ebml.perDemuxerCache, true);
  assert.equal(smoke.scope, "actual-libavutil-ebml-reuse-not-conversion");
  assert.equal(smoke.reuseIterations, 200000); assert.equal(smoke.injectedFailureCases, 4);
  assert.equal(smoke.matchedWorkloadRounds, 20000); assert.equal(smoke.candidatePayloadAllocationCalls, 1);
  assert.equal(smoke.candidatePayloadAllocatedBytes, 273954); assert.equal(smoke.upstreamInitialRequests, 20000);
  for(const field of ["logicalSizesPreserved", "aliasesAndDeferredClose", "existingReallocContentPreserved",
    "oversizedAndZeroDelegate", "ownedAllocationsBalanced"]) assert.equal(smoke[field], true);
  for(const field of ["codecSettingsChanged", "heapLimitsChanged", "metadataAndAttachmentAllocationsChanged",
    "oversizedBlocksRejected", "browserFidelityVerified", "fullOriginalCompleted", "completeChromiumMemoryAcceptance",
    "conversionSpeedGainProven", "publicAcceptance"]) assert.equal(ebml[field], false);
`;
  return transform(makeReallocCollector(source, root).generated, [
    ["work/mpeg2-realloc-attempt-${runId}", "work/mpeg2-ebml-reuse-${runId}"],
    ["evidence/mpeg2-realloc-attempt-build-${runId}.json", "evidence/mpeg2-ebml-reuse-build-${runId}.json"],
    ["evidence/mpeg2-realloc-attempt-build-branch-2026-10-14.json", "evidence/mpeg2-ebml-reuse-build-branch-2026-10-14.json"],
    ["realloc-attempt-artifact-", "ebml-reuse-artifact-"],
    ["private-fixed-heaps-realloc-scalar-diagnostic-not-browser-acceptance", "private-fixed-heaps-ebml-reuse-candidate-not-browser-acceptance"],
    ["  complete = true;", gates + "  complete = true;"],
    ["actual-realloc-scalar-build-unit-verified-not-browser-acceptance", "actual-ebml-reuse-build-unit-verified-not-browser-acceptance"],
  ]);
}

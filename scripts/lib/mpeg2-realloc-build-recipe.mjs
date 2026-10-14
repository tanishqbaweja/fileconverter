// Isolated workflow/collector derivatives; keep every parent protection intact.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeLargestIdleWorkflow, makeLargestIdleBranchCaller, makeLargestIdleCollector } from "./mpeg2-packet-largest-idle-build-recipe.mjs";
function transform(prior, edits) {
  let generated = prior;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before.slice(0,160)); generated = generated.replace(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
  assert.equal(reverse, prior); return { generated, generatedSha256: sha(generated), edits, priorSha256: sha(prior), publicAcceptance: false };
}
export const makeAlignment16Workflow = source => transform(makeLargestIdleWorkflow(source), [
  ["node media/ffmpeg/build-mpeg2-packet-largest-idle.mjs", "node media/ffmpeg/build-mpeg2-realloc-attempt.mjs"],
]).generated;
export function makeReallocBranchCaller(source, root) {
  return transform(makeLargestIdleBranchCaller(source, root).generated, [
    ["codex/mpeg2-packet-largest-idle-20261013", "codex/mpeg2-realloc-attempt-20261014"],
    ["evidence/mpeg2-packet-largest-idle-build-branch-2026-10-13", "evidence/mpeg2-realloc-attempt-build-branch-2026-10-14"],
    ["packet-largest-idle-git-index-", "realloc-attempt-git-index-"],
    ['["scripts/prepare-mpeg2-packet-largest-idle-build-branch.mjs",', '["scripts/prepare-mpeg2-realloc-build-branch.mjs", "scripts/lib/mpeg2-realloc-build-recipe.mjs", "scripts/prepare-mpeg2-packet-largest-idle-build-branch.mjs",'],
    [pathToFileURL(path.join(root, "scripts/lib/mpeg2-packet-largest-idle-build-recipe.mjs")).href,
      pathToFileURL(path.join(root, "scripts/lib/mpeg2-realloc-build-recipe.mjs")).href],
  ]);
}
export function makeReallocCollector(source, root) {
  const gates = `  const realloc = manifest.reallocAttempt;
  assert.equal(realloc.slotBytes, 64); assert.equal(realloc.maximumSlots, 1); assert.equal(realloc.schemaVersion, 1);
  assert.equal(sha(realloc.dispatchExactSource), realloc.dispatchSha256);
  assert.deepEqual(JSON.parse(realloc.dispatchExactSource), realloc.actualWasmSyntheticDispatch);
  assert.equal(realloc.actualWasmSyntheticDispatch.scope, 'synthetic-realloc-dispatch-not-real-libavutil-or-media-oom');
  assert.equal(realloc.actualWasmSyntheticDispatch.passed, 10);
  assert.equal(realloc.actualWasmSyntheticDispatch.outerMetadataPreservedAcrossRecursion, true);
  assert.equal(sha(realloc.actualExactSource), realloc.actualSha256);
  assert.deepEqual(JSON.parse(realloc.actualExactSource), realloc.actualWasmLibavutil);
  assert.equal(realloc.actualWasmLibavutil.scope, 'actual-libavutil-realloc-lifetime-not-conversion');
  assert.equal(realloc.actualWasmLibavutil.passed, 6);
  assert.equal(realloc.actualWasmLibavutil.aliasContentPreserved, true);
  assert.equal(realloc.actualWasmLibavutil.constructorBindingVerified, true);
  for(const field of ['nativePayloadRead','nativePayloadCopied','allocatorPolicyChanged','bufferReferenceOwnershipChanged',
    'codecSettingsChanged','heapLimitsChanged','actualOriginalFailedRequestProven','browserFailurePathQualified',
    'fullOriginalCompleted','completeChromiumMemoryAcceptance','speedGainProven','publicAcceptance']) assert.equal(realloc[field], false);
  assert.notEqual(sha(decoder), '7bb58a363d81030d38a8dc3187dc0adf541b77385f06bc0c576225ba29f78439');
`;
  return transform(makeLargestIdleCollector(source, root).generated, [
    ["work/mpeg2-packet-largest-idle-${runId}", "work/mpeg2-realloc-attempt-${runId}"],
    ["evidence/mpeg2-packet-largest-idle-build-${runId}.json", "evidence/mpeg2-realloc-attempt-build-${runId}.json"],
    ["evidence/mpeg2-packet-largest-idle-build-branch-2026-10-13.json", "evidence/mpeg2-realloc-attempt-build-branch-2026-10-14.json"],
    ["packet-largest-idle-artifact-", "realloc-attempt-artifact-"],
    ["private-fixed-heaps-largest-idle-packet-candidate-not-browser-acceptance", "private-fixed-heaps-realloc-scalar-diagnostic-not-browser-acceptance"],
    ["  complete = true;", gates + "  complete = true;"],
    ["actual-largest-idle-packet-build-unit-verified-not-browser-acceptance", "actual-realloc-scalar-build-unit-verified-not-browser-acceptance"],
  ]);
}

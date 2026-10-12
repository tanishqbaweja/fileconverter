import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeHevcPlaneWorkflow, makeHevcPlaneBranchCaller, makeHevcPlaneCollector } from "./hevc-plane-build-recipe.mjs";
function transform(prior, edits) {
  let generated = prior;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior); return { generated, generatedSha256: sha(generated), edits };
}
export function makePacketCacheWorkflow(source) {
  return transform(makeHevcPlaneWorkflow(source), [["node media/ffmpeg/build-mpeg2-hevc-planes.mjs", "node media/ffmpeg/build-mpeg2-packet-cache.mjs"]]).generated;
}
export { makePacketCacheWorkflow as makeAlignment16Workflow };
export function makePacketCacheBranchCaller(source, root) {
  const prior = makeHevcPlaneBranchCaller(source, root).generated;
  return transform(prior, [
    ["codex/mpeg2-hevc-planes-20261012-include-fix", "codex/mpeg2-packet-cache-20261012"],
    ["evidence/mpeg2-hevc-plane-build-branch-2026-10-12-include-fix", "evidence/mpeg2-packet-cache-build-branch-2026-10-12"],
    ["hevc-plane-git-index-", "packet-cache-git-index-"],
    ["Build bounded HEVC plane candidate with fixed alignment16 heap and unchanged encoder", "Build bounded packet cache atop qualified HEVC planes with unchanged fixed heaps and encoder"],
    ["hevc-plane-private-build-branch-pushed-not-dispatched", "packet-cache-private-build-branch-pushed-not-dispatched"],
    ['["scripts/prepare-hevc-plane-build-branch.mjs", "scripts/lib/hevc-plane-build-recipe.mjs", "scripts/prepare-alignment16-build-branch.mjs", "scripts/lib/alignment16-build-recipe.mjs"]',
      '["scripts/prepare-mpeg2-packet-cache-build-branch.mjs", "scripts/lib/mpeg2-packet-cache-build-recipe.mjs", "scripts/prepare-hevc-plane-build-branch.mjs", "scripts/lib/hevc-plane-build-recipe.mjs", "scripts/prepare-alignment16-build-branch.mjs", "scripts/lib/alignment16-build-recipe.mjs"]'],
    [pathToFileURL(path.join(root, "scripts/lib/hevc-plane-build-recipe.mjs")).href, pathToFileURL(path.join(root, "scripts/lib/mpeg2-packet-cache-build-recipe.mjs")).href],
  ]);
}
export function makePacketCacheCollector(source, root) {
  const prior = makeHevcPlaneCollector(source, root).generated;
  const extra = `  const packetCache = manifest.packetCache, packetSmoke = packetCache.actualWasmLifecycle;
  assert.equal(packetSmoke.status, "actual-libavutil-packet-cache-lifecycle-not-conversion");
  assert.equal(packetSmoke.reuseIterations, 200000); assert.equal(packetSmoke.maximumIdleLeases, 1); assert.equal(packetSmoke.payloadLimitBytes, 1048576);
  assert.equal(packetSmoke.injectedFailureCases, 4); assert.equal(packetSmoke.ownedAllocationsBalanced, true); assert.equal(packetSmoke.aliasesAndDeferredClose, true);
  assert.equal(sha(packetCache.actualWasmLifecycleExactSource), packetCache.actualWasmLifecycleSha256);
  assert.deepEqual(JSON.parse(packetCache.actualWasmLifecycleExactSource), packetSmoke);
  assert.equal(packetCache.maximumIdleLeases, 1); assert.equal(packetCache.maximumIdlePayloadBytes, 1048576); assert.equal(packetCache.paddingBytes, 64);
  assert.equal(packetCache.allocateActualRequiredBytes, true);
  for (const key of ["liveReferencesChanged", "codecSettingsChanged", "heapLimitsRaised", "browserFidelityVerified", "fullOriginalCompleted", "completeChromiumMemoryAcceptance", "speedGainProven", "publicAcceptance"]) assert.equal(packetCache[key], false);
  for (const key of ["generatedOuterBuilder", "generatedHevcWrapper"]) assert.equal(sha(packetCache[key]), packetCache[key + "Sha256"]);
  assert.equal(sha(packetCache.generatedPipeline.generated), packetCache.generatedPipeline.generatedSha256);
  assert.notEqual(sha(decoder), "07ff8c19e9f58205f21a9cd10f6d7f0e0fb8f1e7086b810818724846117d51e4");
`;
  return transform(prior, [
    ["work/mpeg2-hevc-planes-${runId}", "work/mpeg2-packet-cache-${runId}"],
    ["evidence/mpeg2-hevc-plane-build-${runId}.json", "evidence/mpeg2-packet-cache-build-${runId}.json"],
    ["evidence/mpeg2-hevc-plane-build-branch-2026-10-12-include-fix.json", "evidence/mpeg2-packet-cache-build-branch-2026-10-12.json"],
    ["hevc-plane-artifact-", "packet-cache-artifact-"],
    ["private-alignment16-hevc-plane-single-idle-not-browser-acceptance", "private-fixed-heaps-hevc-packet-cache-not-browser-acceptance"],
    ["  complete = true;", extra + "  complete = true;"],
    ["actual-hevc-plane-build-unit-verified-not-browser-acceptance", "actual-packet-cache-build-unit-verified-not-browser-acceptance"],
  ]);
}

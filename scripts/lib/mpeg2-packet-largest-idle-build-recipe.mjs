import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makePacketCacheStrictWorkflow, makePacketCacheStrictBranchCaller, makePacketCacheStrictCollector } from "./mpeg2-packet-cache-strict-build-recipe.mjs";
function transform(prior, edits) {
  let generated = prior;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior); return { generated, generatedSha256: sha(generated), edits };
}
export function makeLargestIdleWorkflow(source) {
  return transform(makePacketCacheStrictWorkflow(source), [["node media/ffmpeg/build-mpeg2-packet-cache-strict.mjs", "node media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"]]).generated;
}
export { makeLargestIdleWorkflow as makeAlignment16Workflow };
export function makeLargestIdleBranchCaller(source, root) {
  return transform(makePacketCacheStrictBranchCaller(source, root).generated, [
    ["codex/mpeg2-packet-cache-20261012-warning-fix", "codex/mpeg2-packet-largest-idle-20261013"],
    ["evidence/mpeg2-packet-cache-build-branch-2026-10-12-warning-fix", "evidence/mpeg2-packet-largest-idle-build-branch-2026-10-13"],
    ["packet-cache-strict-git-index-", "packet-largest-idle-git-index-"],
    ['["scripts/prepare-mpeg2-packet-cache-strict-build-branch.mjs",', '["scripts/prepare-mpeg2-packet-largest-idle-build-branch.mjs", "scripts/lib/mpeg2-packet-largest-idle-build-recipe.mjs", "scripts/prepare-mpeg2-packet-cache-strict-build-branch.mjs",'],
    [pathToFileURL(path.join(root, "scripts/lib/mpeg2-packet-cache-strict-build-recipe.mjs")).href, pathToFileURL(path.join(root, "scripts/lib/mpeg2-packet-largest-idle-build-recipe.mjs")).href],
  ]);
}
export function makeLargestIdleCollector(source, root) {
  const extra = `  const policy = manifest.packetLargestIdle;
  assert.equal(policy.policy, "largest-final-unref-idle");
  assert.deepEqual(policy.actualCandidate, packetSmoke);
  assert.equal(sha(policy.controlExactSource), policy.controlSha256);
  assert.deepEqual(JSON.parse(policy.controlExactSource), policy.actualControl);
  assert.equal(policy.actualControl.policy, "first-idle"); assert.equal(policy.actualCandidate.policy, "largest-idle");
  assert.equal(policy.actualControl.matchedWorkloadRounds, 2000); assert.equal(policy.actualCandidate.matchedWorkloadRounds, 2000);
  assert.equal(policy.payloadAllocationCallsBefore, 4001); assert.equal(policy.payloadAllocationCallsAfter, 2001);
  assert.equal(policy.payloadAllocatedBytesBefore, 628682088); assert.equal(policy.payloadAllocatedBytesAfter, 506088);
  assert.equal(policy.retainedIdleLeases, 1); assert.equal(policy.maximumIdleCapacityBytes, 1048640);
  assert.equal(policy.onlyReleaseSelectionChanged, true);
  for (const key of ["actualFullFailureCauseProven", "conversionSpeedGainProven", "publicAcceptance"]) assert.equal(policy[key], false);
  assert.notEqual(sha(decoder), "4421339c802d2031c27c6c62ee948174b454797a7176d338cfe451b19c2945cb");
`;
  return transform(makePacketCacheStrictCollector(source, root).generated, [
    ["work/mpeg2-packet-cache-${runId}", "work/mpeg2-packet-largest-idle-${runId}"],
    ["evidence/mpeg2-packet-cache-build-${runId}.json", "evidence/mpeg2-packet-largest-idle-build-${runId}.json"],
    ["evidence/mpeg2-packet-cache-build-branch-2026-10-12-warning-fix.json", "evidence/mpeg2-packet-largest-idle-build-branch-2026-10-13.json"],
    ["packet-cache-artifact-", "packet-largest-idle-artifact-"],
    ["private-fixed-heaps-hevc-packet-cache-not-browser-acceptance", "private-fixed-heaps-largest-idle-packet-candidate-not-browser-acceptance"],
    ["  complete = true;", extra + "  complete = true;"],
    ["actual-packet-cache-build-unit-verified-not-browser-acceptance", "actual-largest-idle-packet-build-unit-verified-not-browser-acceptance"],
  ]);
}

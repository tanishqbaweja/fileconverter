import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Workflow as parentWorkflow, makeMvfArenaBranchCaller, makeMvfArenaCollector } from "./mvf-arena-build-recipe.mjs";
function transform(parent, edits) {
  let generated = parent;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let restored = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(restored.split(after).length, 2); restored = restored.replace(after, before); }
  assert.equal(restored, parent);
  return { generated, generatedSha256: sha(generated), parentSha256: sha(parent), edits, publicAcceptance: false };
}
export const makeAlignment16Workflow = source => transform(parentWorkflow(source), [
  ["node media/ffmpeg/build-mpeg2-mvf-arena.mjs", "node media/ffmpeg/build-mpeg2-packet-interleave.mjs"],
]).generated;
export function makePacketInterleaveBranchCaller(source, root) {
  return transform(makeMvfArenaBranchCaller(source, root).generated, [
    ["codex/mpeg2-mvf-arena-20261015", "codex/mpeg2-packet-interleave-20261015"],
    ["evidence/mpeg2-mvf-arena-build-branch-2026-10-15", "evidence/mpeg2-packet-interleave-build-branch-2026-10-15"],
    ["mvf-arena-git-index-", "packet-interleave-git-index-"],
    ['["scripts/prepare-mvf-arena-build-branch.mjs",', '["scripts/prepare-packet-interleave-build-branch.mjs", "scripts/lib/packet-interleave-build-recipe.mjs", "scripts/prepare-mvf-arena-build-branch.mjs",'],
    [pathToFileURL(path.join(root, "scripts/lib/mvf-arena-build-recipe.mjs")).href,
      pathToFileURL(path.join(root, "scripts/lib/packet-interleave-build-recipe.mjs")).href],
    ["Build private bounded HEVC MVF arena with unchanged fixed heaps and codecs", "Test pinned libavformat packet ownership without changing production conversion"],
  ]);
}
export function makePacketInterleaveCollector(source, root) {
  const gates = `  const ownership = manifest.packetInterleaveOwnership;
  assert.equal(sha(ownership.exactSource), ownership.sha256);
  assert.deepEqual(JSON.parse(ownership.exactSource), ownership.actualWasmExperiment);
  const experiment = ownership.actualWasmExperiment;
  assert.equal(experiment.status, "passed");
  assert.equal(experiment.scope, "actual-wasm32-libavformat-interleave-ownership-not-conversion");
  assert.equal(experiment.matchedPackets, 8); assert.equal(experiment.queuedPayloadAllocations, 8);
  assert.equal(experiment.drainedPayloadAllocations, 1); assert.equal(experiment.repeatedPackets, 4000);
  for (const field of ["payloadPaddingAndPerStreamTimestampsVerified", "aliasesAndMuxHeldReferencesPreserved",
    "deferredClosePassed", "writeErrorPropagated", "abandonedQueueCleaned", "ownedAllocationsBalanced"])
    assert.equal(experiment[field], true);
  for (const field of ["productionQueuePolicyChanged", "realContainerFidelityVerified", "fullFailureCauseProven", "conversionSpeedGainProven"])
    assert.equal(experiment[field], false);
  assert.equal(experiment.conversionsPerformed, 0);
  assert.equal(ownership.productionQueuePolicyChanged, false); assert.equal(ownership.publicAcceptance, false);
  assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576");
`;
  return transform(makeMvfArenaCollector(source, root).generated, [
    ["work/mpeg2-mvf-arena-${runId}", "work/mpeg2-packet-interleave-${runId}"],
    ["evidence/mpeg2-mvf-arena-build-${runId}.json", "evidence/mpeg2-packet-interleave-build-${runId}.json"],
    ["evidence/mpeg2-mvf-arena-build-branch-2026-10-15.json", "evidence/mpeg2-packet-interleave-build-branch-2026-10-15.json"],
    ["mvf-arena-artifact-", "packet-interleave-artifact-"],
    ["private-fixed-heaps-mvf-arena-candidate-not-browser-acceptance", "private-packet-interleave-ownership-not-browser-acceptance"],
    ["  complete = true;", gates + "  complete = true;"],
    ["actual-mvf-arena-build-unit-verified-not-browser-acceptance", "actual-packet-interleave-ownership-unit-verified-not-browser-acceptance"],
  ]);
}

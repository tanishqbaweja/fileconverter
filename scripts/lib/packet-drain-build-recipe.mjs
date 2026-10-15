import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Workflow as parentWorkflow, makePacketInterleaveBranchCaller, makePacketInterleaveCollector } from "./packet-interleave-build-recipe.mjs";
function transform(parent, edits) {
  let generated = parent;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let restored = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(restored.split(after).length, 2); restored = restored.replace(after, before); }
  assert.equal(restored, parent);
  return { generated, generatedSha256: sha(generated), parentSha256: sha(parent), edits, publicAcceptance: false };
}
export const makeAlignment16Workflow = source => transform(parentWorkflow(source), [
  ["node media/ffmpeg/build-mpeg2-packet-interleave.mjs", "node media/ffmpeg/build-mpeg2-packet-drain.mjs"],
]).generated;
export function makePacketDrainBranchCaller(source, root) {
  return transform(makePacketInterleaveBranchCaller(source, root).generated, [
    ["codex/mpeg2-packet-interleave-20261015", "codex/mpeg2-packet-drain-20261015"],
    ["evidence/mpeg2-packet-interleave-build-branch-2026-10-15", "evidence/mpeg2-packet-drain-build-branch-2026-10-15"],
    ["packet-interleave-git-index-", "packet-drain-git-index-"],
    ['["scripts/prepare-packet-interleave-build-branch.mjs",', '["scripts/prepare-packet-drain-build-branch.mjs", "scripts/lib/packet-drain-build-recipe.mjs", "scripts/prepare-packet-interleave-build-branch.mjs",'],
    [pathToFileURL(path.join(root, "scripts/lib/packet-interleave-build-recipe.mjs")).href,
      pathToFileURL(path.join(root, "scripts/lib/packet-drain-build-recipe.mjs")).href],
    ["Test pinned libavformat packet ownership without changing production conversion", "Build private packet-queue drain with unchanged codec settings and fixed heaps"],
  ]);
}
export function makePacketDrainCollector(source, root) {
  const gates = `  const { makePacketDrainKernel } = await import(${JSON.stringify(pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-drain-source.mjs")).href)});
  const drainKernel = makePacketDrainKernel(await readFile(path.join(root, "media/ffmpeg/mpeg2-candidate.c"), "utf8"));
  assert.equal(manifest.packetCache.generatedKernel, drainKernel.generated);
  assert.equal(manifest.packetDrain.generatedKernelSha256, sha(drainKernel.generated));
  assert.equal(manifest.packetDrain.parentKernelSha256, sha(drainKernel.parent));
  assert.equal(manifest.packetDrain.policy, "drain-existing-interleaver-after-each-successful-video-packet");
  assert.equal(manifest.packetDrain.onlyQueueDrainAdded, true);
  assert.equal(manifest.packetDrain.containerPacketOrderMayChange, true);
  assert.equal(manifest.packetDrain.nativeOwnershipTestPassed, true);
  for (const field of ["liveReferencesChanged", "codecSettingsChanged", "heapLimitsChanged", "browserFidelityVerified",
    "fullOriginalCompleted", "memoryAcceptance", "speedGainProven", "publicAcceptance"])
    assert.equal(manifest.packetDrain[field], false);
`;
  return transform(makePacketInterleaveCollector(source, root).generated, [
    ["work/mpeg2-packet-interleave-${runId}", "work/mpeg2-packet-drain-${runId}"],
    ["evidence/mpeg2-packet-interleave-build-${runId}.json", "evidence/mpeg2-packet-drain-build-${runId}.json"],
    ["evidence/mpeg2-packet-interleave-build-branch-2026-10-15.json", "evidence/mpeg2-packet-drain-build-branch-2026-10-15.json"],
    ["packet-interleave-artifact-", "packet-drain-artifact-"],
    ["private-packet-interleave-ownership-not-browser-acceptance", "private-packet-drain-candidate-not-browser-acceptance"],
    ['assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576")',
      'assert.notEqual(manifest.artifacts["within-mpeg2-split.wasm"], "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576")'],
    ["  complete = true;", gates + "  complete = true;"],
    ["actual-packet-interleave-ownership-unit-verified-not-browser-acceptance", "actual-packet-drain-build-unit-verified-not-browser-acceptance"],
  ]);
}

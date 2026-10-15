import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeAlignment16Workflow as parentWorkflow, makePacketDrainBranchCaller, makePacketDrainCollector } from "./packet-drain-build-recipe.mjs";
export const makeAlignment16Workflow = source => exactPatch(parentWorkflow(source), [
  ["node media/ffmpeg/build-mpeg2-packet-drain.mjs", "node media/ffmpeg/build-mpeg2-duration-drain.mjs"],
]).generated;
export function makeDurationDrainBranchCaller(source, root) {
  return exactPatch(makePacketDrainBranchCaller(source, root).generated, [
    ["codex/mpeg2-packet-drain-20261015", "codex/mpeg2-duration-drain-20261015"],
    ["evidence/mpeg2-packet-drain-build-branch-2026-10-15", "evidence/mpeg2-duration-drain-build-branch-2026-10-15"],
    ["packet-drain-git-index-", "duration-drain-git-index-"],
    ['["scripts/prepare-packet-drain-build-branch.mjs",', '["scripts/prepare-duration-drain-build-branch.mjs", "scripts/lib/duration-drain-build-recipe.mjs", "scripts/prepare-packet-drain-build-branch.mjs",'],
    [pathToFileURL(path.join(root, "scripts/lib/packet-drain-build-recipe.mjs")).href,
      pathToFileURL(path.join(root, "scripts/lib/duration-drain-build-recipe.mjs")).href],
    ["Build private packet-queue drain with unchanged codec settings and fixed heaps", "Build private duration-exact packet drain with unchanged clocks/codecs/fixed heaps"],
  ]);
}
export function makeDurationDrainCollector(source, root) {
  const checks = `  const boundary = manifest.packetDurationBoundary, duration = boundary.actualWasmUnit;
  assert.equal(sha(boundary.exactSource), boundary.sha256); assert.deepEqual(JSON.parse(boundary.exactSource), duration);
  assert.equal(duration.status, "passed"); assert.equal(duration.scope, "actual-wasm32-avutil-cfr-boundaries-not-conversion");
  assert.equal(duration.sequences, 21); assert.equal(duration.iterations, 126000); assert.equal(duration.invalidCases, 15);
  assert.deepEqual(duration.lastTwoDurations, [666,667]); assert.equal(duration.regressionTotalTicks, 64000);
  assert.equal(duration.sourceOffsetLastDts, 64661); assert.equal(duration.independentIntegerOracle, true);
  assert.equal(duration.packetBytesUnchanged, true); assert.equal(duration.ptsDtsUnchanged, true);
  assert.equal(duration.allocationsAdded, 0); assert.equal(duration.conversionsPerformed, 0);
  assert.equal(boundary.parentDrainKernelSha256, sha(drainKernel.parent));
  assert.equal(boundary.originalKernelSha256, sha(drainKernel.originalKernel));
  assert.equal(boundary.durationBoundaryCorrection, true); assert.equal(manifest.packetDrain.durationBoundaryCorrection, true);
  for (const field of ["ptsDtsRewritten", "encoderPacketWireChanged", "codecSettingsChanged", "heapLimitsChanged", "liveReferencesChanged",
    "browserFidelityVerified", "fullOriginalCompleted", "memoryAcceptance", "speedGainProven", "publicAcceptance"])
    assert.equal(boundary[field], false);
  assert.notEqual(manifest.artifacts["within-mpeg2-split.wasm"], "b65cc5991e9a74486066a9b442b1c0036d04f7e5a925bcb951971e0f060df152");
`;
  return exactPatch(makePacketDrainCollector(source, root).generated, [
    ["work/mpeg2-packet-drain-${runId}", "work/mpeg2-duration-drain-${runId}"],
    ["evidence/mpeg2-packet-drain-build-${runId}.json", "evidence/mpeg2-duration-drain-build-${runId}.json"],
    ["evidence/mpeg2-packet-drain-build-branch-2026-10-15.json", "evidence/mpeg2-duration-drain-build-branch-2026-10-15.json"],
    ["packet-drain-artifact-", "duration-drain-artifact-"],
    ["private-packet-drain-candidate-not-browser-acceptance", "private-duration-drain-candidate-not-browser-acceptance"],
    [pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-drain-source.mjs")).href,
      pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-duration-drain-source.mjs")).href],
    ["manifest.packetDrain.onlyQueueDrainAdded, true", "manifest.packetDrain.onlyQueueDrainAdded, false"],
    ["  complete = true;", checks + "  complete = true;"],
    ["actual-packet-drain-build-unit-verified-not-browser-acceptance", "actual-duration-drain-build-unit-verified-not-browser-acceptance"],
  ]);
}

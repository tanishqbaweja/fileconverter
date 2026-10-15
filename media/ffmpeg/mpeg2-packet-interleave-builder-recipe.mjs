import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Builder as parentInner, makePacketCacheOuterBuilder as parentOuter,
  makePacketCacheHevcWrapper as parentHevc, makeMvfArenaHostedBuilder } from "./mpeg2-mvf-arena-builder-recipe.mjs";
export { makePacketCachePipelineGenerator } from "./mpeg2-mvf-arena-builder-recipe.mjs";
export const INTERLEAVE_FILES = ["media/ffmpeg/mpeg2-packet-interleave-smoke.c", "media/ffmpeg/mpeg2-packet-interleave-recipe.mjs",
  "media/ffmpeg/mpeg2-packet-interleave-builder-recipe.mjs", "media/ffmpeg/build-mpeg2-packet-interleave.mjs",
  "scripts/lib/packet-interleave-build-recipe.mjs", "scripts/prepare-packet-interleave-build-branch.mjs",
  "scripts/collect-packet-interleave-build.mjs", "tests/mpeg2-packet-interleave.test.mjs"];
function transform(parent, edits) {
  let generated = parent.generated;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let restored = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(restored.split(after).length, 2); restored = restored.replace(after, before); }
  assert.equal(restored, parent.generated);
  return { generated, generatedSha256: sha(generated), parentSha256: sha(parent.generated), edits, publicAcceptance: false };
}
export const makeAlignment16Builder = (source, root) => transform(parentInner(source, root), [
  ["media/ffmpeg/mpeg2-mvf-arena-recipe.mjs", "media/ffmpeg/mpeg2-packet-interleave-recipe.mjs"],
  ["makeMvfArenaShellRecipe as makeAlignedReuseRecipe", "makePacketInterleaveShellRecipe as makeAlignedReuseRecipe"],
]);
const routes = root => [[pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-mvf-arena-builder-recipe.mjs")).href,
  pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-interleave-builder-recipe.mjs")).href]];
export const makePacketCacheOuterBuilder = (source, root) => transform(parentOuter(source, root), routes(root));
export const makePacketCacheHevcWrapper = (source, root) => transform(parentHevc(source, root), routes(root));
export function makePacketInterleaveHostedBuilder(source, root) {
  const checks = `  const ownershipPath = path.join(output, "packet-interleave-smoke.json");
  const ownershipBytes = await readFile(ownershipPath), ownership = JSON.parse(ownershipBytes);
  assert.equal(ownership.status, "passed");
  assert.equal(ownership.scope, "actual-wasm32-libavformat-interleave-ownership-not-conversion");
  assert.equal(ownership.matchedPackets, 8); assert.equal(ownership.queuedPayloadAllocations, 8);
  assert.equal(ownership.drainedPayloadAllocations, 1); assert.equal(ownership.repeatedPackets, 4000);
  for (const field of ["payloadPaddingAndPerStreamTimestampsVerified", "aliasesAndMuxHeldReferencesPreserved",
    "deferredClosePassed", "writeErrorPropagated", "abandonedQueueCleaned", "ownedAllocationsBalanced"])
    assert.equal(ownership[field], true);
  for (const field of ["productionQueuePolicyChanged", "realContainerFidelityVerified", "fullFailureCauseProven", "conversionSpeedGainProven"])
    assert.equal(ownership[field], false);
  assert.equal(ownership.conversionsPerformed, 0);
  manifest.packetInterleaveOwnership = { actualWasmExperiment: ownership, exactSource: ownershipBytes.toString(),
    sha256: sha(ownershipBytes), productionQueuePolicyChanged: false, publicAcceptance: false };
  // This is a smoke-only derivative. Prove the actual production binaries did NOT change.
  assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576");
  assert.equal(manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");
  await unlink(ownershipPath); // Exact tiny result embedded; keep the inherited20-file cap.
`;
  return transform(makeMvfArenaHostedBuilder(source, root), [
    ...routes(root),
    ["const sourceFiles = [", `const sourceFiles = [${INTERLEAVE_FILES.map(file => JSON.stringify(file)).join(",")},`],
    ["private-fixed-heaps-mvf-arena-candidate-not-browser-acceptance", "private-packet-interleave-ownership-not-browser-acceptance"],
    ["  const retained = JSON.parse(await readFile(manifestPath));", checks + "  const retained = JSON.parse(await readFile(manifestPath));"],
  ]);
}

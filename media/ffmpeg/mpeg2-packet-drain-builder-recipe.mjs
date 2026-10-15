import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Builder as parentInner, makePacketCacheOuterBuilder as parentOuter,
  makePacketCacheHevcWrapper as parentHevc, makePacketCachePipelineGenerator as parentPipeline,
  makePacketInterleaveHostedBuilder, INTERLEAVE_FILES } from "./mpeg2-packet-interleave-builder-recipe.mjs";
export const PACKET_DRAIN_EXTRA_FILES = ["media/ffmpeg/mpeg2-packet-drain-source.mjs", "media/ffmpeg/mpeg2-packet-drain-recipe.mjs",
  "media/ffmpeg/mpeg2-packet-drain-builder-recipe.mjs", "media/ffmpeg/build-mpeg2-packet-drain.mjs",
  "media/ffmpeg/make-mpeg2-packet-drain-pipeline.mjs", "scripts/lib/packet-drain-build-recipe.mjs",
  "scripts/prepare-packet-drain-build-branch.mjs", "scripts/collect-packet-drain-build.mjs", "tests/mpeg2-packet-drain.test.mjs"];
export const PACKET_DRAIN_NATIVE_FILES = [...INTERLEAVE_FILES, ...PACKET_DRAIN_EXTRA_FILES];
function transform(parent, edits) {
  let generated = parent.generated;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let restored = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(restored.split(after).length, 2); restored = restored.replace(after, before); }
  assert.equal(restored, parent.generated);
  return { generated, generatedSha256: sha(generated), parentSha256: sha(parent.generated), edits, publicAcceptance: false };
}
export const makeAlignment16Builder = (source, root) => transform(parentInner(source, root), [
  ["media/ffmpeg/mpeg2-packet-interleave-recipe.mjs", "media/ffmpeg/mpeg2-packet-drain-recipe.mjs"],
  ["makePacketInterleaveShellRecipe as makeAlignedReuseRecipe", "makePacketDrainShellRecipe as makeAlignedReuseRecipe"],
]);
const routes = root => [[pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-interleave-builder-recipe.mjs")).href,
  pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-drain-builder-recipe.mjs")).href]];
export const makePacketCacheOuterBuilder = (source, root) => transform(parentOuter(source, root), routes(root));
export const makePacketCacheHevcWrapper = (source, root) => transform(parentHevc(source, root), routes(root));
export const makePacketCachePipelineGenerator = (source, root) => transform(parentPipeline(source, root), [
  [pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-largest-idle-source.mjs")).href,
    pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-drain-source.mjs")).href],
]);
export function makePacketDrainHostedBuilder(source, root) {
  const metadata = `  const { makePacketDrainKernel } = await import(${JSON.stringify(pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-drain-source.mjs")).href)});
  const drainKernel = makePacketDrainKernel((await read("media/ffmpeg/mpeg2-candidate.c")).toString());
  assert.equal(manifest.packetCache.generatedKernel, drainKernel.generated);
  manifest.packetDrain = { policy: "drain-existing-interleaver-after-each-successful-video-packet",
    generatedKernelSha256: sha(drainKernel.generated), parentKernelSha256: sha(drainKernel.parent),
    onlyQueueDrainAdded: true, liveReferencesChanged: false, codecSettingsChanged: false, heapLimitsChanged: false,
    containerPacketOrderMayChange: true, nativeOwnershipTestPassed: true, browserFidelityVerified: false,
    fullOriginalCompleted: false, memoryAcceptance: false, speedGainProven: false, publicAcceptance: false };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");
`;
  return transform(makePacketInterleaveHostedBuilder(source, root), [
    ...routes(root),
    [pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-largest-idle-source.mjs")).href,
      pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-drain-source.mjs")).href],
    ["const sourceFiles = [", `const sourceFiles = [${PACKET_DRAIN_EXTRA_FILES.map(file => JSON.stringify(file)).join(",")},`],
    ["private-packet-interleave-ownership-not-browser-acceptance", "private-packet-drain-candidate-not-browser-acceptance"],
    ["// This is a smoke-only derivative. Prove the actual production binaries did NOT change.",
      "// Explicit queue-only candidate: decoder must change; separate encoder must remain exact."],
    ['assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576")',
      'assert.notEqual(manifest.artifacts["within-mpeg2-split.wasm"], "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576")'],
    ["  const retained = JSON.parse(await readFile(manifestPath));", metadata + "  const retained = JSON.parse(await readFile(manifestPath));"],
  ]);
}

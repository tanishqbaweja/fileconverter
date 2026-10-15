import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeMvfNativeQualifier } from "./mvf-arena-native-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makePacketDrainNativeQualifier(source, root) {
  const parent = makeMvfNativeQualifier(source, root).generated;
  const sourceURI = file => pathToFileURL(path.join(root, file)).href;
  const gate = `const { makePacketDrainKernel } = await import(${JSON.stringify(sourceURI("media/ffmpeg/mpeg2-packet-drain-source.mjs"))});
const drain = makePacketDrainKernel((await read("media/ffmpeg/mpeg2-candidate.c")).toString());
assert.equal(build.manifest.packetCache.generatedKernel, drain.generated);
assert.equal(build.manifest.packetDrain.generatedKernelSha256, sha(drain.generated));
assert.equal(build.manifest.packetDrain.parentKernelSha256, sha(drain.parent));
assert.equal(build.manifest.packetDrain.onlyQueueDrainAdded, true);
assert.equal(build.manifest.packetDrain.containerPacketOrderMayChange, true);
assert.equal(build.manifest.packetInterleaveOwnership.actualWasmExperiment.drainedPayloadAllocations, 1);
`;
  const recipe = exactPatch(parent, [
    ["mpeg2-mvf-arena-build-${runId}", "mpeg2-packet-drain-build-${runId}"],
    ["mpeg2-mvf-arena-build-branch-2026-10-15.json", "mpeg2-packet-drain-build-branch-2026-10-15.json"],
    ["evidence/mpeg2-ebml-reuse-build-38608791023.json", "evidence/mpeg2-packet-interleave-build-38671160915.json"],
    [sourceURI("media/ffmpeg/mpeg2-mvf-arena-builder-recipe.mjs"), sourceURI("media/ffmpeg/mpeg2-packet-drain-builder-recipe.mjs")],
    ["{ MVF_NATIVE_FILES }", "{ PACKET_DRAIN_EXTRA_FILES }"],
    ["...MVF_NATIVE_FILES", "...PACKET_DRAIN_EXTRA_FILES"],
    ["expectedFiles.length, 99", "expectedFiles.length, 116"],
    [String.raw`|tests\/mpeg2-`, String.raw`|scripts\/(?:prepare|collect)-packet-(?:interleave|drain)-build(?:-branch)?\.mjs|tests\/mpeg2-`],
    ["realloc-attempt|ebml-reuse|mvf-arena", "realloc-attempt|ebml-reuse|mvf-arena|packet-interleave|packet-drain"],
    ["const slot = `work/mpeg2-mvf-arena-${runId}`;", gate + "const slot = `work/mpeg2-packet-drain-${runId}`;"],
    ["outputs/reports/mvf-arena-native-sources-${runId}", "outputs/reports/packet-drain-native-sources-${runId}"],
    ["scripts/qualify-mvf-arena-native.mjs", "scripts/qualify-packet-drain-native.mjs"],
    ["evidence/mvf-arena-native-${runId}", "evidence/packet-drain-native-${runId}"],
    ["actual-native-mvf-arena-controls-and-static-ABI-not-browser-acceptance", "actual-native-packet-drain-controls-and-static-ABI-not-browser-acceptance"],
    ["actualMvfArena: build.manifest.mvfArena,", "actualPacketDrain: build.manifest.packetDrain, actualMvfArena: build.manifest.mvfArena,"],
  ]);
  assert.ok(recipe.generated.includes("expectedFiles.length <= 128"));
  assert.ok(recipe.generated.includes("raw.length <= 2097152"));
  return recipe;
}

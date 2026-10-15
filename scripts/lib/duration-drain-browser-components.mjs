import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makePacketDrainBrowserComponents } from "./packet-drain-browser-components.mjs";
export const DURATION_DECODER_SHA256 = "e15ab14e6f6961c99591e2e84635d0d90f000aa5042cd134fd9812142ade4f7e";
export const DURATION_TOOL_DIRECTORY = "work/mpeg2-duration-drain-38678806473";
export function makeDurationDrainBrowserComponents(source, root, native, parentNative) {
  assert.equal(native.decoder.sha256, DURATION_DECODER_SHA256); assert.equal(native.sourceCount, 126);
  assert.equal(native.allSourcesMatchedExecutedGitHead, true);
  const parent = makePacketDrainBrowserComponents(source, root, parentNative).generated;
  const checks = `  assert.deepEqual(proof.actualDurationBoundary, build.manifest.packetDurationBoundary);
  const boundary = build.manifest.packetDurationBoundary;
  assert.equal(boundary.durationBoundaryCorrection, true);
  assert.equal(boundary.actualWasmUnit.iterations, 126000);
  assert.equal(boundary.actualWasmUnit.invalidCases, 15);
  assert.deepEqual(boundary.actualWasmUnit.lastTwoDurations, [666,667]);
  assert.equal(boundary.actualWasmUnit.regressionTotalTicks, 64000);
  for (const field of ["ptsDtsRewritten", "encoderPacketWireChanged", "codecSettingsChanged", "heapLimitsChanged", "liveReferencesChanged",
    "browserFidelityVerified", "fullOriginalCompleted", "memoryAcceptance", "speedGainProven", "publicAcceptance"])
    assert.equal(boundary[field], false);
`;
  return exactPatch(parent, [
    ["b65cc5991e9a74486066a9b442b1c0036d04f7e5a925bcb951971e0f060df152", DURATION_DECODER_SHA256],
    ["work/mpeg2-packet-drain-38673138419", DURATION_TOOL_DIRECTORY],
    ["evidence/packet-drain-native-38673138419.json", "evidence/duration-drain-native-38678806473.json"],
    ["evidence/mpeg2-packet-drain-build-38673138419.json", "evidence/mpeg2-duration-drain-build-38678806473.json"],
    ["evidence/mpeg2-packet-drain-build-branch-2026-10-15.json", "evidence/mpeg2-duration-drain-build-branch-2026-10-15.json"],
    ["proof.sourceCount, 116", "proof.sourceCount, 126"], ["sourceCount: 116", "sourceCount: 126"],
    [String.raw`|tests\/mpeg2-`, String.raw`|scripts\/(?:prepare|collect)-duration-drain-build(?:-branch)?\.mjs|tests\/mpeg2-`],
    ["realloc-attempt|ebml-reuse|mvf-arena|packet-interleave|packet-drain", "realloc-attempt|ebml-reuse|mvf-arena|packet-interleave|packet-drain|duration-drain"],
    [`assert.deepEqual(proof.layout, ${JSON.stringify(parentNative.layout)});`, `assert.deepEqual(proof.layout, ${JSON.stringify(native.layout)});`],
    ["build.manifest.packetDrain.onlyQueueDrainAdded, true", "build.manifest.packetDrain.onlyQueueDrainAdded, false"],
    ["  assert.deepEqual(proof.actualPacketDrain, build.manifest.packetDrain);", checks + "  assert.deepEqual(proof.actualPacketDrain, build.manifest.packetDrain);"],
  ]);
}
export async function loadDurationDrainBrowserComponents(root) {
  const read = file => readFile(path.join(root, file));
  const native = JSON.parse(await read("evidence/duration-drain-native-38678806473.json"));
  const parent = JSON.parse(await read("evidence/packet-drain-native-38673138419.json"));
  const recipe = makeDurationDrainBrowserComponents((await read("scripts/lib/ebml-reuse-browser-components.mjs")).toString(), root, native, parent);
  const components = await import("data:text/javascript;base64," + Buffer.from(recipe.generated).toString("base64"));
  return { ...components, recipe };
}

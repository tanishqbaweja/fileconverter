// Current candidate ABI is derived from its actual compiled binary, not assumed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { makeMvfBrowserComponents } from "./mvf-arena-browser-components.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export const DRAIN_DECODER_SHA256 = "b65cc5991e9a74486066a9b442b1c0036d04f7e5a925bcb951971e0f060df152";
export const DRAIN_TOOL_DIRECTORY = "work/mpeg2-packet-drain-38673138419";
export function makePacketDrainBrowserComponents(source, root, native) {
  assert.equal(native.decoder.sha256, DRAIN_DECODER_SHA256); assert.equal(native.sourceCount, 116);
  assert.equal(native.allSourcesMatchedExecutedGitHead, true);
  const parent = makeMvfBrowserComponents(source, root).generated;
  const layout = parent.match(/assert\.deepEqual\(proof\.layout, \{ _gm_:[\s\S]*? \}\);/g);
  assert.equal(layout.length, 1);
  const additions = `  assert.deepEqual(proof.actualPacketDrain, build.manifest.packetDrain);
  assert.equal(build.manifest.packetDrain.onlyQueueDrainAdded, true);
  assert.equal(build.manifest.packetDrain.containerPacketOrderMayChange, true);
  for (const field of ["liveReferencesChanged", "codecSettingsChanged", "heapLimitsChanged", "browserFidelityVerified",
    "fullOriginalCompleted", "memoryAcceptance", "speedGainProven", "publicAcceptance"])
    assert.equal(build.manifest.packetDrain[field], false);
`;
  return exactPatch(parent, [
    ["2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576", DRAIN_DECODER_SHA256],
    ["work/mpeg2-mvf-arena-38643550000", DRAIN_TOOL_DIRECTORY],
    ["evidence/mvf-arena-native-38643550000.json", "evidence/packet-drain-native-38673138419.json"],
    ["evidence/mpeg2-mvf-arena-build-38643550000.json", "evidence/mpeg2-packet-drain-build-38673138419.json"],
    ["evidence/mpeg2-mvf-arena-build-branch-2026-10-15-smoke-warnings.json", "evidence/mpeg2-packet-drain-build-branch-2026-10-15.json"],
    ["proof.sourceCount, 99", "proof.sourceCount, 116"], ["sourceCount: 99", "sourceCount: 116"],
    [String.raw`|tests\/mpeg2-`, String.raw`|scripts\/(?:prepare|collect)-packet-(?:interleave|drain)-build(?:-branch)?\.mjs|tests\/mpeg2-`],
    ["realloc-attempt|ebml-reuse|mvf-arena", "realloc-attempt|ebml-reuse|mvf-arena|packet-interleave|packet-drain"],
    [layout[0], `assert.deepEqual(proof.layout, ${JSON.stringify(native.layout)});`],
    ["  assert.deepEqual(proof.actualMvfArena, build.manifest.mvfArena);", additions + "  assert.deepEqual(proof.actualMvfArena, build.manifest.mvfArena);"],
  ]);
}
export async function loadPacketDrainBrowserComponents(root) {
  const native = JSON.parse(await readFile(path.join(root, "evidence/packet-drain-native-38673138419.json")));
  const recipe = makePacketDrainBrowserComponents(await readFile(path.join(root, "scripts/lib/ebml-reuse-browser-components.mjs"), "utf8"), root, native);
  const components = await import("data:text/javascript;base64," + Buffer.from(recipe.generated).toString("base64"));
  return { ...components, recipe };
}

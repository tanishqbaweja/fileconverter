import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { verifyPacketDrainCache } from "../scripts/lib/packet-drain-media-manifest.mjs";
import { makePacketDrainMediaComponents, loadPacketDrainMediaComponents } from "../scripts/lib/packet-drain-media-recipe.mjs";
import { makePacketDrainMediaCaller } from "../scripts/lib/packet-drain-media-caller-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function syntax(source) {
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
}
test("real native cache delta is exactly one queue insertion and pipeline routing, with other cache fields unchanged", async () => {
  const parent = JSON.parse(await read("evidence/mpeg2-mvf-arena-build-38643550000.json")).manifest.packetCache;
  const current = JSON.parse(await read("evidence/mpeg2-packet-drain-build-38673138419.json")).manifest.packetCache;
  const expected = structuredClone(parent);
  for (const key of ["generatedOuterBuilder", "generatedHevcWrapper"]) {
    expected[key] = expected[key].replaceAll("mpeg2-mvf-arena-builder-recipe.mjs", "mpeg2-packet-drain-builder-recipe.mjs");
    const { sha } = await import("../scripts/lib/stable-ui-headless-baseline-recipe.mjs"); expected[key + "Sha256"] = sha(expected[key]);
  }
  const source = await read("media/ffmpeg/mpeg2-candidate.c");
  assert.deepEqual(verifyPacketDrainCache(expected, current, source), current);
  assert.throws(() => verifyPacketDrainCache(expected, { ...current, maximumIdleLeases: 2 }, source));
  assert.throws(() => verifyPacketDrainCache(expected, { ...current, generatedMuxBridge: current.generatedMuxBridge + "\n" }, source));
});
test("new media factories preserve baseline/control/quality/memory/source gates and are parseable", async () => {
  const media = makePacketDrainMediaComponents(await read("scripts/lib/ebml-reuse-media-recipe.mjs"), root);
  const caller = makePacketDrainMediaCaller(await read("scripts/qualify-ebml-reuse-media.mjs"), root);
  syntax(media.generated); syntax(caller.generated);
  for (const token of ["REALLOC_MEDIA_INSPECTOR_SOURCE", "verifyPacketDrainCache", "aggregateWasmMemoryBytes,50331648", "maximumLeases,1",
    "manifest.packetDrain=", "manifest.packetInterleaveOwnership=", "WITHIN_PACKET_DRAIN_CONTROL_RECEIPT"])
    assert.ok(media.generated.includes(token), token);
  for (const token of ["legacyFiles.length,255", "supplemental.length<=128", "raw.length<=2097152", "scripts/qualify-mvf-arena-media.mjs",
    "scripts/qualify-packet-drain-media.mjs", "executedQualifierSource", "nativeEnvelopePost"])
    assert.ok(caller.generated.includes(token), token);
});
test("current116-source decoder/control and old production media baseline compose without changing validator code", async () => {
  const previous = process.env.WITHIN_PACKET_DRAIN_CONTROL_RECEIPT;
  process.env.WITHIN_PACKET_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T03-05-18-782Z-packet-drain-browser-control-executed-sources.json";
  try {
    const components = await loadPacketDrainMediaComponents(root), parts = await components.ebmlMediaParts(root);
    const manifest = components.expectedEbmlManifest(parts);
    assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], "b65cc5991e9a74486066a9b442b1c0036d04f7e5a925bcb951971e0f060df152");
    assert.equal(manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
    assert.equal(manifest.packetDrain.onlyQueueDrainAdded, true); assert.equal(manifest.aggregateWasmMemoryBytes, 50331648);
    assert.equal(parts.native.envelope.sourceCount, 116);
    assert.equal(parts.inspectorRecipe.edits.length, 1);
  } finally {
    if (previous === undefined) delete process.env.WITHIN_PACKET_DRAIN_CONTROL_RECEIPT;
    else process.env.WITHIN_PACKET_DRAIN_CONTROL_RECEIPT = previous;
  }
});

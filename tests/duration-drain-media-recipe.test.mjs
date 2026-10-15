import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { verifyDurationDrainCache } from "../scripts/lib/duration-drain-media-manifest.mjs";
import { makeDurationDrainMediaComponents, loadDurationDrainMediaComponents } from "../scripts/lib/duration-drain-media-recipe.mjs";
import { makeDurationDrainMediaCaller } from "../scripts/lib/duration-drain-media-caller-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
test("actual corrected cache is exactly two pipeline routes plus proven duration/queue kernel, not a metadata relabel", async () => {
  const original = JSON.parse(await read("evidence/mpeg2-mvf-arena-build-38643550000.json")).manifest.packetCache;
  const current = JSON.parse(await read("evidence/mpeg2-duration-drain-build-38678806473.json")).manifest.packetCache;
  const parent = structuredClone(original);
  for (const key of ["generatedOuterBuilder", "generatedHevcWrapper"]) {
    parent[key] = parent[key].replaceAll("mpeg2-mvf-arena-builder-recipe.mjs", "mpeg2-duration-drain-builder-recipe.mjs");
    parent[key + "Sha256"] = sha(parent[key]);
  }
  const source = await read("media/ffmpeg/mpeg2-candidate.c");
  assert.deepEqual(verifyDurationDrainCache(parent, current, source), current);
  assert.throws(() => verifyDurationDrainCache(parent, { ...current, maximumIdleLeases: 2 }, source));
  assert.throws(() => verifyDurationDrainCache(parent, { ...current, generatedMuxBridge: current.generatedMuxBridge + "\n" }, source));
});
test("corrected media factories preserve original validators, all cases, fixed heaps and extra packet proof", async () => {
  const media = makeDurationDrainMediaComponents(await read("scripts/lib/ebml-reuse-media-recipe.mjs"), root);
  const caller = makeDurationDrainMediaCaller(await read("scripts/qualify-ebml-reuse-media.mjs"), root);
  for (const source of [media.generated, caller.generated]) {
    const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(checked.status, 0, checked.stderr);
  }
  for (const token of ["spec:withPacketOrderProbe(old.spec)", "REALLOC_MEDIA_INSPECTOR_SOURCE", "aggregateWasmMemoryBytes,50331648",
    "manifest.packetDurationBoundary=", "WITHIN_DURATION_DRAIN_CONTROL_RECEIPT"])
    assert.ok(media.generated.includes(token), token);
  for (const token of ["legacyFiles.length,255", "supplemental.length<=128", "raw.length<=2097152", "scripts/qualify-packet-drain-media.mjs", "executedQualifierSource"])
    assert.ok(caller.generated.includes(token), token);
});
test("current126-source native/control composes with unchanged plane encoder and original quality inspector", async () => {
  const previous = process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT;
  process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
  try {
    const components = await loadDurationDrainMediaComponents(root), parts = await components.ebmlMediaParts(root);
    const manifest = components.expectedEbmlManifest(parts);
    assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], "e15ab14e6f6961c99591e2e84635d0d90f000aa5042cd134fd9812142ade4f7e");
    assert.equal(manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
    assert.equal(manifest.packetDurationBoundary.durationBoundaryCorrection, true);
    assert.equal(manifest.packetDrain.onlyQueueDrainAdded, false); assert.equal(parts.native.envelope.sourceCount, 126);
    assert.equal(parts.inspectorRecipe.edits.length, 1);
  } finally {
    if (previous === undefined) delete process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT;
    else process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = previous;
  }
});

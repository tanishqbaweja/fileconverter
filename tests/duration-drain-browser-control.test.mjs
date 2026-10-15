import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { makeDurationDrainBrowserComponents, loadDurationDrainBrowserComponents, DURATION_DECODER_SHA256 } from "../scripts/lib/duration-drain-browser-components.mjs";
import { makeDurationDrainBrowserControl } from "../scripts/lib/duration-drain-control-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
test("duration candidate validates actual126 source pins, rational unit and actual ABI without borrowing parent addresses", async () => {
  const native = JSON.parse(await read("evidence/duration-drain-native-38678806473.json"));
  const parent = JSON.parse(await read("evidence/packet-drain-native-38673138419.json"));
  const source = await read("scripts/lib/ebml-reuse-browser-components.mjs");
  const recipe = makeDurationDrainBrowserComponents(source, root, native, parent);
  assert.ok(recipe.generated.includes("proof.sourceCount, 126")); assert.ok(recipe.generated.includes(JSON.stringify(native.layout)));
  assert.throws(() => makeDurationDrainBrowserComponents(source, root, { ...native, sourceCount: 116 }, parent));
  const components = await loadDurationDrainBrowserComponents(root), actual = await components.verifyEbmlNative(root);
  assert.equal(actual.proof.decoder.sha256, DURATION_DECODER_SHA256); assert.equal(actual.envelope.sourceCount, 126);
  const observers = await components.makeEbmlObservers(root, actual);
  assert.equal(observers.oldMappingsUsed, false); assert.equal(Object.keys(observers.files).length, 4);
  assert.ok(observers.files["realloc-allocation-abort-capture.mjs"].includes("REALLOC_POOL_SLOT = " + native.layout.within_refstruct_abort_words.address));
});
test("headless caller preserves export-only native code, callback/source bounds and every parent caller source", async () => {
  const recipe = makeDurationDrainBrowserControl(await read("scripts/check-ebml-reuse-browser-control.mjs"), root);
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
  for (const token of ["actualFiles: 126", "files.length <= 128", "raw.length <= 2097152", "nativeEnvelopePost", "allCodeDataTypesImportsTablesMemoryExact",
    "scripts/lib/duration-drain-browser-components.mjs", "scripts/check-packet-drain-browser-control.mjs"])
    assert.ok(recipe.generated.includes(token), token);
});

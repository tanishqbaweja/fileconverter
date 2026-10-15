import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { makePacketDrainBrowserComponents, loadPacketDrainBrowserComponents, DRAIN_DECODER_SHA256 } from "../scripts/lib/packet-drain-browser-components.mjs";
import { makePacketDrainBrowserControl } from "../scripts/lib/packet-drain-control-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
test("candidate native bindings validate actual116 source preimages and new binary with existing observer guards", async () => {
  const native = JSON.parse(await read("evidence/packet-drain-native-38673138419.json"));
  const source = await read("scripts/lib/ebml-reuse-browser-components.mjs");
  const recipe = makePacketDrainBrowserComponents(source, root, native);
  assert.ok(recipe.generated.includes("proof.sourceCount, 116"));
  assert.ok(recipe.generated.includes(JSON.stringify(native.layout)));
  assert.throws(() => makePacketDrainBrowserComponents(source, root, { ...native, sourceCount: 99 }));
  const components = await loadPacketDrainBrowserComponents(root), actual = await components.verifyEbmlNative(root);
  assert.equal(actual.proof.decoder.sha256, DRAIN_DECODER_SHA256);
  assert.equal(actual.envelope.sourceCount, 116);
  const observers = await components.makeEbmlObservers(root, actual);
  assert.equal(observers.oldMappingsUsed, false); assert.equal(Object.keys(observers.files).length, 4);
  assert.ok(observers.files["realloc-allocation-abort-capture.mjs"].includes("REALLOC_POOL_SLOT = " + native.layout.within_refstruct_abort_words.address));
});
test("headless control preserves callback/scalar/source limits and adds every new caller source", async () => {
  const recipe = makePacketDrainBrowserControl(await read("scripts/check-ebml-reuse-browser-control.mjs"), root);
  const parsed = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(parsed.status, 0, parsed.stderr);
  for (const token of ["actualFiles: 116", "files.length <= 128", "raw.length <= 2097152", "nativeEnvelopePost",
    "syntheticExportOnlyBinaryRemovedWithCallerScratch", "allCodeDataTypesImportsTablesMemoryExact", "actualPoolSlotAddress",
    "scripts/lib/packet-drain-browser-components.mjs", "scripts/check-packet-drain-browser-control.mjs"])
    assert.ok(recipe.generated.includes(token), token);
});

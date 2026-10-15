import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { makeDurationFullComponents, loadQualifiedEbmlMedia, makeEbmlFullCaller, makeEbmlFullDriver } from "../scripts/lib/duration-drain-full-recipe.mjs";
import { captureLayeredFullSourcePins, DURATION_PREVIOUS_FULL } from "../scripts/lib/duration-drain-full-sources.mjs";
import { validateCompositeAllocationFailureRecord } from "../scripts/lib/duration-drain-full-failure.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeMvfFullComponents } from "../scripts/lib/mvf-arena-full-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
test("full candidate binds actual338-source packet-exact media, fixed heaps and plane encoder", async () => {
  const source = await read("scripts/lib/ebml-reuse-full-recipe.mjs"), recipe = makeDurationFullComponents(source, root); syntax(recipe.generated);
  let restored = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, makeMvfFullComponents(source, root).generated);
  const qualified = await loadQualifiedEbmlMedia(root);
  assert.equal(qualified.reference.sourceCount, 338); assert.equal(qualified.parts.native.envelope.sourceCount, 126);
  assert.equal(qualified.reference.exactPacketPayloadTimingAndMetadataEquivalent, true);
  assert.equal(qualified.report.manifest.artifacts["within-mpeg2-split.wasm"], "e15ab14e6f6961c99591e2e84635d0d90f000aa5042cd134fd9812142ade4f7e");
  assert.equal(qualified.report.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
});
test("full captured-word validator accepts genuine current control and rejects identity/address/schema mutations", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control.json"));
  const row = proof.result.terminal.emitted; assert.equal(validateCompositeAllocationFailureRecord(row), row);
  for (const mutate of [value => { value.actualReallocSlotAddress -= 64; }, value => { value.actualPoolSlotAddress -= 64; },
    value => { value.reallocAttempt.words[1] = 2; }, value => { value.noPayloadRead = false; }, value => { value.qualifiedBinarySha256 = "0".repeat(64); }]) {
    const changed = structuredClone(row); mutate(changed); assert.throws(() => validateCompositeAllocationFailureRecord(changed));
  }
});
test("new bounded source layer retains all588 parent paths; full driver keeps original acceptance", async () => {
  const caller = await makeEbmlFullCaller(root); syntax(caller.generated);
  const snapshot = await captureLayeredFullSourcePins(root, caller.extraFiles);
  const previous = JSON.parse(await read(DURATION_PREVIOUS_FULL));
  for (const [file, hash] of Object.entries(previous.sourcePins)) assert.equal(snapshot.pins[file], hash, file);
  assert.ok(snapshot.files.length > 588); assert.ok(snapshot.extensionFiles.length <= 128);
  assert.equal(snapshot.limits.externalFiles, 16); assert.equal(snapshot.limits.extensionRestoredBytes, 2097152);
  const runtime = await createOwnedRuntimeScratch("allocation-attempt-full-wrapper-");
  try {
    const driver = await makeEbmlFullDriver(root, runtime.directory, "allocation-attempt-media-DURATIONUNIT", snapshot.files); syntax(driver.generated);
    assert.equal(driver.codecIoQualityMemoryRepeatAndCleanupGatesChanged, false);
    for (const token of ["scripts/stage-duration-drain-full.mjs", "duration-drain-full-failure.mjs", "-private-mpeg2-duration-drain-full-native-100ms", "durationExtensionSourceFiles"])
      assert.ok(driver.generated.includes(token), token);
    assert.equal(driver.generated.includes("withPacketOrderProbe"), false, "Full validation must remain streaming, not collect original packets");
    assert.equal(driver.manifest.aggregateWasmMemoryBytes, 50331648);
  } finally { await runtime.close(); }
});

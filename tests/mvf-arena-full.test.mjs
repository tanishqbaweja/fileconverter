import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { makeMvfFullComponents, loadQualifiedEbmlMedia, makeEbmlFullCaller, makeEbmlFullDriver } from "../scripts/lib/mvf-arena-full-recipe.mjs";
import { captureLayeredFullSourcePins } from "../scripts/lib/mvf-arena-full-sources.mjs";
import { validateCompositeAllocationFailureRecord } from "../scripts/lib/mvf-arena-full-failure.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
process.env.WITHIN_MVF_ARENA_CONTROL_RECEIPT = "evidence/2026-10-14T22-17-16-644Z-mvf-arena-browser-control-executed-sources.json";
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
test("full candidate binds independently qualified297-source media without changing original acceptance", async () => {
  const source = await read("scripts/lib/ebml-reuse-full-recipe.mjs"), recipe = makeMvfFullComponents(source, root);
  syntax(recipe.generated); let restored = recipe.generated;
  for (const [before, after] of recipe.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, source);
  const qualified = await loadQualifiedEbmlMedia(root);
  assert.equal(qualified.reference.sourceCount, 297); assert.equal(qualified.parts.native.envelope.sourceCount, 99);
  assert.equal(qualified.report.manifest.artifacts["within-mpeg2-split.wasm"], "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576");
  assert.equal(qualified.report.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
});
test("full current-ABI validator accepts actual captured synthetic fatal and rejects address/word mutations", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-14T22-17-16-644Z-mvf-arena-browser-control.json"));
  const row = proof.result.terminal.emitted; assert.equal(validateCompositeAllocationFailureRecord(row), row);
  for (const mutate of [value => { value.actualReallocSlotAddress = 1918912; }, value => { value.actualPoolSlotAddress = 1918976; },
    value => { value.reallocAttempt.words[1] = 2; }, value => { value.noPayloadRead = false; }]) {
    const changed = structuredClone(row); mutate(changed); assert.throws(() => validateCompositeAllocationFailureRecord(changed));
  }
});
test("full source snapshot retains every546 prior path and original caps, driver has unchanged quality/repeat/memory gates", async () => {
  const caller = await makeEbmlFullCaller(root); syntax(caller.generated);
  const snapshot = await captureLayeredFullSourcePins(root, caller.extraFiles);
  const previous = JSON.parse(await read("evidence/2026-10-14T19-03-00-388Z-ebml-reuse-original-full-terminal.json"));
  for (const [file, hash] of Object.entries(previous.sourcePins)) assert.equal(snapshot.pins[file], hash, file);
  assert.ok(snapshot.files.length > 546); assert.ok(snapshot.extensionFiles.length <= 128);
  assert.equal(snapshot.limits.externalFiles, 16); assert.equal(snapshot.limits.extensionRestoredBytes, 2097152);
  const runtime = await createOwnedRuntimeScratch("allocation-attempt-full-wrapper-");
  try {
    const driver = await makeEbmlFullDriver(root, runtime.directory, "allocation-attempt-media-MVFUNIT", snapshot.files); syntax(driver.generated);
    assert.equal(driver.codecIoQualityMemoryRepeatAndCleanupGatesChanged, false);
    for (const token of ["scripts/stage-mvf-arena-full.mjs", "mvf-arena-full-failure.mjs", "-private-mpeg2-mvf-arena-full-native-100ms", "extensionSourceFiles"])
      assert.ok(driver.generated.includes(token), token);
    assert.equal(driver.manifest.aggregateWasmMemoryBytes, 50331648);
  } finally { await runtime.close(); }
});

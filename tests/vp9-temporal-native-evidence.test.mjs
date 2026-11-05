import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { VP9_TEMPORAL_LIFETIME_PINS } from "../media/ffmpeg/vp9-temporal-lifetime.mjs";
const json = async file => JSON.parse(await readFile(new URL("../evidence/" + file, import.meta.url)));
const native = await json("2026-11-06-vp9-original-width-native-42129383089.json"), contract = native.nativeContract;
test("actual guarded native build succeeded with exact source head and all owned cleanup steps", async () => {
  const failed = await json("2026-11-06-vp9-original-width-build-42128952234-terminal.json"), terminal = await json("2026-11-06-vp9-original-width-build-42129383089-terminal.json");
  assert.equal(failed.conclusion, "failure"); assert.equal(failed.cleanupStepsPassed, true);
  assert.equal(failed.job.steps.find(row => row.name.startsWith("Compile private")).conclusion, "skipped");
  assert.equal(terminal.conclusion, "success"); assert.equal(terminal.cleanupStepsPassed, true);
  assert.equal(terminal.head, "5e9f2d6b1fd391474ab82084bb75ae71cf13660d"); assert.equal(native.head, terminal.head);
  assert.equal(native.artifact.id, 13462422854);
  assert.equal(native.artifact.sha256, "67a30c55d3286f68d7e779cf0a842e519b9121aa14671a3aaef8994fb41c122f");
});
test("guarded tool changes only one vendor allocation guard, retains three wrapper fixes and exact existing memory limits", () => {
  assert.equal(contract.engine, "private-vp9-realtime-temporal");
  assert.equal(contract.candidate.wrapperEdits, 3);
  assert.equal(contract.candidate.compiledWrapperSha256, "480532d89a4b4f696fced0faaa7be4f29cdbe7a71b990c69dfd2ddef6d346aa6");
  const guard = contract.candidate.vendorAllocationGuard;
  assert.equal(guard.edits, 1); assert.equal(guard.parentSha256, VP9_TEMPORAL_LIFETIME_PINS["vp9/encoder/vp9_encoder.c"]);
  assert.equal(guard.compiledSourceSha256, "9c831c453796fcd08598da8b8e27a494fde8d681e87349facd590c48949e9693");
  assert.deepEqual(guard.lifetimeSourcePins, VP9_TEMPORAL_LIFETIME_PINS); assert.equal(guard.cUnitCalls, 198);
  assert.equal(guard.exactAllocationBytesSaved, null); assert.equal(guard.codecSettingsChanged, false);
  assert.deepEqual(contract.candidate.wasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 1536, shared: true }]);
  assert.equal(contract.candidate.memoryLimitsRaised, false); assert.equal(contract.modules.length, 1);
  assert.equal(contract.modules[0].videoCodecThreads, 1); assert.equal(contract.modules[0].wasmPthreadPoolSize, 0);
});
test("authenticated artifact retains19 static members and source preimages, never a media conversion or public promotion", () => {
  assert.equal(Object.keys(contract.artifacts).length, 18);
  for (const name of ["vp9_encoder.temporal.base.c", "vp9_encoder.temporal.guard.c", "vp9-temporal-filter-source-proof.json"])
    assert.ok(contract.artifacts[name].bytes > 0);
  assert.equal(contract.artifacts["within-remux.wasm"].bytes, 9873924);
  assert.equal(contract.artifacts["within-remux.wasm"].sha256, "e10e098ba63b3922b4d2655b7c5952e221c99cf45800e1453cce69a0f2a0d378");
  assert.equal(native.retainedBytes, 10925714); assert.equal(native.retainedDirectory, "work/vp9-duration-input-42129383089");
  for (const key of ["originalRead", "mediaRead", "publicAssetReplacement", "nodeInstantiated", "browserValidated", "speedGainProven", "publicAcceptance"]) assert.equal(native[key], false);
});

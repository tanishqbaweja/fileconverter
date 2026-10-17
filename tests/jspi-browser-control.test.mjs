import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import test from "node:test";
import { loadJspiBrowserAdapter, deriveJspiBrowserStager } from "../scripts/lib/jspi-browser-adapter.mjs";
import { makeJspiBrowserComposition } from "../scripts/lib/jspi-browser-native.mjs";
import { deriveJspiBrowserDriver, deriveJspiBrowserCaller, validateJspiLifecycle } from "../scripts/lib/jspi-browser-control.mjs";
import { deriveJournaledJspiControl } from "../scripts/lib/jspi-validated-control-journal.mjs";
import { deriveWarmCacheModule } from "../scripts/lib/warm-cache-qualification.mjs";
const root = process.cwd();
test("JSPI adapter rebinds actual typed functions while retaining quality, I/O, closure and ABI guards", async () => {
  const loaded = await loadJspiBrowserAdapter(root), recipe = loaded.recipe;
  assert.doesNotMatch(recipe.generated, /withinAsyncifyStorageClose|WITHIN_ASYNCIFY_STORAGE_FINAL/);
  for (const token of ["WebAssembly.Suspending", "One active JSPI entry only", 'mode:"jspi"', "engineManagedStackMemoryBytes:null",
    "mapped[9] = 4000000", "Actual native settings differ", "session.close()", "originalBridge.read(offset, destination)",
    "noPayloadRead: true", "maximumScalarWords: 32", "33554432", "16777216", "Native media AVIO write exceeds unchanged256KiB cap"])
    assert.ok(recipe.generated.includes(token), token);
  assert.equal(recipe.exactNativeIndices.length, 5); assert.equal(recipe.codecSettingsChanged, false);
  await transform(recipe.generated, { loader: "js", format: "esm" });
  const stage = await deriveJspiBrowserStager(loaded.stage, loaded.archive.recipe.generated.candidateName, "allocation-attempt-media-testJSPI");
  assert.ok(stage.generated.includes("verifyJspiBrowserCandidate as verifyEbmlMediaCandidate"));
  assert.ok(stage.generated.includes('flag: "wx"')); assert.ok(stage.generated.includes('process.argv[2] === "restore"'));
  await transform(stage.generated, { loader: "js", format: "esm" });
});
test("exact plane encoder is preserved; default encoder from decoder build must not replace it", async () => {
  process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
  const composition = await makeJspiBrowserComposition(root);
  assert.equal(composition.files["split-encoder.wasm"].sha256, "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.deepEqual(composition.files["split-encoder.wasm"], composition.previous.files["split-encoder.wasm"]);
  assert.equal(composition.manifest.asyncifyStorage, undefined); assert.equal(composition.manifest.jspi.engineManagedStackMemoryBytes, null);
  assert.equal(composition.manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(composition.manifest.allowMemoryGrowth, false);
});
test("actual generated driver/caller preserve six outputs, adverse controls, lower blank and full-tree guard", async () => {
  const archive = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const driver = await deriveJspiBrowserDriver(archive.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testJSPI"), "allocation-attempt-media-testJSPI", []);
  for (const token of ["minimumMs: 300000", "successfulFixtureValidations,6", 'row.event==="reused").length,16', "<=250",
    "jspiLifecycleFinalSamples", "verifyJspiBrowserCandidate as verifyAttemptPlaneCandidate", "prepareJspiBrowserControl as prepareCompletedSaveControl"])
    assert.ok(driver.generated.includes(token), token);
  assert.doesNotMatch(driver.generated, /assert.ok\(progressProbe.handoffWorkerEvents.length<32\)/);
  assert.match(driver.generated, /workerEventRecorder.summary\(\).firstError,null/);
  const caller = await deriveJspiBrowserCaller(await readFile("scripts/run-updated-chrome-full.mjs", "utf8"), root);
  for (const token of ['${stamp}-jspi-control-live.json', "await verifyStoppedTree()", "copyJspiBrowserCandidate", "await deriveUpdatedChromeFullStager", "assert.equal(row.runs.length,0)"])
    assert.ok(caller.generated.includes(token), token);
  for (const source of [driver.generated, caller.generated]) await transform(source, { loader: "js", format: "esm" });
});
test("durable control hook reverses exactly without editing validators or adverse bodies", async () => {
  const archive = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-16T16-41-46-137Z-updated-chrome-media-sources.json.gz")));
  const parent = deriveWarmCacheModule(archive.recipe.generated.spec, root), recipe = deriveJournaledJspiControl(archive.recipe.generated.spec, root);
  let restored = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, parent.generated); assert.equal(recipe.validatorSha256, parent.validatorSha256);
  assert.deepEqual(recipe.adverseEdits, parent.adverseEdits); assert.equal(recipe.validatorsChanged, false);
  assert.equal(recipe.checkpointsAfterOriginalValidatorAndOutputCleanup, true);
  await transform(recipe.generated, { loader: "ts", format: "esm" });
});
test("JSPI runtime metrics must not invent VM-stack bytes or allow more active entries", () => {
  const valid = { mode: "jspi", calls: 1, activeCalls: 0, maximumActiveCalls: 1, failedCalls: 0,
    asyncifyLinearStackBytes: 0, engineManagedStackMemoryBytes: null, engineManagedStackIncludedInProcessTreeMeasurement: true };
  validateJspiLifecycle(valid);
  for (const change of [{ maximumActiveCalls: 2 }, { activeCalls: 1 }, { engineManagedStackMemoryBytes: 0 }, { engineManagedStackIncludedInProcessTreeMeasurement: false }])
    assert.throws(() => validateJspiLifecycle({ ...valid, ...change }));
});
test("actual offline fatal-record validator loads with the new identity and unchanged captured-word guards", async () => {
  const validator = await import("../scripts/lib/jspi-full-failure.mjs");
  assert.equal(typeof validator.validateCompositeAllocationFailureRecord, "function");
  assert.equal(validator.jspiFailureDerivation.capturedWordGuardsChanged, false);
  assert.deepEqual(validator.jspiFailureDerivation.currentNativeAddresses, {
    _gm_: { address: 1786904, bytes: 496 }, within_allocator_attempt_words: { address: 1918992, bytes: 64 },
    within_realloc_attempt_words: { address: 1919056, bytes: 64 }, within_refstruct_abort_words: { address: 1919120, bytes: 64 },
  });
});

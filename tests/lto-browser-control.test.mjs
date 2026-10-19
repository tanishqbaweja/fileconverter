import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { transform } from "esbuild";
import { loadLtoBrowserAdapter, deriveLtoBrowserStager } from "../scripts/lib/lto-browser-adapter.mjs";
import { loadLtoBrowserNative, makeLtoBrowserComposition } from "../scripts/lib/lto-browser-native.mjs";
import { deriveLtoBrowserDriver, deriveLtoBrowserCaller } from "../scripts/lib/lto-browser-control.mjs";
import { deriveJspiBrowserDriver } from "../scripts/lib/jspi-browser-control.mjs";
const root = process.cwd();
const reverse = recipe => recipe.edits.toReversed().reduce((text, [before, after]) => text.replace(after, before), recipe.generated);

test("LTO adapter changes only verified binary identity, five function maps and four native slots", async () => {
  const loaded = await loadLtoBrowserAdapter(root), recipe = loaded.recipe;
  const [before, after] = recipe.identityEdits;
  assert.equal(reverse(recipe).replaceAll(after, before), loaded.original);
  assert.equal(recipe.exactNativeIndices.length, 5);
  assert.equal(recipe.edits.length, 8);
  for (const address of [1786904, 1918992, 1919056, 1919120]) assert.ok(!recipe.generated.includes(String(address)));
  for (const address of [408936, 541024, 541088, 1913344]) assert.ok(recipe.generated.includes(String(address)));
  for (const key of ["codecSettingsChanged", "productionIoChanged", "capturedWordGuardsChanged", "actualRuntimeFatalRequalified", "publicAcceptance"])
    assert.equal(recipe[key], false);
  for (const token of ["WebAssembly.Suspending", "One active JSPI entry only", 'mode:"jspi"', "engineManagedStackMemoryBytes:null",
    "mapped[9] = 4000000", "Actual native settings differ", "session.close()", "originalBridge.read(offset, destination)",
    "noPayloadRead: true", "maximumScalarWords: 32", "33554432", "16777216", "Native media AVIO write exceeds unchanged256KiB cap"])
    assert.ok(recipe.generated.includes(token), token);
  assert.doesNotMatch(recipe.generated, /withinAsyncifyStorageClose|WITHIN_ASYNCIFY_STORAGE_FINAL/);
  await transform(recipe.generated, { loader: "js", format: "esm" });
  const stage = await deriveLtoBrowserStager(loaded.stage, loaded.archive.recipe.generated.candidateName, "allocation-attempt-media-testLTO");
  assert.ok(stage.generated.includes("verifyLtoBrowserCandidate as verifyEbmlMediaCandidate"));
  assert.ok(stage.generated.includes('flag: "wx"')); assert.ok(stage.generated.includes('process.argv[2] === "restore"'));
  assert.equal(JSON.parse(stage.generated.match(/^const adapter = ("[^\r\n]+");$/m)[1]), recipe.generated);
  await transform(stage.generated, { loader: "js", format: "esm" });
});

test("actual LTO glue binds native-provided guard addresses; composition retains the qualified plane encoder", async () => {
  process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
  const native = await loadLtoBrowserNative(root), composition = await makeLtoBrowserComposition(root);
  const glue = await readFile(path.join(root, native.directory, "within-mpeg2-split.mjs"), "utf8");
  for (const token of ['Module["withinAllocatorAttemptAddress"]=address', 'Module["withinReallocAttemptAddress"]=address',
    'Module["withinRefstructAbortSnapshotAddress"]=address']) assert.ok(glue.includes(token), token);
  assert.equal(composition.files["within-mpeg2-split.wasm"].sha256, native.proof.decoder.sha256);
  assert.equal(composition.files["split-encoder.wasm"].sha256, "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.deepEqual(composition.files["split-encoder.wasm"], composition.previous.files["split-encoder.wasm"]);
  assert.equal(composition.manifest.aggregateWasmMemoryBytes, 50331648);
  assert.equal(composition.manifest.allowMemoryGrowth, false);
  assert.equal(composition.manifest.jspi.engineManagedStackMemoryBytes, null);
  assert.deepEqual(composition.manifest.libraryLto, native.build.manifest.libraryLto);
});

test("exact driver delta leaves all six validators, three adverse controls and full-tree 250MiB guard unchanged", async () => {
  const archive = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const args = [archive.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testLTO"), "allocation-attempt-media-testLTO", []];
  const parent = await deriveJspiBrowserDriver(...args), recipe = await deriveLtoBrowserDriver(...args);
  assert.equal(reverse(recipe), parent.generated);
  for (const token of ["minimumMs: 300000", "successfulFixtureValidations,6", 'row.event==="reused").length,16', "<=250",
    "jspiLifecycleFinalSamples", "verifyLtoBrowserCandidate as verifyAttemptPlaneCandidate", "prepareJspiBrowserControl as prepareCompletedSaveControl",
    "workerEventRecorder.summary().firstError,null"])
    assert.ok(recipe.generated.includes(token), token);
  assert.equal(recipe.allContentAndAdverseValidationGatesUnchanged, true);
  assert.equal(recipe.publicAcceptance, false); assert.equal(recipe.fullOriginalAcceptance, false);
  assert.doesNotMatch(recipe.generated, /assert.ok\(progressProbe.handoffWorkerEvents.length<32\)/);
  const caller = await deriveLtoBrowserCaller(await readFile("scripts/run-updated-chrome-full.mjs", "utf8"), root);
  for (const token of ['${stamp}-lto-control-live.json', "await verifyStoppedTree()", "copyLtoBrowserCandidate", "await deriveUpdatedChromeFullStager",
    "assert.equal(row.runs.length,0)", "requestedSmallCompletedConversions:6", "tests/lto-browser-control.test.mjs"])
    assert.ok(caller.generated.includes(token), token);
  for (const source of [recipe.generated, caller.generated]) await transform(source, { loader: "js", format: "esm" });
});

test("offline fatal-record validator retains captured-word guards but uses the actual LTO identity/layout", async () => {
  const validator = await import("../scripts/lib/lto-full-failure.mjs");
  assert.equal(typeof validator.validateCompositeAllocationFailureRecord, "function");
  assert.equal(validator.ltoFailureDerivation.capturedWordGuardsChanged, false);
  assert.equal(validator.ltoFailureDerivation.actualRuntimeFatalRequalified, false);
  assert.deepEqual(validator.ltoFailureDerivation.currentNativeAddresses, {
    _gm_: { address: 408936, bytes: 496 }, within_allocator_attempt_words: { address: 541024, bytes: 64 },
    within_realloc_attempt_words: { address: 541088, bytes: 64 }, within_refstruct_abort_words: { address: 1913344, bytes: 64 },
  });
});

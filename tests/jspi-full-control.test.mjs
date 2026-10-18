import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { transform } from "esbuild";
import { deriveRecordedTimelineDriver } from "../scripts/lib/recorded-timeline-full-recipe.mjs";
import { deriveJspiFullDriver, deriveJspiFullCaller, deriveJspiFullSupervisor, deriveJspiFullLoop, extractOriginalFullLoop } from "../scripts/lib/jspi-full-control.mjs";
import { loadJspiFullQualification, assertJspiFullBuild } from "../scripts/lib/jspi-full-qualification.mjs";
import { createJspiFullJournal, estimateJspiRemaining } from "../scripts/lib/jspi-full-journal.mjs";
const root = process.cwd(), read = file => readFile(path.join(root, file), "utf8");
const archive = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
const terminal = JSON.parse(await read("evidence/2026-10-17T22-38-25-691Z-jspi-control-terminal.json"));
const args = [archive.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-fullJSPItest"), "allocation-attempt-media-fullJSPItest", [], terminal.browserPinBefore];

test("full loop keeps every original validator byte-exact outside explicit JSPI lifecycle and durable journal hooks", () => {
  const original = deriveRecordedTimelineDriver(...args.slice(0, 5)).generated;
  const recipe = deriveJspiFullLoop(original); let restored = recipe.generated;
  for (const [before, after] of recipe.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, extractOriginalFullLoop(original)); assert.equal(recipe.edits.length, 4);
  for (const token of ["number <= 3", "DOM.setFileInputFiles", "expectedSourceBytes", "progressProbe.maximumConversionMs", "run.incrementalPrivateMiB <= 250",
    "maximumTimestampErrorSeconds <= 0.001", "ssim >= 0.98", "assert.deepEqual(after.chapters, sourceProbe.chapters)",
    "await audioHashes(output)", '"-xerror"', "run.recovery = await stable", "fullRunJournal.validated", "validateJspiLifecycle"])
    assert.ok(recipe.generated.includes(token), token);
  assert.doesNotMatch(recipe.generated, /suspension.allocations|asyncifyStorage/);
});
test("full driver restores three full jobs, fixed original limits and cleanup without small fixtures or reload", async () => {
  const recipe = await deriveJspiFullDriver(...args);
  for (const token of ["minimumMs: 300000", '"maximumConversionMs":21600000', "requestedCompletedConversions:3", "requestedSmallCompletedConversions:0",
    "assert.equal(runs.length,3)", 'row.event==="reused").length,4', "workerEventRecorder.summary().firstError,null", "await fullRunJournal.progress",
    "await fullRunJournal.validated", "createJspiFullJournal", "jspiLifecycleFinalSamples", "fullQualification.reference"])
    assert.ok(recipe.generated.includes(token), token);
  assert.doesNotMatch(recipe.generated, /prepareCompletedSaveControl|completedSaveControl|conversion-completed-save-control|page.reload/);
  assert.equal(recipe.originalContentValidatorsChanged, false);
  await transform(recipe.generated, { loader: "js", format: "esm" });
});
test("caller and hidden persistent supervisor bind full qualification, assets, source envelope and three completions", async () => {
  const caller = await deriveJspiFullCaller(await read("scripts/run-updated-chrome-full.mjs"), root);
  const supervisor = deriveJspiFullSupervisor(await read("scripts/launch-packet-largest-idle-supervisor.mjs"), root);
  for (const token of ["loadJspiFullQualification(root)", "assertJspiFullBuild(build", "await verifyStoppedTree()", "jspi-full-live.json",
    "row.runs.length,3", "jspiFullValidatedRuns.length,3", "requestedCompletedConversions:3", "deriveJspiFullDriver"])
    assert.ok(caller.generated.includes(token), token);
  assert.ok(supervisor.generated.includes('own = "scripts/run-jspi-full.mjs"'));
  assert.ok(supervisor.generated.includes("jspi-full-supervisor")); assert.ok(supervisor.generated.includes("windowsHide: true"));
  assert.doesNotMatch(supervisor.generated, /scripts\/run-recorded-timeline-full.mjs/);
  for (const source of [caller.generated, supervisor.generated]) await transform(source, { loader: "js", format: "esm" });
});
test("actual six-output prerequisite is replayed against all832 current sources and exact candidate before full launch", async () => {
  process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
  const result = await loadJspiFullQualification(root);
  assert.equal(result.reference.currentSourcePinsVerified, 832); assert.equal(result.reference.priorSmallOutputs, 6);
  assert.equal(result.reference.fullOriginalAcceptance, false); assertJspiFullBuild(result.build, result.build);
  const changed = structuredClone(result.build); changed.assets[0].sha256 = "0".repeat(64);
  assert.throws(() => assertJspiFullBuild(changed, result.build));
});
test("ETA is explicitly approximate and unavailable for absent, zero or terminal progress", () => {
  assert.equal(estimateJspiRemaining({ inputBytes: 25, elapsedMs: 1000 }, 100), 3000);
  for (const metrics of [null, {}, { inputBytes: 0, elapsedMs: 1 }, { inputBytes: 100, elapsedMs: 1 }, { inputBytes: 1, elapsedMs: NaN }])
    assert.equal(estimateJspiRemaining(metrics, 100), null);
});
test("full-run checkpoint is immutable, bounded and rejects missing content/recovery; progress has no output copies", async () => {
  const directory = await mkdtemp(path.join(root, "work/jspi-full-journal-test-"));
  try {
    const reports = path.join(directory, "outputs/reports"); await mkdir(reports, { recursive: true });
    const journal = createJspiFullJournal(directory, path.join(reports, "test"), { priorSmallOutputs: 6 }, { file: "hash" });
    const run = { number: 1, state: { jobState: "complete" }, incrementalPrivateMiB: 249, recovery: { stable: true },
      independentValidation: { fullDecode: true, ssim: 0.99, frameCount: 296160, maximumTimestampErrorSeconds: 0.001 } };
    await assert.rejects(journal.validated({ ...run, recovery: {} }, {}, {}));
    assert.equal(journal.records.length, 0); await journal.validated(run, {}, {}); assert.equal(journal.records.length, 1);
    const checkpoint = JSON.parse(gunzipSync(await readFile(path.join(directory, journal.records[0].path))));
    assert.equal(checkpoint.originalValidationOutputDeletionAndRecoveryCompleted, true); assert.equal(checkpoint.threeRunSessionAcceptance, false);
    await assert.rejects(journal.validated(run, {}, {}));
    await journal.progress(2, { jobState: "running", metrics: { inputBytes: 1000, elapsedMs: 5000, outputBytes: 900 } }, 249);
    const progress = JSON.parse(await readFile(path.join(reports, "test-jspi-progress.json")));
    assert.equal(progress.independentlyValidatedRuns, 1); assert.equal(progress.outputBytes, 900);
    await assert.rejects(access(path.join(reports, "test-jspi-progress.json.next")), { code: "ENOENT" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

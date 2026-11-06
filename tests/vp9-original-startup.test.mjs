import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { makeVp9OriginalStartupSource } from "../scripts/lib/vp9-original-startup-recipe.mjs";
import { originalStartupStop, VP9_ORIGINAL_STARTUP, runVp9OriginalStartup } from "../scripts/lib/vp9-original-startup.mjs";
const root = path.resolve(import.meta.dirname, ".."), parent = JSON.parse(await readFile(new URL("../evidence/2026-11-05-webcodecs-vp9-stream-duration-fidelity-42020605269-recipe.json", import.meta.url)));
const source = gunzipSync(Buffer.from(parent.generatedSourceGzipBase64, "base64"), { maxOutputLength: 1048576 }).toString();
const sha = value => createHash("sha256").update(value).digest("hex");
test("startup recipe exactly reverses to authenticated retained source without editing or rerunning old evidence", () => {
  assert.equal(sha(source), parent.generatedSha256); const result = makeVp9OriginalStartupSource(source, root);
  let reversed = result.generated;
  for (const [before, after] of result.edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source); assert.equal(result.parentSha256, parent.generatedSha256); assert.equal(result.generatedSha256, sha(result.generated));
  assert.equal(result.startupOnly, true); assert.equal(result.fullFileAcceptance, false); assert.equal(result.publicAcceptance, false);
});
test("full original is passed directly, not an excerpt/generated source, with strict preflight and old baseline unchanged", () => {
  const { generated, changesMemoryFormulaOrLimit, changesBaselineWindowOrThreshold } = makeVp9OriginalStartupSource(source, root);
  assert.ok(generated.includes('const fixture = path.join(root, "test.mkv");'));
  assert.ok(generated.includes('protectedOriginal: true, generated: false, copied: false, truncated: false'));
  assert.doesNotMatch(generated, /testsrc2=|fixtureArgs|copyFile\(comparisonSource, fixture|count_frames/);
  assert.ok(generated.includes('minimumBytes: 2147483648')); assert.ok(generated.includes('assert.equal(report.blankBaseline?.stable, true, "Stable blank required before the long original startup'));
  assert.equal(changesMemoryFormulaOrLimit, false); assert.equal(changesBaselineWindowOrThreshold, false);
  assert.ok(generated.includes('report.workerIsolation = false; report.explicitCpuWorker = true;'));
  assert.doesNotMatch(generated, /setInputFiles\(fixture\)/); assert.ok(generated.includes("report.inputSelection = await selectExactLocalOriginal(page, fixture)"));
});
test("memory gate uses exact250MiB same-blank threshold, missing is unavailable rather than zero", () => {
  const baseline = 300000000, peak = mib => ({ peak: { privateBytes: baseline + mib * 1048576 }, validSamples: 1, unavailableSamples: 0 });
  assert.equal(originalStartupStop(peak(250), baseline, 2000), null);
  assert.equal(originalStartupStop(peak(250.000001), baseline, 2000).kind, "memory-budget-exceeded");
  assert.equal(originalStartupStop({ peak: null, validSamples: 0, unavailableSamples: 1 }, baseline, 100).kind, "unavailable-memory-samples");
  assert.equal(originalStartupStop({ peak: null, validSamples: 0, unavailableSamples: 0 }, baseline, 100), null);
  assert.equal(originalStartupStop({ peak: null, validSamples: 0, unavailableSamples: 0 }, baseline, 5000).kind, "no-valid-memory-samples");
  assert.throws(() => originalStartupStop({ peak: { privateBytes: null }, unavailableSamples: 0 }, baseline, 100));
});
test("five-minute bound is a diagnostic stop, never full-file acceptance or a source-duration change", () => {
  assert.equal(VP9_ORIGINAL_STARTUP.windowMs, 300000); assert.equal(VP9_ORIGINAL_STARTUP.cancellationGraceMs, 30000);
  assert.deepEqual([VP9_ORIGINAL_STARTUP.width, VP9_ORIGINAL_STARTUP.height, VP9_ORIGINAL_STARTUP.frameRate], [1920, 804, 24]);
  assert.equal(VP9_ORIGINAL_STARTUP.bitRateBps, 4000000);
  assert.equal(originalStartupStop({ peak: { privateBytes: 400000000 }, validSamples: 1, unavailableSamples: 0 }, 300000000, 300000).kind,
    "bounded-startup-window-ended");
});
test("driver check-only verifies lineage and parses generated source without browser, recipe write or media output", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ["scripts/test-vp9-original-startup.mjs", "--check-only"],
    { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  const value = JSON.parse(stdout); assert.equal(value.reversible, true); assert.equal(value.browserLaunched, false); assert.equal(value.recipeWritten, false);
  assert.match(value.generatedSha256, /^[a-f0-9]{64}$/);
});
test("changed second attempt has exclusive separate receipt/trace/recipe identity and still verifies exact original via same-host CDP", async () => {
  const result = makeVp9OriginalStartupSource(source, root, 2);
  assert.ok(result.generated.includes("evidence/2026-11-06-vp9-original-cpu-startup-attempt2.json"));
  assert.ok(result.generated.includes("2026-11-06-vp9-original-cpu-startup-attempt2-failure.zip"));
  assert.equal(result.attempt, 2); assert.throws(() => makeVp9OriginalStartupSource(source, root, 7));
  const { stdout } = await promisify(execFile)(process.execPath, ["scripts/test-vp9-original-startup.mjs", "2", "--check-only"],
    { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  assert.equal(JSON.parse(stdout).browserLaunched, false);
});
test("third original attempt requires a distinct authenticated width build and replaces every CPU pin/load reference", async () => {
  assert.throws(() => makeVp9OriginalStartupSource(source, root, 3), /distinct compiled core/);
  const result = makeVp9OriginalStartupSource(source, root, 3, "12345678");
  assert.ok(result.generated.includes("evidence/2026-11-06-vp9-original-width-native-12345678.json"));
  assert.ok(result.generated.includes('loadVp9DurationCpuAssets(root, "12345678", "original-width")'));
  for (const extension of ["mjs", "wasm"]) assert.ok(result.generated.includes("work/vp9-duration-input-12345678/within-remux." + extension));
  assert.doesNotMatch(result.generated, /vp9-duration-input-42020605269|vp9-duration-native-42020605269/);
  assert.equal(result.nativeRunId, "12345678");
  const { stdout } = await promisify(execFile)(process.execPath, ["scripts/test-vp9-original-startup.mjs", "3", "--check-only"],
    { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 65536, env: { ...process.env, WITHIN_VP9_ORIGINAL_NATIVE_RUN_ID: "12345678" } });
  assert.equal(JSON.parse(stdout).browserLaunched, false);
});
test("observer failures never skip independent OPFS removal or fabricate a passing memory value", async () => {
  const evidence = {}, calls = [];
  const page = { exposeBinding: async () => {}, evaluate: async (_callback, arg) => {
    if (typeof arg === "object") return { type: "error", message: "unit native error", encoder: null, cleanupComplete: true };
    calls.push("remove-opfs");
  } };
  const observer = { through: async () => { throw new Error("observer unavailable"); }, setPhase: () => { throw new Error("observer still unavailable"); } };
  await assert.rejects(runVp9OriginalStartup({ page, observer, blankBaseline: { stable: true, privateBytes: 100000000 }, evidence }), /every cleanup was attempted/);
  assert.deepEqual(calls, ["remove-opfs"]); assert.equal(evidence.partialOutputRemoved, true); assert.equal(evidence.memory, null);
  assert.equal(evidence.passedStartupOnly, false); assert.match(evidence.observerError, /observer unavailable/);
});
test("fourth attempt requires a distinct guarded tool plus passed strict small/recovery control", async () => {
  assert.throws(() => makeVp9OriginalStartupSource(source, root, 4, "42122918540"), /unmodified vendor/);
  const result = makeVp9OriginalStartupSource(source, root, 4, "12345678");
  assert.ok(result.generated.includes("vp9-original-cpu-startup-attempt4.json"));
  assert.equal(result.changesMemoryFormulaOrLimit, false); assert.equal(result.fullFileAcceptance, false);
  const driver = await readFile(new URL("../scripts/test-vp9-original-startup.mjs", import.meta.url), "utf8");
  assert.ok(driver.includes('qualification.recovery.passed, true'));
  assert.ok(driver.includes('qualification.independentFidelity.passed, true'));
  const { stdout } = await promisify(execFile)(process.execPath, ["scripts/test-vp9-original-startup.mjs", "4", "--check-only"],
    { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  assert.equal(JSON.parse(stdout).browserLaunched, false);
});
test("execution and OPFS cleanup failures are both recorded without pretending removed or observed", async () => {
  const evidence = {}, page = { exposeBinding: async () => {}, evaluate: async (_callback, arg) => {
    if (typeof arg === "object") throw new Error("browser job failed"); throw new Error("OPFS remove failed");
  } };
  const observer = { through: async () => {}, peaks: () => ({ peak: null, validSamples: 0, unavailableSamples: 1 }), setPhase: () => {} };
  await assert.rejects(runVp9OriginalStartup({ page, observer, blankBaseline: { stable: true, privateBytes: 100000000 }, evidence }), /every cleanup was attempted/);
  assert.match(evidence.executionError, /browser job failed/); assert.match(evidence.cleanupErrors[0], /OPFS remove failed/);
  assert.equal(evidence.partialOutputRemoved, false); assert.equal(evidence.memory.incrementalPrivateMiB, null); assert.equal(evidence.passedStartupOnly, false);
});
test("fifth original attempt requires changed diagnostic tool and records missing allocation statistics as unavailable",async()=>{
  assert.throws(()=>makeVp9OriginalStartupSource(source,root,5,"42129383089"),/distinct compiled diagnostic/);
  const result=makeVp9OriginalStartupSource(source,root,5,"12345678");
  assert.ok(result.generated.includes("parseVp9AllocationFailure(report.browserResult?.message)"));
  assert.ok(result.generated.includes("vp9-original-cpu-startup-attempt5.json"));
  const {stdout}=await promisify(execFile)(process.execPath,["scripts/test-vp9-original-startup.mjs","5","--check-only"],
    {cwd:root,windowsHide:true,timeout:30000,maxBuffer:65536});
  assert.equal(JSON.parse(stdout).browserLaunched,false);
});
test("sixth original attempt requires lazy utility core and preserves original settings/memory window",async()=>{
  assert.throws(()=>makeVp9OriginalStartupSource(source,root,6,"42135708757"),/distinct compiled tool/);
  const result=makeVp9OriginalStartupSource(source,root,6,"12345678");assert.ok(result.generated.includes("vp9-original-cpu-startup-attempt6.json"));
  assert.ok(result.generated.includes("parseVp9AllocationFailure(report.browserResult?.message)"));
  assert.equal(result.changesMemoryFormulaOrLimit,false);assert.equal(result.fullFileAcceptance,false);
  const {stdout}=await promisify(execFile)(process.execPath,["scripts/test-vp9-original-startup.mjs","6","--check-only"],
    {cwd:root,windowsHide:true,timeout:30000,maxBuffer:65536});assert.equal(JSON.parse(stdout).browserLaunched,false);
});
test("seventh original attempt requires new token core plus golden qualification and keeps full protected original and limits",async()=>{
  for(const id of ["42122918540","42129383089","42135708757","42218018139"])
    assert.throws(()=>makeVp9OriginalStartupSource(source,root,7,id),/distinct compiled tool/);
  const result=makeVp9OriginalStartupSource(source,root,7,"12345678");
  assert.ok(result.generated.includes("vp9-original-cpu-startup-attempt7.json"));
  assert.ok(result.generated.includes('selectExactLocalOriginal(page, fixture)'));
  assert.equal(result.changesMemoryFormulaOrLimit,false);assert.equal(result.changesBaselineWindowOrThreshold,false);
  assert.equal(result.startupOnly,true);assert.equal(result.fullFileAcceptance,false);
  assert.throws(()=>makeVp9OriginalStartupSource(source,root,8,"12345678"));
  const driver=await readFile(new URL("../scripts/test-vp9-original-startup.mjs",import.meta.url),"utf8");
  assert.ok(driver.includes("qualification.temporalAllocationGuard.tokenContextStorage,true"));
  assert.ok(driver.includes("native.nativeContract.candidate.tokenContext.tokenCapacityChanged,false"));
  const {stdout}=await promisify(execFile)(process.execPath,["scripts/test-vp9-original-startup.mjs","7","--check-only"],
    {cwd:root,windowsHide:true,timeout:30000,maxBuffer:65536});assert.equal(JSON.parse(stdout).browserLaunched,false);
});

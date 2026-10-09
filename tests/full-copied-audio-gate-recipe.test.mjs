import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { EXECUTED_SINGLE_IDLE_FULL_SHA, copiedAudioGateFiles, makeFullCopiedAudioGateRecipe } from "../scripts/lib/full-copied-audio-gate-recipe.mjs";
import { AUDIO_VALIDATOR_LIMITS } from "../scripts/lib/streaming-copied-audio-validation.mjs";
import { deriveDriverSourcePinFiles } from "../scripts/lib/driver-source-pin-union.mjs";

const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const digest = value => createHash("sha256").update(value).digest("hex");
const live = JSON.parse(await read("evidence/2026-10-09T20-55-24-319Z-single-idle-full-live.json"));
const compressed = await read(live.sourceArchive.path);
assert.equal(digest(compressed), live.sourceArchive.sha256);
const bytes = gunzipSync(compressed, { maxOutputLength: 8388608 });
assert.equal(bytes.length, live.sourceArchive.restoredBytes);
assert.equal(digest(bytes), live.sourceArchive.restoredSha256);
const executed = JSON.parse(bytes), recipe = makeFullCopiedAudioGateRecipe(executed, root);

test("Audio extension binds the actual archived driver and rejects altered/unrelated/repeated application", () => {
  assert.equal(digest(executed.generated), EXECUTED_SINGLE_IDLE_FULL_SHA);
  assert.throws(() => makeFullCopiedAudioGateRecipe({ ...executed, generated: executed.generated + "\n" }, root));
  assert.throws(() => makeFullCopiedAudioGateRecipe({ ...executed, generatedSha256: "0".repeat(64) }, root));
  assert.throws(() => makeFullCopiedAudioGateRecipe(executed, path.join(root, "work")));
  assert.throws(() => makeFullCopiedAudioGateRecipe(executed, "relative-root"));
  assert.throws(() => makeFullCopiedAudioGateRecipe(recipe, root));
});

test("Only additive validation/report/source coverage edits; every existing full gate reverses byte-exact", () => {
  let reversed = recipe.generated;
  for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, executed.generated);
  for (const token of ["number <= 3", "minimumMs: 300000", "run.incrementalPrivateMiB <= 250", "assert.ok(ssim >= 0.98)",
    "maximumTimestampErrorSeconds <= 0.001", "blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes",
    '"maximumConversionMs":21600000', '"partialOutputStopEnabled":false', "await verifySource(); cleanup.protectedFixtureUnchanged = true",
    "metrics.peakPendingOperations <= 1", "ownership.aggregateWasmMemoryBytes, 48 * MiB", '"--headless=new"',
    "await audioHashes(output)", '"-xerror"', "await runtime.close()"])
    assert.ok(recipe.generated.includes(token), token);
  assert.equal(recipe.publicAcceptance, false); assert.equal(recipe.originalFullAudioValidated, false);
  assert.equal(recipe.requiresFreshOwnedWrapperBindingBeforeLaunch, true);
  assert.ok(!recipe.generated.includes("headless: false") && !recipe.generated.includes("windowsHide: false"));
});

test("Every copied-audio dependency is included in the strict future source pin union", () => {
  const coverage = deriveDriverSourcePinFiles(recipe.generated, Object.keys(live.sourcePins).filter(file => !/\.(sh|patch)$/.test(file)));
  for (const file of copiedAudioGateFiles) assert.ok(coverage.files.includes(file), file);
  assert.ok(recipe.generated.includes('"decodedCopiedAudioRequired":true'));
  assert.ok(recipe.generated.includes("fullDecode: true, decodedAudioFrameValidation"));
  assert.ok(recipe.generated.indexOf(recipe.audioBlock) < recipe.generated.indexOf("    await emptyOpfs(); await page.waitForFunction"));
  assert.ok(!recipe.audioBlock.includes("Promise.all") && !recipe.audioBlock.includes("readFile") && !recipe.audioBlock.includes("arrayBuffer"));
});

test("Future driver parses without executing a browser, media decoder or conversion", () => {
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"],
    { input: recipe.generated, encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr);
});

// Execute ONLY the new insertion with unit doubles, never the complete browser driver.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runInsertion = new AsyncFunction("assert", "AUDIO_VALIDATOR_LIMITS", "validateCopiedAudioFrames", "inputAudio", "runtime", "events",
  `const source = "unit-source", output = "unit-output";
   try {
${recipe.audioBlock}
     events.push("validation-complete");
     events.push("normal-output-cleanup");
     return decodedAudioFrameValidation;
   } finally { events.push("finally-cleanup"); }`);

test("Unit insertion validates every ordinal sequentially before normal cleanup, retaining only bounded summaries", async () => {
  const events = [], env = Object.freeze({ TEMP: "unit-owned-runtime" });
  let active = 0, peakActive = 0;
  const validator = async (source, output, options) => {
    assert.equal(source, "unit-source"); assert.equal(output, "unit-output"); assert.equal(options.env, env);
    assert.equal(options.maximumMs, undefined, "Keep the existing strict validator deadline");
    active++; peakActive = Math.max(peakActive, active); events.push(options.audioOrdinal);
    await Promise.resolve(); active--;
    return { audioOrdinal: options.audioOrdinal, unitDoubleOnly: true };
  };
  const result = await runInsertion(assert, AUDIO_VALIDATOR_LIMITS, validator,
    Array.from({ length: 16 }, () => ({ codec_name: "aac" })), { env }, events);
  assert.equal(peakActive, 1); assert.equal(active, 0); assert.equal(result.length, 16);
  assert.deepEqual(result.map(row => row.audioOrdinal), Array.from({ length: 16 }, (_, i) => i));
  assert.deepEqual(events.slice(-3), ["validation-complete", "normal-output-cleanup", "finally-cleanup"]);
});

test("Unit insertion propagates audio mismatch, stops later tracks and still reaches failure finally cleanup", async () => {
  const events = [], failure = new Error("unit decoded audio trim differs");
  const validator = async (_source, _output, { audioOrdinal }) => {
    events.push(audioOrdinal); if (audioOrdinal === 1) throw failure;
    return { audioOrdinal, unitDoubleOnly: true };
  };
  await assert.rejects(runInsertion(assert, AUDIO_VALIDATOR_LIMITS, validator,
    [{}, {}, {}], { env: {} }, events), error => error === failure);
  assert.deepEqual(events, [0, 1, "finally-cleanup"]);
});

test("Unit insertion fails unavailable/oversize protected audio coverage before spawning any validator", async () => {
  for (const count of [0, 17]) {
    const events = [];
    await assert.rejects(runInsertion(assert, AUDIO_VALIDATOR_LIMITS, async () => {
      assert.fail("No validator may start with unbounded or absent coverage");
    }, Array.from({ length: count }, () => ({})), { env: {} }, events), /bounded complete audio coverage/);
    assert.deepEqual(events, ["finally-cleanup"]);
  }
});

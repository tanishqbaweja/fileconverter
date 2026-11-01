// Authenticate recorded evidence. These tests do not replay a codec conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
const root = new URL("../", import.meta.url), read = file => readFile(new URL(file, root));
const json = async file => JSON.parse(await read(file)), sha = x => createHash("sha256").update(x).digest("hex");
const archive = await json("evidence/2026-11-01-webcodecs-vp9-diagnostic-archives.json");
async function detailed(name) {
  const compact = await json(`evidence/2026-11-01-webcodecs-vp9-${name}.json`);
  const packed = await read(compact.rawArchive.file), bytes = gunzipSync(packed, { maxOutputLength: 4194304 });
  assert.equal(packed.length, compact.rawArchive.bytes); assert.equal(sha(packed), compact.rawArchive.sha256);
  assert.equal(bytes.length, compact.rawArchive.decodedBytes); assert.equal(sha(bytes), compact.rawArchive.decodedSha256);
  return JSON.parse(bytes);
}
test("private native build receipt binds real bytes and fixed memory without claiming conversion acceptance", async () => {
  const native = await json("evidence/2026-11-01-webcodecs-vp9-native-41305653513.json");
  assert.equal(native.runId, 41305653513); assert.equal(native.head, "b97e6cd688e88a07e0c02cb6e7169670aa2fb682");
  assert.deepEqual(native.nativeContract.artifacts["within-webcodecs-vp9.wasm"], { bytes: 5561813,
    sha256: "de969908086cb0d1f2ff3bb035733a5aae983e0e1d6292b9c8ba80c06e5b859e" });
  assert.deepEqual(native.nativeContract.memoryLimits, [{ imported: false, initialPages: 512, maximumPages: 512, shared: false }]);
  for (const key of ["publicAcceptance", "browserConversionVerified", "fallbackIntegrated", "speedGainProven", "reproducibilityVerified"])
    assert.equal(native.nativeContract[key], false);
  const terminal = await json("evidence/2026-11-01-webcodecs-vp9-build-41305653513-terminal.json");
  assert.equal(terminal.conclusion, "success"); assert.equal(terminal.cleanupStepsPassed, true);
  assert.deepEqual(terminal.focusedTests, { tests: 39, pass: 39, fail: 0 });
});
test("all six raw diagnostic receipts roundtrip exactly; storage reduction does not erase failures", async () => {
  assert.equal(archive.reports.length, 6); assert.equal(archive.allRoundtripsVerified, true);
  assert.equal(archive.originalBytes, 1216715); assert.equal(archive.retainedBytes, 351917);
  for (const row of archive.reports) {
    const compact = await read(row.file); assert.equal(compact.length, row.compactBytes); assert.equal(sha(compact), row.compactSha256);
    const raw = gunzipSync(await read(row.archive.file), { maxOutputLength: 4194304 });
    assert.equal(raw.length, row.archive.decodedBytes); assert.equal(sha(raw), row.archive.decodedSha256);
  }
});
test("unavailable first blank remains a failure with zero conversions, never a zero/inflated memory baseline", async () => {
  const receipt = await detailed("first-smoke"); assert.equal(receipt.blankBaseline, null);
  assert.equal(receipt.browserResult, undefined); assert.equal(receipt.memory, undefined); assert.equal(receipt.baselineAdjusted, undefined);
  assert.equal(receipt.blankSamples.length, 19); assert.ok(receipt.blankSamples.every(x => x.privateBytes > 0));
  assert.equal(receipt.status, "failed-private-vp9-browser-smoke");
});
test("native color diagnostic proves missing fixture tags, not guessed color replacement or an encoder speed result", async () => {
  const receipt = await detailed("native-color-diagnostic"), source = receipt.sourceProbe.streams[0];
  assert.equal(source.color_primaries, undefined); assert.equal(source.color_transfer, undefined);
  assert.equal(source.color_space, "bt709"); assert.equal(source.color_range, "tv");
  assert.match(receipt.browserResult.message, /2\/2\/1\/1/); assert.equal(receipt.browserResult.encoder.frames, 0);
  assert.equal(receipt.browserResult.metrics.outputBytes, 0);
  const preflight = await detailed("explicit-color-fixture"); assert.equal(preflight.browserResult, undefined);
  assert.ok(preflight.failures.some(x => x.includes("Verify actual source metadata before launching Chromium")));
});
test("hardware-preferred rejection is retained separately from the successful no-preference conversion", async () => {
  const failed = await detailed("frame-color-fixture"); assert.equal(failed.browserResult.type, "error");
  assert.match(failed.browserResult.message, /Exact VP9 encoder configuration is unsupported/);
  assert.equal(failed.browserResult.encoder.frames, 0); assert.equal(failed.browserResult.metrics.outputBytes, 0);
  const passed = await detailed("encoder-preference-fallback");
  assert.equal(passed.browserResult.encoder.supportProbeCount, 2); assert.equal(passed.browserResult.encoder.hardwarePreferredSupported, false);
  assert.equal(passed.browserResult.encoder.selectedHardwarePreference, "no-preference");
  assert.equal(passed.browserResult.encoder.physicalHardwareSelectionProven, false);
});
test("real private VP9 output was independently decoded, timestamped and measured, not just renamed", async () => {
  const receipt = await detailed("encoder-preference-fallback"), result = receipt.browserResult, stream = receipt.outputProbe.streams[0];
  assert.equal(receipt.status, "passed-one-small-private-browser-conversion-not-public-or-stress-acceptance");
  assert.equal(receipt.sourceProbe.streams[0].codec_name, "h264"); assert.equal(stream.codec_name, "vp9");
  assert.deepEqual([stream.width, stream.height, Number(stream.nb_read_frames)], [320, 180, 48]);
  assert.deepEqual([stream.color_primaries, stream.color_transfer, stream.color_space, stream.color_range], ["bt709", "bt709", "bt709", "tv"]);
  assert.equal(Number(receipt.outputProbe.format.duration), 2); assert.equal(receipt.independentFullDecodePassed, true);
  assert.equal(receipt.fixture.bytes, 57599); assert.equal(receipt.exportedBytes, 97756);
  assert.equal(result.encoder.frames, 48); assert.equal(result.encoder.packets, 48); assert.equal(result.encoder.framesClosed, 48);
  assert.equal(result.encoder.currentPackedBytes, 0); assert.equal(result.encoder.pendingPacketBytes, 0);
  assert.equal(result.encoder.peakPackedBytes, 86400); assert.equal(result.encoder.peakPacketBytes, 6247);
  assert.equal(result.metrics.peakPendingOperations, 1); assert.equal(result.metrics.peakQueuedBytes, 97328);
  assert.equal(result.metrics.wasmMemoryBytes, 33554432); assert.equal(result.elapsedMs, 3101.9099999666214);
  assert.equal(receipt.blankBaseline.privateBytes, 330477568); assert.equal(receipt.memory.peak.privateBytes, 479576064);
  assert.equal(receipt.memory.incrementalPrivateMiB, (479576064 - 330477568) / 1048576);
  assert.equal(receipt.memory.validSamples, 33); assert.equal(receipt.memory.unavailableSamples, 0);
  assert.deepEqual(receipt.forbiddenRequests, []); assert.equal(receipt.speedGainProven, false);
  assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.fullStressAcceptance, false);
});
test("every owned diagnostic cleaned its data/processes and preserved the full original checksum", async () => {
  const expected = { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" };
  for (const name of ["first-smoke", "functional-diagnostic", "native-color-diagnostic", "explicit-color-fixture", "frame-color-fixture", "encoder-preference-fallback"]) {
    const receipt = await detailed(name); assert.deepEqual(receipt.originalBefore, expected); assert.deepEqual(receipt.originalAfter, expected);
    assert.equal(receipt.ownedRuntimeRemoved, true); assert.ok(receipt.processCleanup.every(x => x.status === "owned-identity-absent"));
    if (receipt.nativeMemory) assert.equal(receipt.ownedStaticStageRemoved, true);
  }
});
test("all diagnostic derivatives retain the exact baseline and250MiB verdict with reversible source proofs", async () => {
  const source = (await read("scripts/test-webcodecs-vp9-smoke.mjs")).toString();
  for (const name of ["functional-diagnostic-recipe", "functional-diagnostic-recipe-repaired", "native-color-diagnostic-recipe",
    "explicit-color-fixture-recipe", "frame-color-fixture-recipe", "encoder-preference-fallback-recipe"]) {
    const recipe = await json(`evidence/2026-11-01-webcodecs-vp9-${name}.json`); assert.equal(recipe.parentSha256, sha(source));
    const generated = gunzipSync(Buffer.from(recipe.generatedSourceGzipBase64, "base64"), { maxOutputLength: 1048576 }).toString();
    assert.equal(sha(generated), recipe.generatedSha256); let forward = source;
    for (const [before, after] of recipe.edits) { assert.equal(forward.split(before).length, 2); forward = forward.replace(before, after); }
    assert.equal(forward, generated); let reverse = generated;
    for (const [before, after] of recipe.edits.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
    assert.equal(reverse, source); assert.equal(recipe.baselineFormulaChanged, false); assert.equal(recipe.baselineWindowOrThresholdChanged, false);
    assert.ok(generated.includes('assert.equal(report.blankBaseline?.stable, true, "Stable blank baseline remains required'));
    assert.ok(generated.includes('peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250'));
    assert.ok(generated.includes('incrementalPrivateMiB: peaks.peak && report.blankBaseline ?'));
  }
});

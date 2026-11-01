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
test("rebuilt native error mapping is source-bound and regressed through a genuine48-frame browser conversion", async () => {
  const native = await json("evidence/2026-11-01-webcodecs-vp9-native-41309113218.json"), receipt = await detailed("rebuilt-native");
  assert.equal(native.head, "cd0f079588bed73162e1b9bd9b52e76bc2e30837");
  assert.deepEqual(native.nativeContract.artifacts["within-webcodecs-vp9.wasm"], { bytes: 5561904,
    sha256: "6f4457e1e292ee016c51a76ff7acbd51b6541c2183e4ebc7e9e31b23d6878c26" });
  assert.equal(receipt.nativeTool.runId, 41309113218); assert.equal(receipt.browserResult.encoder.frames, 48);
  assert.equal(receipt.browserResult.encoder.framesClosed, 48); assert.equal(receipt.independentFullDecodePassed, true);
  assert.equal(receipt.browserResult.metrics.elapsedMs, receipt.browserResult.elapsedMs);
  assert.equal(receipt.memory.incrementalPrivateMiB, (511881216 - 330891264) / 1048576);
  assert.equal(receipt.memory.validSamples, 30); assert.equal(receipt.memory.unavailableSamples, 0);
  assert.equal(receipt.status, "passed-one-small-private-browser-conversion-not-public-or-stress-acceptance");
});
test("real CPU fallback output is decoded but300.871MiB stays a failed qualification, not a certified fast route", async () => {
  const receipt = await detailed("rebuilt-cpu-fallback"), result = receipt.browserResult;
  assert.equal(result.type, "complete"); assert.equal(result.selection.backend, "wasm");
  assert.match(result.selection.fallbackReason, /2\/2\/1\/1/); assert.doesNotMatch(result.selection.fallbackReason, /Network is down/);
  assert.equal(result.encoder.frames, 0); assert.equal(result.encoder.currentPackedBytes, 0); assert.equal(result.encoder.pendingPacketBytes, 0);
  assert.equal(receipt.outputProbe.streams[0].codec_name, "vp9"); assert.equal(Number(receipt.outputProbe.streams[0].nb_read_frames), 48);
  assert.equal(receipt.independentFullDecodePassed, true); assert.equal(receipt.outputProbe.streams[0].color_primaries, undefined);
  assert.equal(receipt.outputProbe.streams[0].color_transfer, undefined); assert.equal(Number(receipt.outputProbe.format.duration), 1.958);
  assert.equal(result.metrics.activeWorkerCount, 9); assert.equal(result.metrics.wasmMemoryBytes, 50331648);
  assert.equal(result.metrics.peakPendingOperations, 1); assert.equal(result.metrics.peakQueuedBytes, 98174);
  assert.equal(receipt.memory.incrementalPrivateMiB, (648970240 - 333484032) / 1048576);
  assert.equal(receipt.memory.incrementalPrivateMiB, 300.87109375); assert.equal(receipt.memory.validSamples, 19); assert.equal(receipt.memory.unavailableSamples, 0);
  assert.equal(receipt.status, "failed-private-vp9-browser-smoke"); assert.ok(receipt.failures.some(x => x.includes("250")));
  assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.speedGainProven, false);
});
test("rebuilt control archives keep exact raw private-memory data and all cleanup/checksum evidence", async () => {
  const saved = await json("evidence/2026-11-01-webcodecs-vp9-rebuilt-control-archives.json"); assert.equal(saved.reports.length, 2);
  assert.equal(saved.originalBytes, 520626); assert.equal(saved.retainedBytes, 154656);
  for (const row of saved.reports) {
    const compact = await read(row.file), packed = await read(row.archive.file), raw = gunzipSync(packed, { maxOutputLength: 4194304 });
    assert.equal(sha(compact), row.compactSha256); assert.equal(sha(packed), row.archive.sha256); assert.equal(sha(raw), row.archive.decodedSha256);
    const receipt = JSON.parse(raw); assert.equal(receipt.ownedRuntimeRemoved, true); assert.equal(receipt.ownedStaticStageRemoved, true);
    assert.ok(receipt.processCleanup.every(x => x.status === "owned-identity-absent")); assert.deepEqual(receipt.originalBefore, receipt.originalAfter);
    assert.equal(receipt.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  }
});
test("offline fallback allocation annotation retains every process and original simultaneous total", async () => {
  const report = await json("evidence/2026-11-01-webcodecs-vp9-fallback-allocation.json");
  assert.equal(report.newBrowserRuns, 0); assert.equal(report.processExclusions, false); assert.equal(report.memoryFormulaChanged, false);
  assert.equal(report.processes.length, 10); assert.equal(report.processes.reduce((sum, p) => sum + p.peakPrivateBytes, 0), 648970240);
  assert.equal(report.dominantRenderer.pid, 8996); assert.equal(report.dominantRenderer.type, "renderer");
  assert.equal(report.dominantRenderer.birthAndParentMatched, true); assert.equal(report.dominantRenderer.increaseSinceLoadedIdleBytes, 246960128);
  assert.equal(report.originalIncrementalPrivateMiB, 300.87109375); assert.equal(report.additionalAllocationCategoriesMeasured, false);
});
test("superseded native tool cleanup was exact-owned and recoverable, not deletion of user media", async () => {
  const receipt = await json("evidence/2026-11-01-webcodecs-vp9-superseded-input-cleanup.json");
  assert.equal(receipt.target, "work/webcodecs-vp9-input-41305653513"); assert.equal(receipt.files, 14); assert.equal(receipt.bytes, 6004849);
  assert.equal(receipt.removed, true); assert.equal(receipt.verifiedExactOwnedContents, true); assert.equal(receipt.userMediaReadOrRemoved, false);
  assert.equal(receipt.replacementRunId, 41309113218); assert.equal(receipt.replacementBrowserRegressionPassed, true);
  assert.equal(receipt.recovery.artifactId, 13082584850); assert.equal(receipt.recovery.localCopyRetained, false);
});
test("realm fallback diagnosis retains full-tree failure despite small per-helper JS heaps", async () => {
  const receipt = await detailed("fallback-realms");
  assert.equal(receipt.status, "failed-private-vp9-browser-smoke"); assert.equal(receipt.diagnosticPerturbsMemoryAndTiming, true);
  assert.equal(receipt.memory.incrementalPrivateMiB, 295.28515625);
  assert.equal(receipt.memory.validSamples, 20); assert.equal(receipt.memory.unavailableSamples, 0);
  assert.deepEqual(receipt.realmSamples.map(x => x.label), ["loaded-idle", "webcodecs-vp9-ready", "candidate-disposed", "wasm-ready", "output-closed", "workers-terminated"]);
  assert.deepEqual(receipt.realmSamples.map(x => x.sample.targets.length), [2, 3, 3, 11, 11, 2]);
  for (const { sample } of receipt.realmSamples) {
    assert.equal(sample.targetsAvailable, true); assert.ok(sample.targets.every(x => x.error === null));
  }
  const helpers = receipt.realmSamples[3].sample.targets.filter(x => x.url.endsWith("/within-vp9.mjs"));
  assert.equal(helpers.length, 8); assert.ok(helpers.every(x => x.allocatedJSHeapBytes === 1310720));
  assert.equal(receipt.browserResult.metrics.wasmMemoryBytes, 50331648);
  assert.equal(receipt.independentFullDecodePassed, true); assert.equal(receipt.publicAcceptance, false);
});
test("identical-source default control cannot claim memory or speed acceptance with a null blank baseline", async () => {
  const receipt = await detailed("comparison-default-core"), fixture = await read("fixtures/media/vp9-fallback-comparison.mkv");
  assert.equal(fixture.length, 58389); assert.equal(sha(fixture), "4fad7ea6c1dd0d374b1b69201b6af4b68e8518bf2672884d23b1f136f5f2cc46");
  assert.equal(receipt.fixture.sha256, sha(fixture)); assert.equal(receipt.coreComparison.sourceSha256, sha(fixture));
  assert.equal(receipt.coreComparison.policy, "default"); assert.equal(receipt.coreComparison.singleColdRunOnly, true);
  assert.equal(receipt.coreComparison.acceptedOptimization, false); assert.equal(receipt.blankBaseline, null);
  assert.equal(receipt.memory.incrementalPrivateMiB, null); assert.equal(receipt.memory.validSamples, 21);
  assert.equal(receipt.browserResult.type, "complete"); assert.equal(receipt.browserResult.selection.wasmFallbackCore, "default");
  assert.equal(receipt.independentFullDecodePassed, true); assert.equal(receipt.exportedBytes, 98585);
  assert.equal(receipt.speedGainProven, false); assert.equal(receipt.status, "failed-private-vp9-browser-smoke");
});
test("single-thread control stopped at host safety preflight, not a conversion or a speed result", async () => {
  const receipt = await json("evidence/2026-11-01-webcodecs-vp9-comparison-single-core.json");
  assert.equal(receipt.hostMemory.safeToStart, false); assert.equal(receipt.hostMemory.freeVirtualBytes, 2046251008);
  assert.equal(receipt.hostMemory.requiredVirtualBytes, 2147483648); assert.equal(receipt.browserResult, undefined);
  assert.equal(receipt.memory, undefined); assert.equal(receipt.browserPin, undefined); assert.deepEqual(receipt.processCleanup, []);
  assert.equal(receipt.ownedRuntimeRemoved, false); assert.equal(receipt.speedGainProven, false);
  assert.equal(receipt.status, "failed-private-vp9-browser-smoke");
  assert.ok(receipt.failures.some(x => x.includes("reading 'version'")), "Retain the historical early-finally bug, do not rewrite receipt as fixed");
  assert.equal(receipt.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
});
test("allocation-control archives preserve exact raw sampling and all owned cleanup evidence", async () => {
  const saved = await json("evidence/2026-11-01-webcodecs-vp9-allocation-control-archives.json");
  assert.equal(saved.originalBytes, 548573); assert.equal(saved.retainedBytes, 173626); assert.equal(saved.reports.length, 2);
  for (const row of saved.reports) {
    assert.equal(sha(await read(row.file)), row.compactSha256);
    const packed = await read(row.archive.file); assert.equal(sha(packed), row.archive.sha256);
    const raw = gunzipSync(packed, { maxOutputLength: 4194304 }); assert.equal(sha(raw), row.archive.decodedSha256);
    const receipt = JSON.parse(raw); assert.equal(receipt.ownedRuntimeRemoved, true); assert.equal(receipt.ownedStaticStageRemoved, true);
    assert.equal(receipt.processCleanup.length, 3); assert.ok(receipt.processCleanup.every(x => x.status === "owned-identity-absent"));
    assert.deepEqual(receipt.originalAfter, receipt.originalBefore);
    assert.equal(receipt.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  }
});
test("rebuilt and CPU fallback driver changes are reversible and retain independent decode and full250MiB checks", async () => {
  const source = (await read("scripts/test-webcodecs-vp9-smoke.mjs")).toString();
  for (const name of ["rebuilt-native", "rebuilt-cpu-fallback"]) {
    const recipe = await json(`evidence/2026-11-01-webcodecs-vp9-${name}-recipe.json`); let generated = source;
    for (const [before, after] of recipe.edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
    assert.equal(sha(generated), recipe.generatedSha256);
    assert.equal(gunzipSync(Buffer.from(recipe.generatedSourceGzipBase64, "base64")).toString(), generated);
    assert.ok(generated.includes('assert.equal(Number(stream.nb_read_frames), 48)'));
    assert.ok(generated.includes('peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250'));
    assert.ok(generated.includes('assert.equal(report.blankBaseline?.stable, true, "Stable blank baseline remains required'));
    for (const [before, after] of recipe.edits.toReversed()) { assert.equal(generated.split(after).length, 2); generated = generated.replace(after, before); }
    assert.equal(generated, source);
  }
});

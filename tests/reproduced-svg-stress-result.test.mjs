import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../images/resvg-source/source-pins.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
test("actual first three 8M grid runs keep exact independent pixels, whole-tree memory and cleanup proof without accepting false zero Wasm telemetry", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-28-svg-grid-stress-first-terminal.json")), values = [];
  for (const entry of [proof.wrapper, proof.browser]) {
    const bytes = await read(entry.path); assert.equal(bytes.length, entry.bytes); assert.equal(sha(bytes), entry.sha256); values.push(JSON.parse(bytes));
  }
  const [outer, row] = values;
  assert.deepEqual([row.stats.expected, row.stats.unexpected, row.stats.skipped, row.stats.flaky], [3,0,0,0]);
  assert.equal(row.memory.incrementalPrivateMiB, 224.39453125); assert.equal(row.memory.limitMiB, 250);
  assert.equal((row.memory.peak.privateBytes - row.blankBaseline.privateBytes) / 1048576, proof.incrementalPrivateMiB);
  assert.equal(row.memory.validSamples, 883); assert.equal(row.memory.unavailableSamples, 0);
  assert.equal(row.baselineAdjusted, false); assert.equal(row.browserServicesDisabledByDriver, false);
  assert.equal(row.domSnapshotRecording, true); assert.equal(row.networkHarRecording, true);
  assert.equal(outer.fixture.sameHistoricalSourceAndReferenceBytes, true); assert.equal(outer.fixture.metadata.sha256, proof.sourceSha256);
  assert.equal(outer.fixture.metadata.validationSha256, proof.referenceSha256); assert.equal(row.stressRuns.length, 3);
  for (const run of row.stressRuns) {
    assert.equal(run.result.independentlyValidatedRgbaPixels, true); assert.equal(run.result.outputBytes, 196588);
    assert.equal(run.result.width * run.result.height, 8294400);
    const metrics = run.result.metrics;
    assert.equal(metrics.peakPendingOperations, 1); assert.ok(metrics.maxReadChunkBytes <= 262144);
    assert.ok(metrics.maxWriteChunkBytes <= 262144); assert.equal(metrics.peakWasmMemoryBytes, 0, "Retain the original incorrect placeholder, never relabel it a measurement");
  }
  assert.equal(proof.trackedCurrentWasmBytes, null); assert.equal(proof.trackedPeakWasmBytes, null); assert.match(proof.wasmTrackingIncomplete, /not actual zero/);
  const archive = JSON.parse(await read(proof.sourceArchive)); assert.equal(archive.sourceCommit, row.executedHead);
  for (const [file, digest] of Object.entries(outer.sourcePins)) {
    const archived = archive.files[file];
    const bytes = archived ? gunzipSync(Buffer.from(archived.gzipBase64, "base64"), { maxOutputLength: 65536 }) : await read(file);
    assert.equal(sha(bytes), digest, file);
  }
  assert.equal(outer.ownedGenerationAndFixtureRuntimeRemoved, true); assert.equal(row.ownedRuntimeRemoved, true);
  assert.ok(row.processCleanup.every(value => value.status === "owned-identity-absent")); assert.equal(outer.processCleanup.status, "owned-identity-absent");
  assert.deepEqual(row.protectedOriginalBefore, row.protectedOriginalAfter); assert.equal(proof.fullSvgOrReleaseAcceptance, false);
});
test("fresh Chrome repeats exact high-pixel outputs within 250 MiB, with measured validator speedup but no false codec or telemetry claim", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-28-svg-grid-clean-session-terminal.json")), values = [];
  for (const entry of [proof.wrapper, proof.browser]) {
    const bytes = await read(entry.path); assert.equal(bytes.length, entry.bytes); assert.equal(sha(bytes), entry.sha256); values.push(JSON.parse(bytes));
  }
  const [outer, row] = values, previous = JSON.parse(await read(proof.previousSession));
  assert.deepEqual([row.stats.expected, row.stats.unexpected, row.stats.skipped, row.stats.flaky], [3,0,0,0]);
  assert.equal(row.stats.duration, 9058.806); assert.equal(row.memory.incrementalPrivateMiB, 243.79296875);
  assert.equal(row.memory.validSamples, 93); assert.equal(row.memory.unavailableSamples, 0);
  assert.equal((row.memory.peak.privateBytes - row.blankBaseline.privateBytes) / 1048576, proof.incrementalPrivateMiB);
  assert.equal(row.baselineAdjusted, false); assert.equal(row.browserServicesDisabledByDriver, false);
  assert.equal(row.domSnapshotRecording, true); assert.equal(row.networkHarRecording, true);
  assert.equal(outer.fixture.metadata.sha256, previous.sourceSha256); assert.equal(outer.fixture.metadata.validationSha256, previous.referenceSha256);
  const oldBrowser = JSON.parse(await read(previous.browser.path));
  assert.equal(row.candidatePin.wasmSha256, oldBrowser.candidatePin.wasmSha256);
  const birth = report => report.processCleanup.find(item => item.identity.pid === report.memory.peak.processes.find(proc => proc.type === "browser").pid).identity;
  assert.notDeepEqual(birth(row), birth(oldBrowser), "A genuinely new clean browser birth, not just a new report");
  for (const run of row.stressRuns) {
    assert.equal(run.result.independentlyValidatedRgbaPixels, true); assert.equal(run.result.outputBytes, 196588);
    assert.equal(run.result.pixelComparison.expectedBytes, 33177600); assert.equal(run.result.pixelComparison.implementation, "exact-native-buffer-equality");
    assert.ok(run.result.pixelComparison.comparisonMs >= 0); assert.equal(run.result.metrics.peakPendingOperations, 1);
    assert.ok(run.result.metrics.maxReadChunkBytes <= 262144); assert.ok(run.result.metrics.maxWriteChunkBytes <= 262144);
  }
  const archive = JSON.parse(await read(proof.sourceArchive)); assert.equal(archive.sourceCommit, row.executedHead);
  for (const [file, digest] of Object.entries(outer.sourcePins)) {
    const archived = archive.files[file];
    const bytes = archived ? gunzipSync(Buffer.from(archived.gzipBase64, "base64"), { maxOutputLength: 65536 }) : await read(file);
    assert.equal(sha(bytes), digest, file);
  }
  assert.equal(outer.ownedGenerationAndFixtureRuntimeRemoved, true); assert.equal(row.ownedRuntimeRemoved, true);
  assert.ok(row.processCleanup.every(value => value.status === "owned-identity-absent")); assert.equal(outer.processCleanup.status, "owned-identity-absent");
  assert.deepEqual(row.protectedOriginalBefore, row.protectedOriginalAfter);
  assert.equal(proof.trackedPeakWasmBytes, null); assert.equal(proof.fullSvgOrReleaseAcceptance, false);
});

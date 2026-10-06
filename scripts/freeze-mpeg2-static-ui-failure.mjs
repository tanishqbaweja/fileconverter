// Preserve terminal evidence before changing attribution. No media is retained.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reportPath = "outputs/reports/2026-10-06T21-41-32-770Z-private-mpeg2-static-ui-original-native-100ms.json";
const supplementPath = "outputs/reports/2026-10-06T22-33-46-047Z-original-audio-supplement.json";
const raw = await readFile(path.join(root, reportPath)); assert.ok(raw.length <= 32 * MiB);
const report = JSON.parse(raw), run = report.runs[0], peak = run.nativePeaks.peak;
assert.equal(report.status, "failed"); assert.equal(report.publicAcceptance, false); assert.equal(report.diagnosticOnly, false);
assert.equal(report.limitMiB, 250); assert.equal(report.requestedRuns, 3); assert.equal(report.runs.length, 1);
assert.equal(run.incrementalPrivateMiB, 260.52734375); assert.equal(peak.privateBytes, 507424768);
assert.equal(report.blankBaseline.privateBytes, 234242048); assert.equal(peak.processes.length, 9);
assert.equal(peak.privateBytes, peak.processes.reduce((sum, entry) => sum + entry.privateBytes, 0));
assert.equal((peak.privateBytes - report.blankBaseline.privateBytes) / MiB, run.incrementalPrivateMiB);
assert.equal(report.startupSettlement.minimumMs, 300000); assert.ok(report.startupSettlement.actualMs >= 300000);
assert.ok(report.blankBaseline.privateBytes < report.startupSettlement.earlyWindow.privateBytes);
assert.equal(report.startupSettlement.baselineInflated, false); assert.equal(report.startupSettlement.flagsChanged, false);
assert.equal(report.source.bytes, 2958573265);
assert.equal(report.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.equal(report.manifest.aggregateWasmMemoryBytes, 48 * MiB); assert.equal(report.manifest.allowMemoryGrowth, false);
assert.equal(run.state.jobState, "running"); assert.equal(run.independentValidation, null); assert.equal(run.recovery, null);
assert.equal(run.state.metrics.wasmMemoryBytes, 48 * MiB); assert.equal(run.state.metrics.peakWasmMemoryBytes, 48 * MiB);
assert.equal(run.state.metrics.peakQueuedBytes, 65536); assert.equal(run.state.metrics.peakPendingOperations, 1);
assert.equal(run.state.metrics.maxReadChunkBytes, 65536); assert.equal(run.state.metrics.maxWriteChunkBytes, 65536);
assert.equal(report.splitFinalSamples[0].frames, 97772); assert.equal(report.splitFinalSamples[0].completedPackets, 97771);
assert.equal(report.splitFinalSamples[0].failed, true); assert.equal(report.splitFinalSamples[0].closed, true);
assert.equal(report.splitFinalSamples[0].queuedFrames, 0); assert.equal(report.splitFinalSamples[0].queuedPackets, 0);
assert.equal(report.splitFinalSamples[0].activePackets, 0); assert.equal(report.nativeMemory.error, null);
assert.equal(run.nativePeaks.unavailableSamples, 0); assert.deepEqual(report.forbiddenRequests, []);
const later = report.samples.find(sample => sample.timestamp === "2026-10-06T22:44:24.566Z"); assert.ok(later);
const peakIdentities = peak.processes.map(native => {
  const cim = later.processes.find(entry => entry.pid === native.pid && entry.parentPid === native.parentPid &&
    Math.abs(Date.parse(entry.createdAt) - Date.parse(native.createdAt)) < 1);
  assert.ok(cim, `Native/CIM identity ${native.pid}`);
  assert.notEqual(cim.utilitySubtype, "on_device_model.mojom.OnDeviceModelService");
  return { native, cim };
});
const renderer = peakIdentities.find(pair => pair.native.pid === 38208); assert.ok(renderer);
assert.equal(renderer.cim.type, "renderer"); assert.equal(renderer.native.privateBytes, 255291392);
assert.equal(renderer.cim.privateBytes, 201478144);
for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(report.cleanup[key], true, key);
assert.equal(report.cleanup.conversionQuiescence.terminalState, "cancelled");
await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
await assert.rejects(access(path.join(root, "work/mpeg2-static-ui-driver-IK7QwQ")), { code: "ENOENT" });
const restoredAssetPins = {};
for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"]) {
  const published = await readFile(path.join(root, "public/engines/remux", file));
  assert.equal(sha(await readFile(path.join(root, "dist/client/engines/remux", file))), sha(published));
  restoredAssetPins[file] = sha(published);
}
const privateAssetsAbsent = ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
  "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"];
for (const file of privateAssetsAbsent) await assert.rejects(access(path.join(root, "dist/client/engines/remux", file)), { code: "ENOENT" });
const sourcePins = {};
for (const [file, digest] of Object.entries(report.sourceHashes)) {
  sourcePins[file] = sha(await readFile(path.join(root, file))); assert.equal(sourcePins[file], digest, file);
}
const supplementRaw = await readFile(path.join(root, supplementPath)); assert.ok(supplementRaw.length <= 32768);
const supplement = JSON.parse(supplementRaw);
assert.equal(supplement.status, "incomplete-original-audio-supplement"); assert.equal(supplement.driver.terminalObserved, true);
assert.deepEqual(supplement.runs, []); assert.equal(supplement.failure, null); assert.equal(supplement.guardPolls, 0);
assert.equal(supplement.driver.pid, 37064); assert.equal(supplement.driver.bornUtc, "2026-10-06T21:41:32.4486880Z");
for (const key of ["protectedSourceUnchanged", "ownedRuntimeRemoved", "ownedNativeReadersAbsent"]) assert.equal(supplement.cleanup[key], true);
assert.equal(supplement.generatedMediaCopies, 0); assert.equal(supplement.browserConversionsStarted, 0);
for (const [file, digest] of Object.entries(supplement.sourcePins)) {
  assert.equal(sha(await readFile(path.join(root, file))), digest, file); sourcePins[file] = digest;
}
sourcePins["scripts/freeze-mpeg2-static-ui-failure.mjs"] = sha(await readFile(new URL(import.meta.url)));
const evidence = { recordedAt: new Date().toISOString(), status: "failed-strict-original-memory-after-static-ui-reuse",
  scope: "Actual same-source/settings/codecs full-original attempt; first run rejected at native full-tree peak, not completion/quality/audio/scaling acceptance",
  report: { path: reportPath, bytes: raw.length, sha256: sha(raw) },
  source: { path: "test.mkv", bytes: report.source.bytes, sha256: report.source.sha256 },
  browserVersion: report.browserVersion, requestedRuns: 3, attemptedRuns: 1, completedRuns: 0,
  formula: report.formula, limitMiB: 250, incrementalPrivateMiB: run.incrementalPrivateMiB,
  startupSettlement: report.startupSettlement, blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle,
  fullPeak: peak, peakIdentities, nativeValidSamples: run.nativePeaks.validSamples, nativeUnavailableSamples: run.nativePeaks.unavailableSamples,
  rendererAttribution: { nativePeakProcess: renderer.native, matchingLaterCimIdentity: renderer.cim,
    laterSampleTimestamp: later.timestamp, laterSamplerElapsedMs: later.samplerElapsedMs,
    laterFullTreePrivateBytes: later.privateBytes, laterAccessibleRealms: later.cdpIsolateHeaps,
    caveat: "CIM/realm samples begin after the actual native peak and do not identify its allocation source. No model service among these nine peak processes. No callsite or compiler/buffer/DOM attribution is inferred." },
  candidateDecoderSha256: report.manifest.artifacts["within-mpeg2-split.wasm"], aggregateWasmMemoryBytes: 48 * MiB,
  lastPreCancellationMetrics: run.state.metrics, lastPreCancellationPhase: run.state.phase,
  phaseCaveat: "Private adapter invokes fresh MPEG2 encoding through the public remux selection; inherited Lossless remux text does NOT describe the private conversion. It is not a public codec profile.",
  splitFinalSamples: report.splitFinalSamples, nativeStackSamples: report.nativeStackSamples, failure: report.failure,
  forbiddenRequests: report.forbiddenRequests, cleanup: report.cleanup, restoredAssetPins, privateAssetsAbsent,
  runtimeDirectory: report.runtimeDirectory, ownedPids: report.ownedPids,
  supplementalAudio: { status: supplement.status, completedOutputsValidated: 0,
    report: { path: supplementPath, bytes: supplementRaw.length, sha256: sha(supplementRaw) },
    driver: supplement.driver, waitingPolls: supplement.waitingPolls, guardPolls: supplement.guardPolls, cleanup: supplement.cleanup,
    scope: "Parent terminated before any closed completed output existed. No full-original audio fidelity proof, no new conversion/copies." },
  uiCpuImprovementRetained: true, conversionSpeedAcceptance: false, allocationSource: null,
  publicAcceptance: false, completeOriginalConversion: false, completeChromiumMemoryAcceptance: false,
  independentCompletedOutputValidation: false, fullOriginalAudioValidation: false, baselineChanged: false,
  processesExcluded: 0, codecQualityChanged: false, heapLimitRaised: false,
  next: "Attribute the native renderer transient with bounded changed instrumentation before another original attempt; no unchanged retry, compiler/buffer/DOM guess, relaxed memory, changed quality, enlarged baseline or public promotion.", sourcePins };
const json = JSON.stringify(evidence, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 65536);
const output = path.join(root, "evidence/mpeg2-static-ui-original-failure-2026-10-07.json");
await writeFile(output, json, { flag: "wx" }); console.log(output);

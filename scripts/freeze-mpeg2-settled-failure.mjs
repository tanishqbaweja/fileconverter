// Preserve the strict failure before changing instrumentation; partial output is not acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reportPath = "outputs/reports/2026-10-06T15-11-11-965Z-private-mpeg2-split-settled-original-native-100ms.json";
const raw = await readFile(path.join(root, reportPath)); assert.ok(raw.length <= 8 * 1024 ** 2);
const report = JSON.parse(raw), run = report.runs[0], peak = run.nativePeaks.peak;
assert.equal(report.status, "failed"); assert.equal(report.diagnosticOnly, false);
assert.equal(report.requestedRuns, 3); assert.equal(report.runs.length, 1);
assert.equal(report.publicAcceptance, false); assert.equal(report.limitMiB, 250);
assert.equal(report.source.bytes, 2958573265);
assert.equal(report.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.equal(run.incrementalPrivateMiB, 277.97265625);
assert.equal(peak.processes.length, 9);
assert.equal(peak.privateBytes, peak.processes.reduce((total, process) => total + process.privateBytes, 0));
assert.equal((peak.privateBytes - report.blankBaseline.privateBytes) / 1048576, run.incrementalPrivateMiB);
assert.equal(report.startupSettlement.minimumMs, 300000);
assert.ok(report.startupSettlement.actualMs >= 300000);
assert.ok(report.blankBaseline.privateBytes < report.startupSettlement.earlyWindow.privateBytes);
assert.equal(report.startupSettlement.baselineInflated, false);
const renderer = peak.processes.find(process => process.pid === 43324); assert.ok(renderer);
assert.equal(renderer.privateBytes, 277508096);
const later = report.samples.find(sample => sample.timestamp === "2026-10-06T15:17:31.467Z"); assert.ok(later);
const identity = later.processes.find(process => process.pid === renderer.pid); assert.ok(identity);
assert.equal(identity.type, "renderer"); assert.equal(identity.parentPid, renderer.parentPid);
assert.ok(Math.abs(Date.parse(identity.createdAt) - Date.parse(renderer.createdAt)) < 1);
const peakIdentities = peak.processes.map(native => {
  const cim = later.processes.find(process => process.pid === native.pid && process.parentPid === native.parentPid &&
    Math.abs(Date.parse(process.createdAt) - Date.parse(native.createdAt)) < 1);
  assert.ok(cim, `Peak process identity ${native.pid}`);
  assert.notEqual(cim.utilitySubtype, "on_device_model.mojom.OnDeviceModelService");
  return { native, cim };
});
for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(report.cleanup[key], true, key);
assert.equal(report.cleanup.conversionQuiescence.terminalState, "cancelled");
assert.equal(run.independentValidation, null); assert.equal(run.recovery, null);
await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
const sourcePins = {};
for (const [file, digest] of Object.entries(report.sourceHashes)) {
  sourcePins[file] = sha(await readFile(path.join(root, file))); assert.equal(sourcePins[file], digest, file);
}
sourcePins["scripts/freeze-mpeg2-settled-failure.mjs"] = sha(await readFile(new URL(import.meta.url)));
const evidence = { recordedAt: new Date().toISOString(),
  scope: "Strict full-original failure after prospective blank settling; transient renderer allocation source remains unknown",
  publicAcceptance: false, completeOriginalConversion: false, completeChromiumMemoryAcceptance: false,
  requestedRuns: 3, attemptedRuns: 1, source: report.source, browserVersion: report.browserVersion,
  report: { path: reportPath, bytes: raw.length, sha256: sha(raw) },
  candidateDecoderSha256: report.manifest.artifacts["within-mpeg2-split.wasm"],
  aggregateWasmMemoryBytes: report.manifest.aggregateWasmMemoryBytes,
  formula: report.formula, limitMiB: 250, startupSettlement: report.startupSettlement,
  blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle,
  fullPeak: peak, peakIdentities, incrementalPrivateMiB: run.incrementalPrivateMiB,
  rendererAttribution: { nativePeakProcess: renderer, matchingLaterCimIdentity: identity,
    laterSampleTimestamp: later.timestamp, laterPrivateBytes: later.privateBytes,
    laterAccessibleRealms: later.cdpIsolateHeaps,
    caveat: "Later heap and CIM samples are not allocation-time measurements. Renderer identity is proven, allocation cause is unknown; no model service among these nine peak processes." },
  failure: report.failure, lastPreCancellationState: run.state, splitFinalSamples: report.splitFinalSamples,
  nativeStackSamples: report.nativeStackSamples, independentCompletedOutputValidation: false,
  forbiddenRequests: report.forbiddenRequests, cleanup: report.cleanup, ownedPids: report.ownedPids,
  runtimeDirectory: report.runtimeDirectory, baselineChanged: false, processesExcluded: 0,
  codecQualityChanged: false, heapLimitRaised: false, allocationSource: null,
  next: "Bounded memory-infra/realm attribution prerequisite before one changed full-original diagnostic. No unchanged retry, process exclusion, new model/GPU flags, enlarged denominator or heap/quality relaxation.",
  sourcePins };
const json = JSON.stringify(evidence, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 64 * 1024);
const output = path.join(root, "evidence/mpeg2-settled-original-failure-2026-10-06.json");
await writeFile(output, json, { flag: "wx" }); console.log(output);

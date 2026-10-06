// Preserve actual full-test failure; do not subtract an inconvenient process,
// change the baseline or reinterpret partial output as a completed conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reportPath = "outputs/reports/2026-10-06T14-53-05-322Z-private-mpeg2-split-single-navigation-native-100ms.json";
const raw = await readFile(path.join(root, reportPath)); assert.ok(raw.length <= 32 * 1024 * 1024);
const report = JSON.parse(raw), run = report.runs[0], peak = run.nativePeaks.peak;
assert.equal(report.status, "failed"); assert.equal(report.diagnosticOnly, false);
assert.equal(report.requestedRuns, 3); assert.equal(report.runs.length, 1);
assert.equal(report.publicAcceptance, false); assert.equal(report.limitMiB, 250);
assert.equal(report.source.bytes, 2958573265);
assert.equal(report.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.equal(run.incrementalPrivateMiB, 469.39453125);
assert.equal(peak.privateBytes, peak.processes.reduce((total, process) => total + process.privateBytes, 0));
assert.equal((peak.privateBytes - report.blankBaseline.privateBytes) / 1048576, run.incrementalPrivateMiB);
const newest = peak.processes.find(process => process.pid === 10728); assert.ok(newest);
const cim = report.samples.flatMap(sample => sample.processes ?? []).find(process => process.pid === newest.pid);
assert.ok(cim); assert.equal(cim.parentPid, newest.parentPid);
assert.ok(Math.abs(Date.parse(cim.createdAt) - Date.parse(newest.createdAt)) < 1);
assert.equal(cim.utilitySubtype, "on_device_model.mojom.OnDeviceModelService");
for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(report.cleanup[key], true, key);
assert.equal(report.cleanup.conversionQuiescence.terminalState, "cancelled");
await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
const sourcePins = {};
for (const [file, digest] of Object.entries(report.sourceHashes)) {
  sourcePins[file] = sha(await readFile(path.join(root, file))); assert.equal(sourcePins[file], digest, file);
}
sourcePins["scripts/freeze-mpeg2-aligned-full-failure.mjs"] = sha(await readFile(new URL(import.meta.url)));
const evidence = { recordedAt: new Date().toISOString(), scope: "Actual alignment candidate full-original attempt failed strict complete-Chromium memory gate; no codec OOM observed",
  publicAcceptance: false, completeOriginalConversion: false, completeChromiumMemoryAcceptance: false,
  requestedRuns: 3, attemptedRuns: 1, source: report.source, browserVersion: report.browserVersion,
  report: { path: reportPath, bytes: raw.length, sha256: sha(raw) },
  candidateDecoderSha256: report.manifest.artifacts["within-mpeg2-split.wasm"],
  aggregateWasmMemoryBytes: report.manifest.aggregateWasmMemoryBytes,
  formula: report.formula, limitMiB: 250, blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle,
  fullPeak: peak, incrementalPrivateMiB: run.incrementalPrivateMiB,
  newChildAttribution: { nativePeakProcess: newest, matchingCimIdentity: cim,
    caveat: "Process identity/subtype observed, causal trigger not yet established; all its bytes remain counted." },
  failure: report.failure, lastPreCancellationState: run.state, splitFinalSamples: report.splitFinalSamples,
  nativeStackSamples: report.nativeStackSamples, independentCompletedOutputValidation: false,
  forbiddenRequests: report.forbiddenRequests, cleanup: report.cleanup,
  ownedPids: report.ownedPids, runtimeDirectory: report.runtimeDirectory,
  baselineChanged: false, processesExcluded: 0, codecQualityChanged: false, heapLimitRaised: false,
  next: "Blank-only lifecycle control with identical flags/all descendants and no source/converter to test delayed-startup attribution. Do not retry unchanged conversion, disable model features or select a larger baseline to force a pass.",
  sourcePins };
const json = JSON.stringify(evidence, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 64 * 1024);
const output = path.join(root, "evidence/mpeg2-aligned-full-failure-2026-10-06.json");
await writeFile(output, json, { flag: "wx" }); console.log(output);

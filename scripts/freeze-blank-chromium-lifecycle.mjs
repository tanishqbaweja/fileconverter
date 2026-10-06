import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const file = "output/playwright/2026-10-06T15-00-41-508Z-blank-chromium-lifecycle.json";
const bytes = await readFile(path.join(root, file)), report = JSON.parse(bytes);
assert.equal(report.failure, null); assert.equal(report.converterLoaded, false);
assert.equal(report.originalFileRead, false); assert.equal(report.conversionsPerformed, 0);
assert.equal(report.identicalOriginalDriverFlags, true); assert.equal(report.onDeviceModelObserved, true);
assert.equal(report.durationMs, 300000); assert.equal(report.baselineAdjusted, false);
assert.equal(report.publicAcceptance, false);
assert.ok(report.lateWindowDiagnosticOnly.privateBytes < report.earlyStable.privateBytes,
  "The later quiet observation is lower, not an inflated denominator");
const phase = report.nativeMemory.phases.find(entry => entry.phase === "blank-only"), row = phase.peak;
const fullPeakProcesses = row[7].map(([index, privateBytes, rssBytes]) => ({ ...report.nativeMemory.identities[index], privateBytes, rssBytes }));
assert.equal(fullPeakProcesses.reduce((total, process) => total + process.privateBytes, 0), row[3]);
const model = report.samples.flatMap(sample => sample.processes ?? []).find(process => process.utilitySubtype === "on_device_model.mojom.OnDeviceModelService");
const actualModelPeak = fullPeakProcesses.find(process => process.pid === model.pid); assert.ok(actualModelPeak);
assert.ok(Math.abs(Date.parse(actualModelPeak.createdAt) - Date.parse(model.createdAt)) < 1);
const rootProcess = fullPeakProcesses.find(process => process.pid === report.ownedPids.chrome);
const delayMs = Date.parse(actualModelPeak.createdAt) - Date.parse(rootProcess.createdAt);
assert.ok(delayMs >= 179000 && delayMs <= 181000);
for (const flag of Object.values(report.cleanup)) assert.equal(flag, true);
await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
const sourcePins = { ...report.sourcePins };
for (const [source, digest] of Object.entries(sourcePins)) assert.equal(sha(await readFile(path.join(root, source))), digest, source);
sourcePins["scripts/freeze-blank-chromium-lifecycle.mjs"] = sha(await readFile(new URL(import.meta.url)));
// Browser /json/version independently gave this immutable Chromium revision.
const revision = "b859317bf11f6be47f9b7799ec690a0a42a1fb33", primarySources = [];
for (const name of ["components/optimization_guide/core/model_execution/performance_class.cc",
  "components/optimization_guide/core/optimization_guide_features.cc"]) {
  const url = `https://chromium.googlesource.com/chromium/src/+/${revision}/${name}?format=TEXT`;
  const response = await fetch(url); assert.ok(response.ok);
  const text = Buffer.from(await response.text(), "base64").toString("utf8"); assert.ok(Buffer.byteLength(text) <= 512 * 1024);
  if (name.endsWith("performance_class.cc")) assert.ok(text.includes("PerformanceClassifier::ScheduleEvaluation()") && text.includes("PostDelayedTask("));
  else assert.match(text, /GetOnDeviceStartupMetricDelay\(\)[\s\S]{0,300}base::Minutes\(3\)/);
  primarySources.push({ url, sourcePath: name, revision, sha256: sha(text), bytes: Buffer.byteLength(text),
    finding: name.endsWith("performance_class.cc") ? "Performance evaluation is scheduled after startup metric delay" : "Pinned source default startup metric delay is three minutes; actual measured child delay independently matches" });
}
const evidence = { recordedAt: new Date().toISOString(), scope: "Blank-only independent delayed-startup control, not conversion certification or retrospective baseline correction",
  report: { path: file, bytes: bytes.length, sha256: sha(bytes) }, browserVersion: report.browserVersion,
  durationMs: report.durationMs, fixedArguments: report.fixedArguments, identicalOriginalDriverFlags: true,
  converterLoaded: false, originalFileRead: false, conversionsPerformed: 0, publicAcceptance: false,
  baselineAdjusted: false, processesExcluded: 0, earlyStable: report.earlyStable,
  laterQuietWindowDiagnosticOnly: report.lateWindowDiagnosticOnly,
  blankOnlyPeak: { timestamp: row[1], privateBytes: row[3], rssBytes: row[4], processes: fullPeakProcesses },
  blankOnlyIncreaseAboveEarlyWindowMiB: (row[3] - report.earlyStable.privateBytes) / 1048576,
  delayedModel: { actualNativePeakProcess: actualModelPeak, matchedCimIdentity: model, millisecondsAfterChromeLaunch: delayMs },
  validNativeSamples: phase.validSamples, unavailableNativeSamples: phase.unavailableSamples,
  missingSamplesRemainNull: true, primarySources, cleanup: report.cleanup, ownedPids: report.ownedPids,
  runtimeDirectory: report.runtimeDirectory, sourcePins,
  next: "A prospective fixed five-minute blank startup settling period plus stable same-instance baseline, with unchanged flags/all-process counting/250MiB gate and recorded startup samples. Keep the prior full failure; never subtract the service or use its transient peak as denominator." };
const output = path.join(root, "evidence/blank-chromium-lifecycle-2026-10-06.json");
const json = JSON.stringify(evidence, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 32768);
await writeFile(output, json, { flag: "wx" }); console.log(output);

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { summarizeUtilityActivity } from "./lib/chromium-utility-summary.mjs";

const root = path.resolve(import.meta.dirname, "..");
const [idleRelative, blankRelative, conversionRelative] = process.argv.slice(2);
assert.match(idleRelative ?? "", /^outputs\/reports\/[^/]+-chromium-utility-isolation\.json$/);
assert.match(blankRelative ?? "", /^outputs\/reports\/[^/]+-chromium-utility-isolation\.json$/);
if (conversionRelative) assert.match(conversionRelative, /^outputs\/reports\/[^/]+-private-h264-720p-memory\.json$/);
async function describe(relative) {
  const bytes = await readFile(path.join(root, relative)), report = JSON.parse(bytes);
  assert.equal(report.publicProfilesChanged, false);
  return { rawReport: relative, rawReportSha256: createHash("sha256").update(bytes).digest("hex"),
    scope: report.scope, status: report.status, browserVersion: report.browserVersion,
    sourceHashesAsExecuted: report.sourceHashes, cleanup: report.cleanup,
    activity: summarizeUtilityActivity(report.samples), report };
}
const idle = await describe(idleRelative);
assert.equal(idle.report.inputFilesSelected, 0); assert.equal(idle.report.conversionsPerformed, 0);
assert.equal(idle.report.cleanup.ownedProfileTempAndServerRemoved, true);
idle.requestDiagnostics = idle.report.requestDiagnostics;
delete idle.report;
const blankOnly = await describe(blankRelative);
assert.equal(blankOnly.report.mode, "blank-only-240s");
assert.equal(blankOnly.report.inputFilesSelected, 0); assert.equal(blankOnly.report.conversionsPerformed, 0);
assert.ok(blankOnly.report.samples.every((sample) => sample.phase === "blank-only"));
blankOnly.requestDiagnostics = blankOnly.report.requestDiagnostics;
delete blankOnly.report;
let conversion = null;
if (conversionRelative) {
  conversion = await describe(conversionRelative);
  const report = conversion.report;
  assert.equal(report.primaryLimitMiB, 250);
  assert.equal(report.source.sha256, "938eb61229f60a434cc3fede71829e96c30a1d42a64a468d7efc2c7a43622839");
  assert.equal(report.asBuiltManifest.artifacts["within-h264.wasm"], "73ba180c4e49522081b0148143b13b09ee8a0e8e2eebcf1d7461691d5b7dfd37");
  Object.assign(conversion, { blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle,
    source: { bytes: report.source.bytes, sha256: report.source.sha256 }, formula: report.formula,
    primaryLimitMiB: report.primaryLimitMiB, runs: report.runs, actualWasmMemoryLimits: report.actualWasmMemoryLimits,
    forbiddenRequests: report.forbiddenRequests, browserLocalRequests: report.browserLocalRequests, failure: report.failure,
    asBuiltManifest: report.asBuiltManifest,
  });
  // Keep the entire timeline in compact rows, including unavailable observations.
  conversion.treeTimelineColumns = ["timestamp", "elapsedMs", "phase", "privateBytes", "rssBytes"];
  conversion.treeTimeline = report.samples.map((sample) => conversion.treeTimelineColumns.map((key) => sample[key] ?? null));
  delete conversion.report;
}
assert.ok(!(await readdir(path.join(root, "work"))).some((name) => name.startsWith("chromium-utility-diagnostic-") || name.startsWith("h264-memory-")));
await assert.rejects(stat(path.join(root, "dist/client/engines/remux/_candidate_h264_base.mjs")), { code: "ENOENT" });
const evidence = { recordedAt: new Date().toISOString(), requirement: "M-04", status: "utility-service-diagnosis-only",
  recordingSources: Object.fromEntries(await Promise.all(["scripts/record-h264-utility-diagnosis.mjs",
    "scripts/lib/chromium-utility-summary.mjs"].map(async (file) => [file,
      createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")]))),
  idle, blankOnly, conversion, publicAcceptance: false, historical32MiBRejectionUnchanged: true,
  chromiumSourceContext: [
    { url: "https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/optimization_guide/model_execution/optimization_guide_global_state.cc",
      finding: "Browser-global construction schedules PerformanceClassifier evaluation." },
    { url: "https://raw.githubusercontent.com/chromium/chromium/main/components/optimization_guide/core/model_execution/performance_class.cc",
      finding: "ScheduleEvaluation posts a delayed device/performance query to the model service; fresh profiles need a performance-class update." },
    { url: "https://raw.githubusercontent.com/chromium/chromium/main/components/optimization_guide/core/optimization_guide_features.cc",
      finding: "GetOnDeviceStartupMetricDelay defaults to three minutes." },
    { url: "https://raw.githubusercontent.com/chromium/chromium/main/services/on_device_model/on_device_model_service.cc",
      finding: "GetDeviceAndPerformanceInfo calls the backend on a background task." },
  ],
  sourceContextLimitation: "Upstream source explains a matching startup mechanism, not proof of which private backend call the installed binary executed. Runtime subtype, timing and private memory are independently observed below.",
  caveats: ["Idle observations do not establish conversion acceptance or replace the original stable blank baseline.",
    "A newly observed subtype cannot retrospectively identify the previously unlabelled utility PID.",
    "Utility attribution is diagnostic; every Chromium descendant remains in the primary total.",
    "No codec settings, browser feature flags, fidelity gates, file sizes or memory limits changed for this diagnosis."],
};
const output = path.join(root, "evidence/h264-utility-diagnosis-2026-10-04.json");
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${output}\n`);

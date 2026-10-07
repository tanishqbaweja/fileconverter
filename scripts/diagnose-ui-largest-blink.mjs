import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeDetailedBlinkAttribution } from "./lib/largest-blink-attribution-recipe.mjs";
import { makeUiLargestBlinkControl } from "./lib/ui-largest-blink-recipe.mjs";
import { joinUiLargestBlinkTypes } from "./lib/ui-largest-blink-join.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const runtime = await createOwnedRuntimeScratch("ui-largest-blink-driver-");
let generatedHelper, generatedControl, report, rawReportPath;
try {
  generatedHelper = makeDetailedBlinkAttribution(await readFile(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs"), "utf8"), root);
  const helper = path.join(runtime.directory, "attribution.mjs"); await writeFile(helper, generatedHelper, { flag: "wx" });
  generatedControl = makeUiLargestBlinkControl(await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8"), root, pathToFileURL(helper).href);
  const driver = path.join(runtime.directory, "control.mjs"); await writeFile(driver, generatedControl, { flag: "wx" });
  const completed = await import(pathToFileURL(driver).href); report = completed.completedReport;
  rawReportPath = path.relative(root, completed.completedReportPath).replaceAll("\\", "/");
} finally { await runtime.close(); }
await assert.rejects(access(runtime.directory), { code: "ENOENT" }); assert.ok(report && rawReportPath);
const complete = report.traceReports?.length === 2 && report.traceReports.every(t => t.status === "completed-diagnostic");
const joined = complete ? joinUiLargestBlinkTypes(report.traceReports, report.rows) : null;
const raw = await readFile(path.join(root, rawReportPath));
const proof = { recordedAt: new Date().toISOString(), status: report.status, scope: report.scope, browserVersion: report.browserVersion,
  rawReport: { path: rawReportPath, bytes: raw.length, sha256: sha(raw) },
  generatedSources: { helper: generatedHelper, control: generatedControl },
  generatedSourceHashes: { helper: sha(generatedHelper), control: sha(generatedControl) }, sourcePins: {
    ...report.sourcePins, "scripts/lib/ui-largest-blink-join.mjs": sha(await readFile(path.join(root, "scripts/lib/ui-largest-blink-join.mjs"))) },
  rows: report.rows, traces: report.traceReports?.map(t => ({ status: t.status, limits: t.limits, trace: t.trace,
    dumps: t.dumps, allocatorSummary: t.allocatorSummary, realmRows: t.realmRows.length,
    realmRowsEvicted: t.realmRowsEvicted, samplingError: t.samplingError })) ?? [], joined,
  failure: report.failure, cleanupErrors: report.cleanupErrors, cleanup: report.cleanup, outerGeneratedRuntimeRemoved: true,
  forbidden: report.forbidden, originalSourceBytes: report.originalSourceBytes, originalSourceSha256: report.originalSourceSha256,
  conversionsPerformed: 0, generatedMediaCopies: 0, noForcedGc: true, publicAcceptance: false,
  completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false, allocationSourceOfOriginalFailure: null,
  caveat: "Two separately closed one-dump sessions with unchanged4MiB/16MiB caps. Actual UI workflow only, not conversion. Partial largest64 type intersection; absent types unavailable, never0. Native PID/parent/birth matched, trace provides no birth. Nondeterministic object counts may include garbage. No all-live-object, leak, callsite, original-conversion-cause or stable blank/continuous peak/speed acceptance.",
};
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 1048576);
const file = path.join(root, "evidence/ui-largest-blink-types-2026-10-07.json"); await writeFile(file, json, { flag: "wx" });
console.log(JSON.stringify({ file, status: proof.status, traces: proof.traces.map(t => t.trace), cleanup: proof.cleanup,
  failure: proof.failure, joined: joined?.map(p => ({ pid: p.pid, type: p.nativeType,
    largestIncreases: p.types.filter(t => t.deltaAllocatedObjectsBytes > 0).slice(0, 5) })) ?? null }));
if (proof.status !== "completed-diagnostic") process.exitCode = 1;

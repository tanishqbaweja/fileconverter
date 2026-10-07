// Changed, short production UI measurement. Not a full conversion retry.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeCompleteBlinkAttribution } from "./lib/complete-blink-attribution-recipe.mjs";
import { makeUiCompleteBlinkControl } from "./lib/ui-complete-blink-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const runtime = await createOwnedRuntimeScratch("ui-complete-blink-driver-");
let generatedHelper, generatedControl, report, rawReportPath;
try {
  generatedHelper = makeCompleteBlinkAttribution(await readFile(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs"), "utf8"), root);
  const helper = path.join(runtime.directory, "attribution.mjs"); await writeFile(helper, generatedHelper, { flag: "wx" });
  generatedControl = makeUiCompleteBlinkControl(await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8"), root, pathToFileURL(helper).href);
  const driver = path.join(runtime.directory, "control.mjs"); await writeFile(driver, generatedControl, { flag: "wx" });
  const completed = await import(pathToFileURL(driver).href);
  report = completed.completedReport;
  rawReportPath = path.relative(root, completed.completedReportPath).replaceAll("\\", "/");
} finally { await runtime.close(); }
await assert.rejects(access(runtime.directory), { code: "ENOENT" });
assert.ok(report && rawReportPath);
const heaps = report.traceReport?.allocatorSummary?.flatMap(d => d.processes.flatMap(p =>
  (p.blinkHeapStatistics ?? []).map(h => ({ phase: d.phase, pid: p.pid, traceName: p.traceName,
    osPrivateBytesBeforeDump: p.osPrivateBytesBeforeDump, tracePrivateFootprintBytes: p.tracePrivateFootprintBytes, ...h })))) ?? [];
const raw = await readFile(path.join(root, rawReportPath));
const proof = { recordedAt: new Date().toISOString(), status: report.status, scope: report.scope,
  rawReport: { path: rawReportPath, bytes: raw.length, sha256: sha(raw) }, browserVersion: report.browserVersion,
  generatedSources: { helper: generatedHelper, control: generatedControl },
  generatedSourceHashes: { helper: sha(generatedHelper), control: sha(generatedControl) }, sourcePins: report.sourcePins,
  rows: report.rows, trace: { status: report.traceReport?.status ?? null, limits: report.traceReport?.limits ?? null,
    trace: report.traceReport?.trace ?? null, dumps: report.traceReport?.dumps ?? null,
    allocatorSummary: report.traceReport?.allocatorSummary ?? null,
    realmRows: report.traceReport?.realmRows?.length ?? null, realmRowsEvicted: report.traceReport?.realmRowsEvicted ?? null,
    samplingError: report.traceReport?.samplingError ?? null }, heaps,
  failure: report.failure, cleanupErrors: report.cleanupErrors, cleanup: report.cleanup, outerGeneratedRuntimeRemoved: true,
  originalSourceBytes: report.originalSourceBytes, originalSourceSha256: report.originalSourceSha256,
  forbidden: report.forbidden, conversionsPerformed: 0, generatedMediaCopies: 0, noForcedGc: true,
  publicAcceptance: false, completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false,
  allocationSourceOfOriginalFailure: null, summedAllocatorTotal: null,
  caveat: "Actual UI inspection/selections only. Snapshots are not continuous native peaks or a stable blank acceptance baseline. Nondeterministic allocated-object bytes may include garbage; provider values overlap. Navigation can change renderer identity. No conversion, callsite attribution, leak proof, memory fix or speed acceptance.",
};
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 524288);
const file = path.join(root, "evidence/ui-complete-blink-heap-2026-10-07.json");
await writeFile(file, json, { flag: "wx" });
console.log(JSON.stringify({ file, status: proof.status, heaps, cleanup: proof.cleanup, cleanupErrors: proof.cleanupErrors }));
if (proof.status !== "completed-diagnostic") process.exitCode = 1;

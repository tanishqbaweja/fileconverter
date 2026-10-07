import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeDetailedBlinkAttribution } from "./lib/detailed-blink-attribution-recipe.mjs";
import { makeSingleDetailedBlinkControl } from "./lib/single-detailed-blink-control-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const runtime = await createOwnedRuntimeScratch("single-detailed-blink-driver-");
let generatedHelper, generatedControl, report, rawReportPath;
try {
  generatedHelper = makeDetailedBlinkAttribution(await readFile(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs"), "utf8"), root);
  const helper = path.join(runtime.directory, "attribution.mjs"); await writeFile(helper, generatedHelper, { flag: "wx" });
  generatedControl = makeSingleDetailedBlinkControl(await readFile(path.join(root, "scripts/probe-native-burst-attribution.mjs"), "utf8"), root, pathToFileURL(helper).href);
  const driver = path.join(runtime.directory, "control.mjs"); await writeFile(driver, generatedControl, { flag: "wx" });
  const completed = await import(pathToFileURL(driver).href); report = completed.completedReport;
  rawReportPath = path.relative(root, completed.completedReportPath).replaceAll("\\", "/");
} finally { await runtime.close(); }
await assert.rejects(access(runtime.directory), { code: "ENOENT" }); assert.ok(report && rawReportPath);
const types = report.trace?.allocatorSummary?.flatMap(d => d.processes.flatMap(p =>
  (p.blinkTypeStatistics ?? []).map(t => ({ phase: d.phase, pid: p.pid, traceName: p.traceName, ...t })))) ?? [];
const available = types.some(t => t.objectCount > 0 && t.allocatedObjectsBytes > 0);
const raw = await readFile(path.join(root, rawReportPath));
const proof = { recordedAt: new Date().toISOString(), status: report.status === "completed-diagnostic" && available
  ? "completed-single-detailed-blink-type-control" : "failed-single-detailed-blink-type-control", scope: report.scope,
  rawReport: { path: rawReportPath, bytes: raw.length, sha256: sha(raw) }, browserVersion: report.browserVersion,
  generatedSources: { helper: generatedHelper, control: generatedControl },
  generatedSourceHashes: { helper: sha(generatedHelper), control: sha(generatedControl) }, sourcePins: report.sourcePins,
  trace: { status: report.trace?.status ?? null, limits: report.trace?.limits ?? null, trace: report.trace?.trace ?? null,
    dumps: report.trace?.dumps ?? null, allocatorSummary: report.trace?.allocatorSummary ?? null,
    realmRows: report.trace?.realmRows?.length ?? null, realmRowsEvicted: report.trace?.realmRowsEvicted ?? null },
  types, typeFieldsAvailable: available, syntheticAllocationBytes: report.syntheticAllocationBytes,
  nativeObserverStarted: false, failure: report.failure, errors: report.errors, cleanup: report.cleanup,
  outerGeneratedRuntimeRemoved: true, originalRead: false, converterLoaded: false, conversionsPerformed: 0,
  generatedMediaCopies: 0, noForcedGc: true, publicAcceptance: false, completeChromiumMemoryAcceptance: false,
  conversionSpeedAcceptance: false, allocationSourceOfOriginalFailure: null, summedAllocatorTotal: null,
  caveat: report.caveat,
};
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 1048576);
const file = path.join(root, "evidence/single-detailed-blink-type-control-2026-10-07.json");
await writeFile(file, json, { flag: "wx" });
console.log(JSON.stringify({ file, status: proof.status, trace: proof.trace.trace, types: types.length,
  distinctTypeNames: [...new Set(types.map(t => t.type))].slice(0, 20), cleanup: proof.cleanup, errors: proof.errors }));
if (proof.status !== "completed-single-detailed-blink-type-control") process.exitCode = 1;

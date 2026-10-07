// Short actual-browser feasibility gate for bounded detailed type statistics.
// No source/converter/conversion/forced-GC; never infer acceptance from this.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeDetailedBlinkAttribution, makeDetailedBlinkControl } from "./lib/detailed-blink-attribution-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const runtime = await createOwnedRuntimeScratch("detailed-blink-driver-");
let generatedHelper, generatedControl, report, rawReportPath;
try {
  generatedHelper = makeDetailedBlinkAttribution(await readFile(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs"), "utf8"), root);
  const helper = path.join(runtime.directory, "attribution.mjs"); await writeFile(helper, generatedHelper, { flag: "wx" });
  generatedControl = makeDetailedBlinkControl(await readFile(path.join(root, "scripts/probe-native-burst-attribution.mjs"), "utf8"), root, pathToFileURL(helper).href);
  const driver = path.join(runtime.directory, "control.mjs"); await writeFile(driver, generatedControl, { flag: "wx" });
  const completed = await import(pathToFileURL(driver).href);
  report = completed.completedReport;
  rawReportPath = path.relative(root, completed.completedReportPath).replaceAll("\\", "/");
} finally { await runtime.close(); }
await assert.rejects(access(runtime.directory), { code: "ENOENT" });
assert.ok(report && rawReportPath);
const types = report.trace?.allocatorSummary?.flatMap(d => d.processes.flatMap(p =>
  (p.blinkTypeStatistics ?? []).map(t => ({ phase: d.phase, pid: p.pid, traceName: p.traceName, ...t })))) ?? [];
const available = types.some(t => t.objectCount > 0 && t.allocatedObjectsBytes > 0);
const raw = await readFile(path.join(root, rawReportPath));
const proof = { recordedAt: new Date().toISOString(), status: report.status === "completed-diagnostic" && available
  ? "completed-detailed-blink-type-control" : "failed-detailed-blink-type-control", scope: report.scope,
  browserVersion: report.browserVersion, rawReport: { path: rawReportPath, bytes: raw.length, sha256: sha(raw) },
  generatedSources: { helper: generatedHelper, control: generatedControl },
  generatedSourceHashes: { helper: sha(generatedHelper), control: sha(generatedControl) }, sourcePins: report.sourcePins,
  trace: { status: report.trace?.status ?? null, limits: report.trace?.limits ?? null, trace: report.trace?.trace ?? null,
    dumps: report.trace?.dumps ?? null, allocatorSummary: report.trace?.allocatorSummary ?? null,
    realmRows: report.trace?.realmRows?.length ?? null, realmRowsEvicted: report.trace?.realmRowsEvicted ?? null,
    samplingError: report.trace?.samplingError ?? null },
  types, typeFieldsAvailable: available, native: { identities: report.native?.identities ?? null, sequence: report.native?.sequence ?? null,
    error: report.native?.error ?? null }, bursts: report.bursts, cleanup: report.cleanup, outerGeneratedRuntimeRemoved: true,
  failure: report.failure, errors: report.errors, originalRead: false, converterLoaded: false, conversionsPerformed: 0,
  generatedMediaCopies: 0, noForcedGc: true, publicAcceptance: false, completeChromiumMemoryAcceptance: false,
  conversionSpeedAcceptance: false, allocationSourceOfOriginalFailure: null, summedAllocatorTotal: null,
  providerSourceReference: "https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/platform/heap/blink_gc_memory_dump_provider.cc",
  caveat: "Explicit detailed-mode diagnostic changes instrumented memory/time. HEAD source is explanatory, not matched-build proof. Actual type strings may be build-hidden. Nondeterministic object statistics may include garbage and overlap provider totals; no live-object/callsite/original-cause or acceptance proof.",
};
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 1048576);
const file = path.join(root, "evidence/detailed-blink-type-control-2026-10-07.json");
await writeFile(file, json, { flag: "wx" });
console.log(JSON.stringify({ file, status: proof.status, trace: proof.trace.trace, types: types.length,
  distinctTypeNames: [...new Set(types.map(t => t.type))].slice(0, 16), cleanup: proof.cleanup, errors: proof.errors }));
if (proof.status !== "completed-detailed-blink-type-control") process.exitCode = 1;

// Short real-browser parser prerequisite only. No converter/user media/GC/build.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeCompleteBlinkAttribution, makeCompleteBlinkControl } from "./lib/complete-blink-attribution-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const runtime = await createOwnedRuntimeScratch("complete-blink-driver-");
let report = null, rawReportPath = null, generatedHelper = null, generatedControl = null;
try {
  generatedHelper = makeCompleteBlinkAttribution(await readFile(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs"), "utf8"), root);
  const helper = path.join(runtime.directory, "attribution.mjs"); await writeFile(helper, generatedHelper, { flag: "wx" });
  generatedControl = makeCompleteBlinkControl(await readFile(path.join(root, "scripts/probe-native-burst-attribution.mjs"), "utf8"), root, pathToFileURL(helper).href);
  const driver = path.join(runtime.directory, "control.mjs"); await writeFile(driver, generatedControl, { flag: "wx" });
  const completed = await import(pathToFileURL(driver).href);
  report = completed.completedReport; rawReportPath = path.relative(root, completed.completedReportPath).replaceAll("\\", "/");
} finally { await runtime.close(); }
await assert.rejects(access(runtime.directory), { code: "ENOENT" });
assert.ok(report && rawReportPath);
const rendererHeaps = report.trace?.allocatorSummary?.flatMap(d => d.processes
  .filter(p => p.traceName === "Renderer").flatMap(p => (p.blinkHeapStatistics ?? []).map(h => ({ phase: d.phase, pid: p.pid, ...h })))) ?? [];
const heapFieldsAvailable = rendererHeaps.some(h => h.name === "blink_gc/main/heap" &&
  h.residentBytes != null && h.committedBytes != null && h.allocatedObjectsBytes != null && h.pooledBytes != null);
const raw = await readFile(path.join(root, rawReportPath));
const proof = { recordedAt: new Date().toISOString(), status: report.status === "completed-diagnostic" && heapFieldsAvailable
  ? "completed-brief-blink-heap-control" : "failed-brief-blink-heap-control",
  scope: report.scope, browserVersion: report.browserVersion,
  rawReport: { path: rawReportPath, bytes: raw.length, sha256: sha(raw) },
  generatedSources: { helper: generatedHelper, control: generatedControl },
  generatedSourceHashes: { helper: sha(generatedHelper), control: sha(generatedControl) },
  sourcePins: report.sourcePins, outerGeneratedRuntimeRemoved: true,
  trace: { status: report.trace?.status ?? null, limits: report.trace?.limits ?? null,
    trace: report.trace?.trace ?? null, dumps: report.trace?.dumps ?? null,
    allocatorSummary: report.trace?.allocatorSummary ?? null,
    realmRows: report.trace?.realmRows.length ?? null, realmRowsEvicted: report.trace?.realmRowsEvicted ?? null },
  native: { identities: report.native?.identities ?? null, sequence: report.native?.sequence ?? null,
    error: report.native?.error ?? null, observerCpuDeltaMs: report.native?.observerCpuDeltaMs ?? null },
  bursts: report.bursts, rendererHeaps, heapFieldsAvailable, cleanup: report.cleanup,
  failure: report.failure, errors: report.errors, originalRead: false, converterLoaded: false,
  conversionsPerformed: 0, generatedMediaCopies: 0, publicAcceptance: false,
  completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false,
  noTraceModeOrBufferChange: true, noForcedGc: true, allocationSourceOfOriginalFailure: null,
  providerSourceReference: "https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/platform/heap/blink_gc_memory_dump_provider.cc",
  providerSourceCaveat: "HEAD source explains expected fields, not a verified match to this exact installed Chrome build. Runtime fields below are actually measured. Nondeterministic allocated-object totals may include garbage; resident minus allocated is not a callsite/causal fix.",
  next: "Use complete brief heap fields in a justified changed diagnostic, not another unchanged full conversion or a summed live-object claim." };
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 262144);
const file = path.join(root, "evidence/complete-blink-heap-control-2026-10-07.json");
await writeFile(file, json, { flag: "wx" });
console.log(JSON.stringify({ file, status: proof.status, heapFieldsAvailable, rendererHeaps,
  failure: report.failure, cleanup: report.cleanup, outerGeneratedRuntimeRemoved: true }));
if (proof.status !== "completed-brief-blink-heap-control") process.exitCode = 1;

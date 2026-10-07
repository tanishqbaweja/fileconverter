// Changed original diagnostic only, NEVER route/speed/fidelity acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeDetailedBlinkAttribution } from "./lib/largest-blink-attribution-recipe.mjs";
import { makeLargestBurstDriver } from "./lib/mpeg2-largest-burst-recipe.mjs";
import { assertLargestBurstPrerequisites } from "./lib/largest-burst-prerequisites.mjs";
import { joinNativeBurstDumps } from "./lib/native-burst-dump-join.mjs";
import { joinUiLargestBlinkTypes } from "./lib/ui-largest-blink-join.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const prerequisites = await Promise.all(["evidence/largest-blink-type-control-2026-10-07.json", "evidence/ui-largest-blink-types-2026-10-07.json"]
  .map(async file => JSON.parse(await readFile(path.join(root, file)))));
assertLargestBurstPrerequisites(...prerequisites);
for (const proof of prerequisites) {
  for (const [name, digest] of Object.entries(proof.sourcePins)) assert.equal(sha(await readFile(path.join(root, name))), digest, name);
}
const prior = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-burst-attribution-2026-10-07.json")));
assert.equal(prior.originalUninstrumentedFailureCause, null); assert.equal(prior.completeOriginalConversion, false);
for (const [name, digest] of Object.entries(prior.sourcePins)) assert.equal(sha(await readFile(path.join(root, name))), digest, name);
assert.equal(process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR, "mpeg2-split-pipeline-37479749443");
const runtime = await createOwnedRuntimeScratch("mpeg2-largest-burst-driver-");
let generatedHelper, generatedDriver, report, rawPath;
try {
  generatedHelper = makeDetailedBlinkAttribution(await readFile(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs"), "utf8"), root);
  const helper = path.join(runtime.directory, "attribution.mjs"); await writeFile(helper, generatedHelper, { flag: "wx" });
  generatedDriver = makeLargestBurstDriver(await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8"),
    root, specifier => import.meta.resolve(specifier), pathToFileURL(helper).href);
  const driver = path.join(runtime.directory, "control.mjs"); await writeFile(driver, generatedDriver, { flag: "wx" });
  const completed = await import(pathToFileURL(driver).href); report = completed.completedReport; rawPath = completed.completedReportPath;
} finally { await runtime.close(); }
await assert.rejects(access(runtime.directory), { code: "ENOENT" }); assert.ok(report && rawPath);
const attribution = report.rendererAttributionResult;
const joined = attribution && report.nativeBurstResult ? joinNativeBurstDumps(report.nativeBurstResult, attribution) : null;
const traces = attribution?.sessions.filter(row => row.trace?.status === "completed-diagnostic").map(row => row.trace) ?? [];
const baseline = traces.find(t => t.dumps[0]?.phase === "pre-conversion-attribution");
const largestTypeChanges = baseline ? traces.filter(t => t !== baseline).map(t => ({ phase: t.dumps[0].phase,
  joined: joinUiLargestBlinkTypes([baseline, t], [baseline.dumps[0], t.dumps[0]]) })) : [];
const native = report.nativeMemory;
const phaseRows = native?.phases.filter(p => ["pre-conversion-1", "conversion-1"].includes(p.phase)) ?? [];
const peak = phaseRows.map(p => p.peak).filter(Boolean).sort((a, b) => b[3] - a[3])[0] ?? null;
const decode = row => row ? { sequence: row[0], timestamp: row[1], phase: row[2], privateBytes: row[3], rssBytes: row[4],
  processes: row[7].map(([index, privateBytes, rssBytes]) => ({ ...native.identities[index], privateBytes, rssBytes })) } : null;
const raw = await readFile(rawPath);
const proof = { recordedAt: new Date().toISOString(), status: "terminal-private-largest-type-original-diagnostic-not-acceptance",
  rawReport: { path: path.relative(root, rawPath).replaceAll("\\", "/"), bytes: raw.length, sha256: sha(raw) },
  generatedSources: { helper: generatedHelper, driver: generatedDriver },
  generatedSourceHashes: { helper: sha(generatedHelper), driver: sha(generatedDriver) },
  sourcePins: report.sourceHashes, browserVersion: report.browserVersion, formula: report.formula, limitMiB: report.limitMiB,
  source: { path: "test.mkv", bytes: report.source.bytes, sha256: report.source.sha256 },
  startupSettlement: report.startupSettlement, blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle,
  finalNativePeak: decode(peak), finalNativeIncrementalPrivateMiB: peak && report.blankBaseline ? (peak[3] - report.blankBaseline.privateBytes) / 1048576 : null,
  nativeObserverError: native?.error ?? null, nativePhaseCoverage: phaseRows.map(p => ({ phase: p.phase, validSamples: p.validSamples, unavailableSamples: p.unavailableSamples })),
  nativeBursts: report.nativeBurstResult, joined, largestTypeChanges, skippedBurstDumps: report.skippedBurstDumps,
  attribution: attribution ? { ...attribution, sessions: attribution.sessions.map(row => ({ ...row,
    trace: row.trace ? { ...row.trace, realmRows: row.trace.realmRows.length } : null })) } : null,
  lastPreCancellationMetrics: report.runs[0]?.state?.metrics ?? null,
  splitFinalSamples: report.splitFinalSamples, nativeStackSamples: report.nativeStackSamples,
  failure: report.failure, cleanup: report.cleanup, outerGeneratedRuntimeRemoved: true,
  forbiddenRequests: report.forbiddenRequests, ownedPids: report.ownedPids,
  sampledNativeIdentities: native?.identities ?? [], runtimeDirectory: report.runtimeDirectory,
  publicAcceptance: false, completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false,
  completeOriginalConversion: report.runs[0]?.state?.jobState === "complete", originalUninstrumentedFailureCause: null,
  caveat: "Independent detailed traces perturb memory and time. Native sampler remains live during finalization; no process excluded. Type inventory is partial largest64; absent is not zero, nondeterministic may include garbage, overlapping providers cannot be summed. Dumps requested after native trigger are not snapshots at the spike and do not prove the earlier uninstrumented cause. No forced GC, weakened settings, native conversion, Docker or new public profile." };
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 4 * 1048576);
const file = path.join(root, "evidence/mpeg2-largest-burst-attribution-2026-10-07.json"); await writeFile(file, json, { flag: "wx" });
console.log(JSON.stringify({ file, failure: proof.failure?.message, peakMiB: proof.finalNativeIncrementalPrivateMiB,
  sessions: attribution?.sessions.length, traceStatuses: attribution?.sessions.map(r => r.trace?.status), cleanup: proof.cleanup }));

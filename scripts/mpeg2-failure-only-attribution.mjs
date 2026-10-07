// Ready for ONE changed original only AFTER real post-failure control and host
// safety pass. No public acceptance from any diagnostic or partial completion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { makeDetailedBlinkAttribution } from "./lib/largest-blink-attribution-recipe.mjs";
import { makeFailureOnlyOriginalDriver } from "./lib/mpeg2-failure-only-attribution-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const host = await inspectStressHostMemory(); console.log(JSON.stringify({ scope: "read-only-original-preflight", host }));
if (!host.safeToStart) { console.log("Held before original/browser/profile/staging. No restart or lowered safety check."); process.exitCode = 1; }
else {
  const control = JSON.parse(await readFile(path.join(root, "evidence/native-budget-failure-control-retry-2026-10-07.json")));
  assert.equal(control.status, "completed-diagnostic"); assert.equal(control.traceStartsBeforeAllocation, 0); assert.equal(control.traceStarts, 1);
  assert.ok(control.nativeFailureCapture.firstFailure.incrementalPrivateMiB > 250); assert.equal(control.nativeFailureCapture.callback.result.success, true);
  assert.equal(control.traceReport.sessions.length, 1); assert.equal(control.traceReport.sessions[0].trace.status, "completed-diagnostic");
  assert.equal(control.traceReport.sessions[0].trace.trace.dataLossOccurred, false);
  assert.equal(control.originalRead, false); assert.equal(control.converterLoaded, false);
  for (const value of Object.values(control.cleanup)) assert.equal(value, true);
  const prior = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-largest-burst-attribution-2026-10-07.json")));
  assert.equal(prior.completeOriginalConversion, false); assert.equal(prior.failure.message, "Diagnostic callback unavailable or busy; record failure rather than queue requests");
  assert.equal(prior.originalUninstrumentedFailureCause, null);
  for (const proof of [control, prior]) for (const [file, digest] of Object.entries(proof.sourcePins))
    assert.equal(sha(await readFile(path.join(root, file))), digest, file);
  assert.equal(process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR, "mpeg2-split-pipeline-37479749443");
  await assert.rejects(access(path.join(root, "evidence/mpeg2-failure-only-attribution-2026-10-07.json")), { code: "ENOENT" });
  const runtime = await createOwnedRuntimeScratch("mpeg2-failure-only-driver-");
  let generatedHelper, generatedDriver, report, rawPath;
  try {
    generatedHelper = makeDetailedBlinkAttribution(await readFile(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs"), "utf8"), root);
    const helper = path.join(runtime.directory, "attribution.mjs"); await writeFile(helper, generatedHelper, { flag: "wx" });
    generatedDriver = makeFailureOnlyOriginalDriver(await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8"),
      root, specifier => import.meta.resolve(specifier), pathToFileURL(helper).href);
    const file = path.join(runtime.directory, "control.mjs"); await writeFile(file, generatedDriver, { flag: "wx" });
    const completed = await import(pathToFileURL(file).href); report = completed.completedReport; rawPath = completed.completedReportPath;
  } finally { await runtime.close(); }
  await assert.rejects(access(runtime.directory), { code: "ENOENT" }); assert.ok(report && rawPath);
  const native = report.nativeMemory, attribution = report.rendererAttributionResult, capture = report.nativeFailureCapture;
  const phases = native?.phases.filter(p => ["pre-conversion-1", "conversion-1"].includes(p.phase)) ?? [];
  const peak = phases.map(p => p.peak).filter(Boolean).sort((a, b) => b[3] - a[3])[0] ?? null;
  const decode = row => row ? { sequence: row[0], timestamp: row[1], phase: row[2], privateBytes: row[3], rssBytes: row[4],
    processes: row[7].map(([index, privateBytes, rssBytes]) => ({ ...native.identities[index], privateBytes, rssBytes })) } : null;
  const raw = await readFile(rawPath);
  const trace = attribution?.sessions[0]?.trace ?? null, dump = trace?.dumps[0] ?? null;
  const nativeAt = capture?.firstFailure?.after.timestamp;
  const lag = at => nativeAt && at ? Date.parse(at) - Date.parse(nativeAt) : null;
  const proof = { recordedAt: new Date().toISOString(), status: "terminal-private-one-native-failure-original-diagnostic-not-acceptance",
    rawReport: { path: path.relative(root, rawPath).replaceAll("\\", "/"), bytes: raw.length, sha256: sha(raw) },
    generatedSources: { helper: generatedHelper, driver: generatedDriver },
    generatedSourceHashes: { helper: sha(generatedHelper), driver: sha(generatedDriver) }, sourcePins: report.sourceHashes,
    browserVersion: report.browserVersion, hostPreflight: host, formula: report.formula, limitMiB: report.limitMiB,
    source: { path: "test.mkv", bytes: report.source.bytes, sha256: report.source.sha256 },
    startupSettlement: report.startupSettlement, blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle,
    nativeFailureCapture: capture, preTraceNativeFailure: capture?.firstFailure ?? null,
    traceRequestedOnlyAfterActualNativeFailure: Boolean(nativeAt && dump && lag(dump.timestamp) >= 0),
    acquisitionToDumpRequestMs: lag(dump?.timestamp), acquisitionToDumpCompletionMs: lag(dump?.finishedAt),
    nativePeakIncludingTraceFinalization: decode(peak),
    nativePeakIncludingTraceIncrementalPrivateMiB: peak && report.blankBaseline ? (peak[3] - report.blankBaseline.privateBytes) / 1048576 : null,
    nativeObserverError: native?.error ?? null,
    nativePhaseCoverage: phases.map(p => ({ phase: p.phase, validSamples: p.validSamples, unavailableSamples: p.unavailableSamples })),
    attribution: attribution && { ...attribution, sessions: attribution.sessions.map(row => ({ ...row,
      trace: row.trace && { ...row.trace, realmRows: row.trace.realmRows.length } })) },
    noBeforeFailureTypeBaseline: true, typeDeltaFromAnotherRun: null,
    lastPreCancellationMetrics: report.runs[0]?.state?.metrics ?? null,
    splitFinalSamples: report.splitFinalSamples, nativeStackSamples: report.nativeStackSamples,
    failure: report.failure, cleanup: report.cleanup, outerGeneratedRuntimeRemoved: true,
    forbiddenRequests: report.forbiddenRequests, ownedPids: report.ownedPids,
    sampledNativeIdentities: native?.identities ?? [], runtimeDirectory: report.runtimeDirectory,
    completeOriginalConversion: report.runs[0]?.state?.jobState === "complete",
    publicAcceptance: false, completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false,
    noDocker: true, noForcedGc: true, originalUninstrumentedFailureCause: null, allocationObjectOrCallsite: null,
    caveat: "ONE actual full-tree native budget failure only; not every warmup burst. NO detailed trace before the failure. Subsequent dump/finalization still counted in separate full native peak, no process exclusions. Delayed partial largest64 types may contain garbage; no live/callsite/causal or matched-baseline type-delta claim. No forcedGC, quality change, native conversion, smaller source, weakened denominator, public profile or full-source acceptance from partial data." };
  const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 4 * 1048576);
  const file = path.join(root, "evidence/mpeg2-failure-only-attribution-2026-10-07.json"); await writeFile(file, json, { flag: "wx" });
  console.log(JSON.stringify({ file, failure: proof.failure?.message, originalNativeFailureMiB: capture?.firstFailure?.incrementalPrivateMiB,
    finalNativeMiB: proof.nativePeakIncludingTraceIncrementalPrivateMiB, cleanup: proof.cleanup }));
}

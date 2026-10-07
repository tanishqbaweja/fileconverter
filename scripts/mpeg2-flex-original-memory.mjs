// ONE changed full-original attempt; all three repeats/full validators remain required.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { makeFlexOriginalDriver } from "./lib/mpeg2-flex-original-recipe.mjs";
import { DYNAMIC_FLEX_CSS } from "./lib/ui-flex-layout-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = data => createHash("sha256").update(data).digest("hex");
const host = await inspectStressHostMemory(); console.log(JSON.stringify({ scope: "changed-flex-original-preflight", host }));
if (!host.safeToStart) { console.log("Held BEFORE original/profile/staging; no retry or reduced safety check"); process.exitCode = 1; }
else {
  await assert.rejects(access(path.join(root, "evidence/mpeg2-flex-original-2026-10-07.json")), { code: "ENOENT" });
  const analysis = JSON.parse(await readFile(path.join(root, "evidence/ui-flex-layout-analysis-2026-10-07.json")));
  assert.equal(analysis.identicalGeometryMarkupControls, true); assert.equal(analysis.geometryCases, 9);
  assert.equal(analysis.fullTreeImprovementProven, false); assert.equal(analysis.productionChanged, false);
  assert.ok(analysis.gridTrackGrowthReductionPercent > 90); assert.equal(analysis.originalFullSourceMemoryAcceptance, false);
  assert.equal(analysis.cleanup.fourScratchDirectoriesAbsent, true); assert.equal(analysis.cleanup.protectedFullPostHashMatches, true);
  const comparison = JSON.parse(await readFile(path.join(root, "evidence/ui-flex-layout-comparison-2026-10-07.json")));
  assert.equal(comparison.css, DYNAMIC_FLEX_CSS); assert.ok(comparison.geometry.every(row => row.maxDifferenceCssPixels === 0 && row.geometryPass));
  for (const proof of [analysis, ...await Promise.all(["grid", "flex"].map(async mode => JSON.parse(await readFile(path.join(root, `evidence/ui-${mode}-layout-2026-10-07.json`)))))])
    for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  assert.equal(process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR, "mpeg2-split-pipeline-37479749443");
  const runtime = await createOwnedRuntimeScratch("mpeg2-flex-original-driver-");
  let generated, report, rawPath;
  try {
    generated = makeFlexOriginalDriver(await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8"), root, s => import.meta.resolve(s));
    const file = path.join(runtime.directory, "full-source.mjs"); await writeFile(file, generated, { flag: "wx" });
    const completed = await import(pathToFileURL(file).href); report = completed.completedReport; rawPath = completed.completedReportPath;
  } finally { await runtime.close(); }
  await assert.rejects(access(runtime.directory), { code: "ENOENT" }); assert.ok(report && rawPath);
  const raw = await readFile(rawPath), conversionPhases = report.nativeMemory.phases.filter(p => /^pre-conversion-|^conversion-/.test(p.phase));
  const peaks = conversionPhases.map(p => p.peak).filter(Boolean).sort((a, b) => b[3] - a[3]);
  const peak = peaks[0] ?? null;
  const peakReport = peak && { sequence: peak[0], timestamp: peak[1], phase: peak[2], privateBytes: peak[3], rssBytes: peak[4],
    processes: peak[7].map(([index, privateBytes, rssBytes]) => ({ ...report.nativeMemory.identities[index], privateBytes, rssBytes })) };
  const domRows = report.samples.filter(s => s.dom).map(s => ({ phase: s.phase, timestamp: s.timestamp, jobState: s.jobState,
    dom: s.dom, cdpIsolateHeaps: s.cdpIsolateHeaps, metrics: s.metrics }));
  const proof = { recordedAt: new Date().toISOString(), status: "terminal-private-changed-flex-original-attempt-not-public-acceptance",
    rawStatus: report.status, rawReport: { path: path.relative(root, rawPath).replaceAll("\\", "/"), bytes: raw.length, sha256: sha(raw) },
    generatedSource: generated, generatedSourceSha256: sha(generated), sourcePins: report.sourceHashes,
    hostPreflight: host, source: { path: "test.mkv", bytes: report.source.bytes, sha256: report.source.sha256 },
    browserVersion: report.browserVersion, formula: report.formula, limitMiB: report.limitMiB, requestedRuns: report.requestedRuns,
    startupSettlement: report.startupSettlement, blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle,
    cssCandidate: report.cssCandidate, nativeFailureCapture: report.nativeFailureCapture,
    nativePeak: peakReport, nativePeakIncrementalMiB: peak && report.blankBaseline ? (peak[3] - report.blankBaseline.privateBytes) / 1048576 : null,
    nativeObserverError: report.nativeMemory.error, nativePhaseCoverage: conversionPhases.map(p => ({ phase: p.phase, validSamples: p.validSamples, unavailableSamples: p.unavailableSamples })),
    domSamplerReport: report.domSamplerReport, boundedDomRows: domRows, rawSamplesEvicted: report.samplesEvicted,
    runs: report.runs, splitFinalSamples: report.splitFinalSamples, nativeStackSamples: report.nativeStackSamples,
    failure: report.failure, cleanup: report.cleanup, forbiddenRequests: report.forbiddenRequests,
    ownedPids: report.ownedPids, sampledNativeIdentities: report.nativeMemory.identities,
    runtimeDirectory: report.runtimeDirectory, generatedRuntimeDirectory: runtime.directory, outerGeneratedRuntimeRemoved: true,
    completeOriginalConversions: report.runs.filter(r => r.state?.jobState === "complete" && r.independentValidation).length,
    threeRepeatPrivateSessionPassed: report.status === "passed-private-protected-session" && report.runs.length === 3 && report.runs.every(r => r.independentValidation && r.recovery),
    noDetailedHeapDump: true, noForcedGc: true, noDocker: true, publicAcceptance: false, conversionSpeedAcceptance: false,
    originalUninstrumentedFailureCause: null, allocationObjectOrCallsite: null,
    caveat: "Changed equivalent dynamic-control CSS only plus bounded actual DOM counters. ALL three full-source repetitions, six-hour per-run deadline, fixed32+16MiB/quality/all-process250MiB/lowerfive-minute blank/full independent validators/normal finally preserved. No smaller input/substituted streamcopy/native converter or public promotion. DOM counts may include garbage, targetId has no guaranteed native PID mapping, unavailable remainsnull. ONE first-native-budget-failure counter callback/no detailed dump/queue/GC; no allocation callsite or old failure cause inferred. Only actual completed and validated runs count." };
  const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 4 * 1048576);
  const file = path.join(root, "evidence/mpeg2-flex-original-2026-10-07.json"); await writeFile(file, json, { flag: "wx" });
  console.log(JSON.stringify({ file, failure: proof.failure?.message, nativePeakMiB: proof.nativePeakIncrementalMiB,
    completeOriginalConversions: proof.completeOriginalConversions, cleanup: proof.cleanup }));
}

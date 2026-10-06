import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const file = "outputs/reports/2026-10-06T15-37-13-908Z-private-mpeg2-renderer-attribution-native-100ms.json";
const raw = await readFile(path.join(root, file)); assert.ok(raw.length <= 8 * 1024 ** 2);
const report = JSON.parse(raw), run = report.runs[0], attribution = report.rendererAttributionResult;
assert.equal(report.status, "failed"); assert.equal(report.diagnosticOnly, true);
assert.equal(report.requestedRuns, 1); assert.equal(report.runs.length, 1);
assert.equal(run.incrementalPrivateMiB, 253.60546875); assert.equal(run.independentValidation, null);
assert.equal(attribution.status, "completed-diagnostic"); assert.equal(attribution.trace.dataLossOccurred, false);
assert.equal(attribution.trace.overflow, false); assert.equal(attribution.trace.serializedBytes, 3157576);
assert.equal(attribution.dumps.length, 3); assert.equal(attribution.realmRows.length, 327);
assert.equal(attribution.realmRowsEvicted, 0); assert.equal(attribution.samplingError, null);
const phase = report.nativeMemory.phases.find(value => value.phase === "conversion-1"); assert.ok(phase);
const row = phase.peak;
const finalNativePeak = { sequence: row[0], timestamp: row[1], phase: row[2], privateBytes: row[3],
  rssBytes: row[4], processes: row[7].map(([index, privateBytes, rssBytes]) => ({ ...report.nativeMemory.identities[index], privateBytes, rssBytes })) };
assert.equal(finalNativePeak.privateBytes, 508932096);
assert.equal(finalNativePeak.privateBytes, finalNativePeak.processes.reduce((sum, process) => sum + process.privateBytes, 0));
const realms = new Map();
for (const sample of attribution.realmRows) for (const target of sample.value.targets ?? []) {
  let entry = realms.get(target.targetId);
  if (!entry) { entry = { targetId: target.targetId, type: target.type, peaks: {} }; realms.set(target.targetId, entry); }
  for (const field of ["usedJSHeapBytes", "allocatedJSHeapBytes", "embedderHeapUsedBytes", "backingStorageBytes"])
    if (target[field] != null && (entry.peaks[field]?.bytes ?? -Infinity) < target[field])
      entry.peaks[field] = { bytes: target[field], startedAt: sample.startedAt, finishedAt: sample.finishedAt };
}
const rendererRows = attribution.allocatorSummary.map(dump => {
  const process = dump.processes.find(process => process.pid === 31872); assert.ok(process);
  assert.equal(process.osType, "renderer");
  return { phase: dump.phase, requestDumpGuid: dump.requestDumpGuid, traceIntervalMicroseconds: dump.traceIntervalMicroseconds,
    process, allocatorValuesOverlap: true, summedAllocatorTotal: null, acceptanceMetric: false };
});
assert.equal(rendererRows[0].process.allocators["blink_gc/main"].size, 17039440);
assert.equal(rendererRows[1].process.allocators["blink_gc/main"].size, 60162128);
assert.equal(rendererRows[2].process.allocators["blink_gc/main"].size, 60162128);
for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(report.cleanup[key], true, key);
assert.equal(report.cleanup.conversionQuiescence.terminalState, "cancelled");
await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
for (const [source, digest] of Object.entries(report.sourceHashes))
  assert.equal(sha(await readFile(path.join(root, source))), digest, source);
const evidence = { recordedAt: new Date().toISOString(), scope: "Actual original-source private renderer attribution; strict failure, not completed conversion",
  publicAcceptance: false, completeOriginalConversion: false, completeChromiumMemoryAcceptance: false,
  allocationObjectOrCallSite: null, causalFixProven: false, instrumentedMemoryAndTiming: true,
  source: report.source, browserVersion: report.browserVersion, requestedRuns: 1, attemptedRuns: 1,
  candidateDecoderSha256: report.manifest.artifacts["within-mpeg2-split.wasm"],
  report: { path: file, bytes: raw.length, sha256: sha(raw) }, formula: report.formula, limitMiB: report.limitMiB,
  startupSettlement: report.startupSettlement, blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle,
  gateTriggerPeak: run.nativePeaks.peak, gateTriggerIncrementalPrivateMiB: run.incrementalPrivateMiB,
  finalConversionPhasePeak: finalNativePeak,
  finalConversionPhaseIncrementalPrivateMiB: (finalNativePeak.privateBytes - report.blankBaseline.privateBytes) / 1048576,
  laterSamplingCaveat: "Conversion continued during bounded dump/trace finalization before normal cancellation. Final phase peak includes that interval and tracing-service allocations; neither number certifies memory or speed or explains the earlier uninstrumented peak.",
  trace: attribution.trace, attributionLimits: attribution.limits, dumps: attribution.dumps,
  allAllocatorRows: attribution.allocatorSummary, rendererRows, realmPeaks: [...realms.values()],
  realmSamples: { count: attribution.realmRows.length, evicted: attribution.realmRowsEvicted,
    sampleCoverageStart: attribution.realmRows[0].startedAt, sampleCoverageEnd: attribution.realmRows.at(-1).finishedAt },
  finding: "Main-thread Blink allocator increased from17039440 to60162128bytes during this diagnostic; sampled worker JS heap remained below3MiB. Allocation object/call-site and cause of the prior uninstrumented transient are not yet proven.",
  lastPreCancellationState: run.state, splitFinalSamples: report.splitFinalSamples,
  cleanup: report.cleanup, ownedPids: report.ownedPids, runtimeDirectory: report.runtimeDirectory,
  forbiddenRequests: report.forbiddenRequests, sourcePins: { ...report.sourceHashes,
    "scripts/freeze-mpeg2-renderer-attribution.mjs": sha(await readFile(new URL(import.meta.url))) },
  next: "Bounded DOM/native-allocation sampling control to identify main-thread object growth; no unchanged original retry, baseline/quality/heap relaxation or public promotion." };
const json = JSON.stringify(evidence, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 128 * 1024);
await writeFile(path.join(root, "evidence/mpeg2-renderer-attribution-2026-10-06.json"), json, { flag: "wx" });
console.log("Frozen actual renderer attribution with final phase peak and explicit unknown call-site");

// Read-only analysis of ONE terminal diagnostic. Never converts, launches or retries.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, ".."), proofPath = "evidence/2026-10-10T09-18-16-934Z-aiff-id3-direct-handle-native-attribution.json";
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), read = file => readFile(path.join(root, file));
const proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
async function restore(row) {
  assert.ok(row.path.startsWith("outputs/reports/2026-10-10T09-18-16-"));
  const bytes = await read(row.path); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
  const restored = gunzipSync(bytes, { maxOutputLength: 16777216 });
  assert.equal(restored.length, row.restoredBytes); assert.equal(sha(restored), row.restoredSha256); return restored;
}
assert.equal(proof.diagnosticOnly, true); assert.equal(proof.publicAcceptance, false); assert.equal(proof.failure, null);
for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), digest, file);
const previousPath = "evidence/2026-10-10T08-31-05-604Z-aiff-id3-direct-handle-stress.json", previousBytes = await read(previousPath), previous = JSON.parse(previousBytes);
for (const [file, digest] of Object.entries(previous.sourcePins)) assert.equal(proof.sourcePins[file], digest, file);
assert.equal(proof.fixture.sha256, previous.fixture.sha256); assert.deepEqual(proof.buildProof, previous.buildProof);
const report = JSON.parse(await restore(proof.retainedReports.find(row => row.path.endsWith(".json.gz"))));
const native = JSON.parse(await restore(proof.nativeAttributionEvidence)), result = native.result;
assert.equal(native.error, null); assert.equal(result.status, "completed-diagnostic");
assert.equal(native.phaseCount, 8); assert.equal(result.dumps.length, 8); assert.equal(result.allocatorSummary.length, 8);
assert.ok(result.dumps.every(row => row.memoryDump.success)); assert.equal(result.trace.dataLossOccurred, false);
assert.equal(result.trace.overflow, false); assert.equal(result.trace.parseError, null); assert.equal(result.samplingError, null);
assert.equal(result.summedAllocatorTotal, null); assert.equal(result.realmRowsEvicted, 0);
assert.equal(report.incrementalPrivateMiB, (report.peakPrivateBytes - report.blankBaseline.privateBytes) / 1048576);
assert.equal(report.runs.length, 3); assert.equal(report.cancellationCheck.passed, true);
for (const run of report.runs) {
  assert.equal(run.sha256, "8295fda722e8b578b18fa88bad0e9c6ae24ec35a27942900c998ddd6848f0dd2");
  assert.equal(run.outputBytes, 153600760); assert.equal(run.mediaProbe.withinValidation.passed, true);
  assert.equal(run.mediaProbe.withinArtworkValidation.passed, true); assert.equal(run.peakWasmMemoryBytes, 16777216);
}
const loaded = result.allocatorSummary.find(row => row.phase === "loaded-idle");
const largest = loaded.processes.filter(row => row.osType === "renderer")
  .sort((a, b) => (b.osPrivateBytesBeforeDump ?? -1) - (a.osPrivateBytesBeforeDump ?? -1))[0]; assert.ok(largest);
const providers = ["malloc", "blink_gc", "blink_gc/main", "blink_gc/workers", "partition_alloc", "v8", "gpu", "shared_memory"];
const selectedRows = result.allocatorSummary.map(row => ({ phase: row.phase, requestDumpGuid: row.requestDumpGuid,
  traceIntervalMicroseconds: row.traceIntervalMicroseconds,
  processes: row.processes.filter(process => process.pid === largest.pid || process.osType === "gpu-process").map(process => ({
    pid: process.pid, osType: process.osType, traceName: process.traceName,
    osPrivateBytesBeforeDump: process.osPrivateBytesBeforeDump, tracePrivateFootprintBytes: process.tracePrivateFootprintBytes,
    providers: Object.fromEntries(providers.map(name => [name, process.allocators[name] ?? null])),
  })), allocatorValuesOverlap: true, summedAllocatorTotal: null, acceptanceMetric: false }));
const nativeConversion = report.nativeMemory.phases.filter(row => /^conversion-[1-3]$/.test(row.phase));
const peakAccounting = nativeConversion.map(row => {
  assert.equal(row.peak[3], row.peak[7].reduce((total, process) => total + process[1], 0));
  return { phase: row.phase, validSamples: row.validSamples, unavailableSamples: row.unavailableSamples,
    peakPrivateBytes: row.peak[3], processCountAtPeak: row.peak[7].length, allRowsIncluded: true };
});
const workerCounts = native.phases.filter(phase => phase.startsWith("cleanup-")).map(phase => {
  const dump = result.dumps.find(row => row.phase === phase), timestamp = Date.parse(dump.timestamp);
  const before = result.realmRows.filter(row => row.finishedAt <= timestamp).at(-1), after = result.realmRows.find(row => row.startedAt >= timestamp);
  const summarize = row => row ? { startedAt: row.startedAt, finishedAt: row.finishedAt, targetsAvailable: row.value.targetsAvailable,
    workers: row.value.targets?.filter(target => target.type.includes("worker")) ?? null } : null;
  return { phase, before: summarize(before), after: summarize(after), noWorkerLeakInferredFromProviderBytes: true };
});
const output = "evidence/aiff-id3-native-attribution-analysis-2026-10-10.json";
const analysis = { recordedAt: new Date().toISOString(), status: "eight-real-bounded-native-dumps-observed-not-causal-fix-or-acceptance",
  proof: { path: proofPath, sha256: sha(proofBytes) }, previousFailure: { path: previousPath, sha256: sha(previousBytes),
    incrementalPrivateMiB: previous.reportSummary.incrementalPrivateMiB, remainsFailed: true },
  sameOriginalSourcesCoreInputAndOutput: true, diagnosticOnly: true, publicAcceptance: false, productionFix: false, speedImprovementProven: false,
  blankPrivateBytes: report.blankBaseline.privateBytes, loadedPrivateBytes: report.loadedIdle.privateBytes,
  peakPrivateBytes: report.peakPrivateBytes, incrementalPrivateMiB: report.incrementalPrivateMiB,
  runs: report.runs.map(run => ({ run: run.run, elapsedMs: run.elapsedMs, outputBytes: run.outputBytes, sha256: run.sha256,
    incrementalPrivateMiB: run.incrementalPrivateMiB, cleanupDeltaFromLoadedMiB: run.cleanupDeltaFromLoadedMiB })),
  peakAccounting, trace: result.trace, limits: result.limits, dumpCount: result.dumps.length,
  realmSamples: result.realmRows.length, realmRowsEvicted: result.realmRowsEvicted,
  largestLoadedRendererSelection: { pid: largest.pid, rule: "Largest OS-private renderer at loaded dump; not independently mapped to page target or allocator callsite" },
  selectedRows, workerCounts, fullAllProcessDumpRowsRetained: proof.nativeAttributionEvidence,
  allocatorValuesOverlap: true, summedAllocatorTotal: null, allocationCauseProven: false,
  caveat: "Allocator snapshots, OS samples and native peaks are distinct times. Light provider sizes may include garbage/reserves and overlap; not live-object attribution, leak proof, earlier failed-run cause or production acceptance. All OS descendants, including tracing/updater/unknown rows, remain counted.",
  next: "Investigate retained Blink/partition and transient renderer malloc with exact UI/writer lifecycle source and a controlled single-variable optimization. Do not replay unchanged acceptance or infer an allocator leak from snapshot sizes alone.",
  analyzerSha256: sha(await read("scripts/analyze-aiff-id3-native-attribution.mjs")) };
await writeFile(path.join(root, output), JSON.stringify(analysis, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: analysis.status, dumpCount: analysis.dumpCount, traceBytes: analysis.trace.serializedBytes,
  largestLoadedRendererPid: largest.pid, incrementalPrivateMiB: analysis.incrementalPrivateMiB, productionFix: false }));

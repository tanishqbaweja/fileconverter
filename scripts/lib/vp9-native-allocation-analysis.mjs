import assert from "node:assert/strict";
import { annotateNativeProcessTypes } from "./chromium-attribution.mjs";
import { VP9_NATIVE_PHASES } from "./vp9-native-allocation-diagnostic.mjs";
function birth(value) {
  const match = typeof value === "string" && /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?Z$/.exec(value);
  return match && Number.isFinite(Date.parse(match[1] + "Z")) ?
    `${Date.parse(match[1] + "Z")}:${(match[2] ?? "").padEnd(6, "0").slice(0, 6)}` : null;
}
const same = (a, b) => Boolean(a && b && a.pid === b.pid && a.parentPid === b.parentPid && birth(a.createdAt) !== null && birth(a.createdAt) === birth(b.createdAt));
const counter = (process, name, field) => {
  const value = process.liveAllocatorCounters?.[name]?.[field];
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
};
export function analyzeVp9NativeAllocation(receipt) {
  assert.equal(receipt.diagnosticPerturbsMemoryAndTiming, true);
  assert.equal(receipt.blankBaseline.stable, true); assert.equal(receipt.status, "failed-private-vp9-browser-smoke");
  const checkpoints = receipt.nativeAllocation.checkpoints;
  assert.deepEqual(checkpoints.map(row => row.label), VP9_NATIVE_PHASES);
  const originalPeak = receipt.memory.peak, root = originalPeak.processes.find(row => row.type === "browser"); assert.ok(root);
  const [peak] = annotateNativeProcessTypes([structuredClone(originalPeak)], [{ tree: receipt.loadedIdle },
    ...checkpoints.map(row => ({ tree: row.processSample }))], root.pid);
  assert.equal(peak.privateBytes, originalPeak.privateBytes);
  assert.equal(peak.processes.reduce((sum, row) => sum + row.privateBytes, 0), peak.privateBytes);
  const renderers = peak.processes.filter(row => row.type === "renderer").map(row => {
    const idle = receipt.loadedIdle.processes.find(before => same(row, before));
    return { ...row, loadedIdlePrivateBytes: idle?.privateBytes ?? null,
      diagnosticIncreaseSinceLoadedIdleBytes: idle ? row.privateBytes - idle.privateBytes : null };
  }).filter(row => row.diagnosticIncreaseSinceLoadedIdleBytes !== null)
    .sort((a, b) => b.diagnosticIncreaseSinceLoadedIdleBytes - a.diagnosticIncreaseSinceLoadedIdleBytes);
  const renderer = renderers[0]; assert.ok(renderer);
  const series = checkpoints.map(row => {
    assert.equal(row.error, null); assert.equal(row.result.acceptanceMetric, false); assert.equal(row.result.dataLossOccurred, false);
    const os = row.processSample.processes.find(process => same(process, renderer)); assert.ok(os, "Checkpoint must match peak renderer PID/parent/birth");
    const process = row.result.summary[0].processes.find(process => process.pid === renderer.pid);
    assert.ok(process && process.traceName === "Renderer");
    return { phase: row.label, acquiredBeforeDumpPrivateBytes: os.privateBytes,
      tracePrivateFootprintBytes: process.tracePrivateFootprintBytes, traceIntervalMicroseconds: row.result.summary[0].traceIntervalMicroseconds,
      mallocAllocatedObjectsBytes: counter(process, "malloc", "allocated_objects_size"),
      mallocReportedSizeBytes: counter(process, "malloc", "size"),
      mallocHistoricalMaximumAllocatedBytes: counter(process, "malloc/partitions/allocator", "max_allocated_size"),
      bufferAllocatedObjectsBytes: counter(process, "partition_alloc/partitions/buffer", "allocated_objects_size"),
      bufferReportedSizeBytes: counter(process, "partition_alloc/partitions/buffer", "size"),
      v8ReportedSizeBytes: counter(process, "v8", "size") };
  });
  const first = series[0], last = series.at(-1);
  const deltas = Object.fromEntries(["mallocAllocatedObjectsBytes", "mallocReportedSizeBytes", "bufferAllocatedObjectsBytes", "bufferReportedSizeBytes", "v8ReportedSizeBytes"]
    .map(key => [key, first[key] === null || last[key] === null ? null : last[key] - first[key]]));
  const incremental = (peak.privateBytes - receipt.blankBaseline.privateBytes) / 1048576;
  assert.equal(incremental, receipt.memory.incrementalPrivateMiB);
  return { scope: "Offline native category projection of a perturbed failed control; not allocation-stack causality or acceptance",
    browserVersion: receipt.browserPin.version, incrementalPrivateMiB: incremental,
    blankPrivateBytes: receipt.blankBaseline.privateBytes, simultaneousPeakPrivateBytes: peak.privateBytes,
    fullPeakProcessCount: peak.processes.length, dominantRenderer: renderer, series, loadedIdleToOutputClosedDeltas: deltas,
    allPrimaryProcessesRetained: true, counterNodesOverlap: true, summedAllocatorTotal: null,
    snapshotsAreNotPeakTimeAttribution: true, historicalMaximumIsNotSnapshotAllocation: true,
    noNativeAllocationStackIdentified: true, newBrowserRuns: 0, publicAcceptance: false, acceptedOptimization: false };
}

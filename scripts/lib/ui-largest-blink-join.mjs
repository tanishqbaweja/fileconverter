// Intersection of a PARTIAL type inventory only. Missing names are unavailable,
// never zero. Trace has PID but no birth; join additionally requires native birth.
import assert from "node:assert/strict";
export function joinUiLargestBlinkTypes(traceReports, rows) {
  assert.equal(traceReports.length, 2); assert.ok(traceReports.every(t => t.status === "completed-diagnostic"));
  const summaries = traceReports.map(t => { assert.equal(t.allocatorSummary.length, 1); return t.allocatorSummary[0]; });
  const [before, after] = summaries;
  const [a, b] = summaries.map(s => rows.find(r => r.phase === s.phase));
  assert.ok(a && b); const joined = [];
  for (const process of after.processes) {
    const old = before.processes.find(p => p.pid === process.pid);
    const native = b.processes?.find(p => p.pid === process.pid), oldNative = a.processes?.find(p => p.pid === process.pid);
    if (!old || !native || !oldNative || native.createdAt !== oldNative.createdAt || native.parentPid !== oldNative.parentPid) continue;
    const names = new Map((old.blinkTypeStatistics ?? []).map(t => [t.originalNameSha256, t]));
    const pairs = (process.blinkTypeStatistics ?? []).filter(t => names.has(t.originalNameSha256)).map(t => {
      const prior = names.get(t.originalNameSha256); assert.equal(prior.heap, t.heap);
      const delta = (x, y) => x == null || y == null ? null : x - y;
      return { name: t.name, type: t.type, fullNameSha256: t.originalNameSha256, heap: t.heap,
        beforeAllocatedObjectsBytes: prior.allocatedObjectsBytes, afterAllocatedObjectsBytes: t.allocatedObjectsBytes,
        deltaAllocatedObjectsBytes: delta(t.allocatedObjectsBytes, prior.allocatedObjectsBytes),
        beforeObjectCount: prior.objectCount, afterObjectCount: t.objectCount, deltaObjectCount: delta(t.objectCount, prior.objectCount),
        nondeterministicDumpMayIncludeGarbage: true, allocationCallsite: null, acceptanceMetric: false };
    }).sort((x, y) => (y.deltaAllocatedObjectsBytes ?? -Infinity) - (x.deltaAllocatedObjectsBytes ?? -Infinity));
    joined.push({ pid: process.pid, parentPid: native.parentPid, createdAt: native.createdAt,
      nativeType: native.type, traceName: process.traceName, nativeBirthMatched: true, traceBirthAvailable: false,
      beforeSelection: old.blinkTypeSelection ?? null, afterSelection: process.blinkTypeSelection ?? null,
      beforeHeaps: old.blinkHeapStatistics ?? [], afterHeaps: process.blinkHeapStatistics ?? [],
      types: pairs, retainedIntersectionOnly: true, absentTypesAreUnavailableNotZero: true,
      summedAllocatorDelta: null, originalConversionCause: null });
  }
  assert.ok(joined.length <= 64); return joined;
}

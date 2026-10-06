// Retain the brief heap child records omitted by the historical summary.
// Chromium's Blink provider distinguishes resident/committed/allocated/pooled
// bytes. These are not all live objects, disjoint totals, or a callsite proof.
import assert from "node:assert/strict";
import { summarizeMemoryInfraTrace as historicalSummary, traceHexBytes } from "./memory-infra-attribution.mjs";
export const BLINK_HEAP_LIMITS = Object.freeze({ heapsPerProcessPerDump: 16 });

export function summarizeMemoryInfraTrace(trace, rows) {
  const summaries = historicalSummary(trace, rows);
  for (const summary of summaries) {
    const [start, end] = summary.traceIntervalMicroseconds;
    for (const event of trace.traceEvents) {
      if (event.ph !== "v" || event.ts < start || event.ts > end || !event.args?.dumps) continue;
      const process = summary.processes.find(p => p.pid === event.pid);
      assert.ok(process, "Historical/global-GUID process join required");
      process.blinkHeapStatistics ??= [];
      for (const [name, allocator] of Object.entries(event.args.dumps.allocators ?? {})) {
        if (!/^blink_gc\/(?:main|workers(?:\/worker_0x[0-9a-f]+)?)\/heap$/i.test(name)) continue;
        assert.ok(process.blinkHeapStatistics.length < BLINK_HEAP_LIMITS.heapsPerProcessPerDump, "Blink heap record cap");
        assert.ok(!process.blinkHeapStatistics.some(row => row.name === name), "Duplicate Blink heap row");
        const bytes = field => {
          const attr = allocator.attrs?.[field];
          return attr?.type === "scalar" && attr.units === "bytes" ? traceHexBytes(attr.value) : null;
        };
        const residentBytes = bytes("size"), allocatedObjectsBytes = bytes("allocated_objects_size");
        process.blinkHeapStatistics.push({ name, residentBytes, committedBytes: bytes("committed_size"),
          allocatedObjectsBytes, pooledBytes: bytes("pooled_size"),
          unallocatedResidentBytes: residentBytes != null && allocatedObjectsBytes != null && residentBytes >= allocatedObjectsBytes
            ? residentBytes - allocatedObjectsBytes : null,
          nondeterministicDumpMayIncludeGarbage: true, allocationObjectOrCallsite: null,
          valuesOverlap: true, summedAllocatorTotal: null, acceptanceMetric: false });
      }
    }
  }
  return summaries;
}

// A bounded partial inventory, NOT a full type histogram, live heap or callsite.
// Inspect the already bounded trace; retain only largest64 plus8 unavailable.
import assert from "node:assert/strict";
import { summarizeMemoryInfraTrace as completeBriefSummary } from "./complete-blink-heap-summary.mjs";
import { traceHexBytes } from "./memory-infra-attribution.mjs";
import { boundedTypeIdentity } from "./bounded-detailed-blink-type-summary.mjs";
export const LARGEST_TYPE_LIMITS = Object.freeze({ knownRowsPerProcessPerDump: 64, unavailableRowsPerProcessPerDump: 8,
  inspectedRecordsPerProcessPerDump: 100000 });
const order = (a, b) => b.allocatedObjectsBytes - a.allocatedObjectsBytes || a.originalNameSha256.localeCompare(b.originalNameSha256);
export function summarizeMemoryInfraTrace(trace, rows) {
  const summaries = completeBriefSummary(trace, rows);
  for (const summary of summaries) {
    const [start, end] = summary.traceIntervalMicroseconds;
    for (const event of trace.traceEvents) {
      if (event.ph !== "v" || event.ts < start || event.ts > end || !event.args?.dumps) continue;
      const process = summary.processes.find(p => p.pid === event.pid); assert.ok(process);
      process.blinkTypeStatistics ??= []; process.unavailableBlinkTypeStatistics ??= [];
      process.blinkTypeSelection ??= { limits: LARGEST_TYPE_LIMITS, partialInventory: true, inspectedRecords: 0,
        zeroRecordsOmitted: 0, knownEligibleRecords: 0, unavailableRecords: 0, knownRecordsNotRetained: 0,
        unavailableRecordsNotRetained: 0, selection: "largest-known-allocated-object-bytes",
        recordCountsAreOccurrencesNotGuaranteedUniqueTypes: true, missingTypeMeansUnavailableNotZero: true,
        summedAllocatorTotal: null, acceptanceMetric: false };
      const selection = process.blinkTypeSelection;
      for (const [name, allocator] of Object.entries(event.args.dumps.allocators ?? {})) {
        const match = /^blink_objects\/(blink_gc\/(?:main|workers\/worker_0x[0-9a-f]+))\/(.+)$/i.exec(name);
        if (!match) continue;
        assert.ok(++selection.inspectedRecords <= LARGEST_TYPE_LIMITS.inspectedRecordsPerProcessPerDump, "Type scan cap");
        const value = (field, units) => {
          const attr = allocator.attrs?.[field];
          return attr?.type === "scalar" && attr.units === units ? traceHexBytes(attr.value) : null;
        };
        const allocatedObjectsBytes = value("allocated_objects_size", "bytes"), objectCount = value("object_count", "objects");
        if (allocatedObjectsBytes === 0 && objectCount === 0) { selection.zeroRecordsOmitted++; continue; }
        const unknown = allocatedObjectsBytes == null;
        if (unknown) selection.unavailableRecords++; else selection.knownEligibleRecords++;
        const retained = unknown ? process.unavailableBlinkTypeStatistics : process.blinkTypeStatistics;
        const limit = unknown ? LARGEST_TYPE_LIMITS.unavailableRowsPerProcessPerDump : LARGEST_TYPE_LIMITS.knownRowsPerProcessPerDump;
        const identity = boundedTypeIdentity(name, match[2]);
        assert.ok(!retained.some(r => r.originalNameSha256 === identity.originalNameSha256), "Duplicate retained type record");
        const row = { ...identity, heap: match[1], allocatedObjectsBytes, objectCount,
          nondeterministicDumpMayIncludeGarbage: true, allocationCallsite: null, valuesOverlap: true,
          summedAllocatorTotal: null, acceptanceMetric: false };
        if (unknown) { if (retained.length < limit) retained.push(row); }
        else if (retained.length < limit || order(row, retained.at(-1)) < 0) {
          if (retained.length === limit) retained.pop();
          retained.push(row); retained.sort(order);
        }
      }
      selection.knownRecordsNotRetained = selection.knownEligibleRecords - process.blinkTypeStatistics.length;
      selection.unavailableRecordsNotRetained = selection.unavailableRecords - process.unavailableBlinkTypeStatistics.length;
    }
  }
  return summaries;
}

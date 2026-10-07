// Long C++ template names need bounded identities, not a larger output cap.
// Zero/zero records are explicitly counted and discarded BEFORE name retention.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { summarizeMemoryInfraTrace as completeBriefSummary } from "./complete-blink-heap-summary.mjs";
import { traceHexBytes } from "./memory-infra-attribution.mjs";
export const BLINK_TYPE_LIMITS = Object.freeze({ nonzeroOrUnavailableTypesPerProcessPerDump: 512, nameCharacters: 1024 });
export function boundedTypeIdentity(name, type) {
  const digest = createHash("sha256").update(name).digest("hex");
  const bounded = value => value.length <= BLINK_TYPE_LIMITS.nameCharacters ? value : `${value.slice(0, BLINK_TYPE_LIMITS.nameCharacters - 80)}...[sha256:${digest}]`;
  return { name: bounded(name), type: bounded(type), originalNameSha256: digest,
    originalNameCharacters: name.length, originalTypeCharacters: type.length,
    typeNameTruncated: type.length > BLINK_TYPE_LIMITS.nameCharacters };
}
export function summarizeMemoryInfraTrace(trace, rows) {
  const summaries = completeBriefSummary(trace, rows);
  for (const summary of summaries) {
    const [start, end] = summary.traceIntervalMicroseconds;
    for (const event of trace.traceEvents) {
      if (event.ph !== "v" || event.ts < start || event.ts > end || !event.args?.dumps) continue;
      const process = summary.processes.find(p => p.pid === event.pid);
      assert.ok(process, "Validated global-GUID process join required");
      process.blinkTypeStatistics ??= []; process.zeroTypeRecordsOmitted ??= 0;
      for (const [name, allocator] of Object.entries(event.args.dumps.allocators ?? {})) {
        const match = /^blink_objects\/(blink_gc\/(?:main|workers\/worker_0x[0-9a-f]+))\/(.+)$/i.exec(name);
        if (!match) continue;
        const value = (field, units) => {
          const attr = allocator.attrs?.[field];
          return attr?.type === "scalar" && attr.units === units ? traceHexBytes(attr.value) : null;
        };
        const allocatedObjectsBytes = value("allocated_objects_size", "bytes"), objectCount = value("object_count", "objects");
        if (allocatedObjectsBytes === 0 && objectCount === 0) { process.zeroTypeRecordsOmitted++; continue; }
        assert.ok(process.blinkTypeStatistics.length < BLINK_TYPE_LIMITS.nonzeroOrUnavailableTypesPerProcessPerDump, "Nonzero/unavailable type record cap");
        const identity = boundedTypeIdentity(name, match[2]);
        assert.ok(!process.blinkTypeStatistics.some(row => row.originalNameSha256 === identity.originalNameSha256), "Duplicate aggregate type");
        process.blinkTypeStatistics.push({ ...identity, heap: match[1], allocatedObjectsBytes, objectCount,
          nondeterministicDumpMayIncludeGarbage: true, allocationCallsite: null, valuesOverlap: true,
          summedAllocatorTotal: null, acceptanceMetric: false });
      }
    }
  }
  return summaries;
}

// Schema inspection only: at most eight layouts/process/dump, no full type
// inventory. Used to diagnose unavailable fields without raising retention caps.
import assert from "node:assert/strict";
import { summarizeMemoryInfraTrace as completeBriefSummary } from "./complete-blink-heap-summary.mjs";
import { traceHexBytes } from "./memory-infra-attribution.mjs";
export function summarizeMemoryInfraTrace(trace, rows) {
  const summaries = completeBriefSummary(trace, rows);
  for (const summary of summaries) {
    const [start, end] = summary.traceIntervalMicroseconds;
    for (const event of trace.traceEvents) {
      if (event.ph !== "v" || event.ts < start || event.ts > end || !event.args?.dumps) continue;
      const process = summary.processes.find(p => p.pid === event.pid); assert.ok(process);
      process.detailedTypeSchema ??= { records: 0, byteFieldsAvailable: 0, countFieldsAvailable: 0,
        zeroByteFields: 0, nonzeroByteFields: 0, nonzeroCountFields: 0, maximumNameCharacters: 0,
        layouts: [], schemaOnly: true, acceptanceMetric: false, summedAllocatorTotal: null };
      const schema = process.detailedTypeSchema;
      for (const [name, allocator] of Object.entries(event.args.dumps.allocators ?? {})) {
        if (!/^blink_objects\/blink_gc\/(?:main|workers\/worker_0x[0-9a-f]+)\//i.test(name)) continue;
        assert.ok(++schema.records <= 100000, "Schema scan bounded by retained trace");
        schema.maximumNameCharacters = Math.max(schema.maximumNameCharacters, name.length);
        const attrs = allocator.attrs ?? {};
        const value = (field, units) => {
          const a = attrs[field]; return a?.type === "scalar" && a.units === units ? traceHexBytes(a.value) : null;
        };
        const bytes = value("allocated_objects_size", "bytes"), count = value("object_count", "objects");
        if (bytes != null) { schema.byteFieldsAvailable++; if (bytes === 0) schema.zeroByteFields++; else schema.nonzeroByteFields++; }
        if (count != null) { schema.countFieldsAvailable++; if (count > 0) schema.nonzeroCountFields++; }
        assert.ok(Object.keys(attrs).length <= 16, "Schema attribute cap");
        const layout = Object.entries(attrs).map(([field, a]) => ({ field: field.slice(0, 64),
          type: typeof a.type === "string" ? a.type.slice(0, 40) : null,
          units: typeof a.units === "string" ? a.units.slice(0, 40) : null, valueKind: typeof a.value }));
        const key = JSON.stringify(layout);
        if (!schema.layouts.some(row => row.key === key)) {
          assert.ok(schema.layouts.length < 8, "Schema layout cap");
          schema.layouts.push({ key, fields: layout });
        }
      }
    }
  }
  return summaries;
}

import assert from "node:assert/strict";
import test from "node:test";
import { summarizeMemoryInfraTrace } from "../scripts/lib/detailed-blink-type-schema.mjs";
test("schema-only inspection records unavailable units/layouts without synthesizing counts or retaining huge type names", () => {
  const a = (value, units) => ({ type: "scalar", units, value });
  const trace = { traceEvents: [
    { name: "GlobalMemoryDump", ph: "b", pid: 1, ts: 10, id2: { local: "a" }, args: { dump_guid: "g" } },
    { ph: "v", pid: 2, ts: 11, args: { dumps: { allocators: {
      [`blink_objects/blink_gc/main/${"Long".repeat(800)}`]: { attrs: { allocated_objects_size: a("0", "bytes"), object_count: a("0", "different") } },
      "blink_objects/blink_gc/main/A": { attrs: { allocated_objects_size: a("20", "bytes"), object_count: a("1", "objects") } },
    } } } },
    { name: "GlobalMemoryDump", ph: "e", pid: 1, ts: 12, id2: { local: "a" } },
  ] };
  const [summary] = summarizeMemoryInfraTrace(trace, [{ phase: "blank", memoryDump: { success: true, dumpGuid: "g" } }]);
  const schema = summary.processes[0].detailedTypeSchema;
  assert.equal(schema.records, 2); assert.equal(schema.byteFieldsAvailable, 2); assert.equal(schema.countFieldsAvailable, 1);
  assert.equal(schema.zeroByteFields, 1); assert.equal(schema.nonzeroByteFields, 1); assert.equal(schema.nonzeroCountFields, 1);
  assert.equal(schema.layouts.length, 2); assert.ok(schema.maximumNameCharacters > 1024);
  assert.equal(schema.schemaOnly, true); assert.equal(schema.acceptanceMetric, false);
  assert.ok(JSON.stringify(schema).length < 1500); assert.equal(summary.processes[0].blinkTypeStatistics, undefined);
});

import assert from "node:assert/strict";
import test from "node:test";
import { summarizeMemoryInfraTrace, traceHexBytes } from "../scripts/lib/memory-infra-attribution.mjs";

test("Memory trace hex bytes preserve unavailable values and reject unsafe integers", () => {
  assert.equal(traceHexBytes("1000000"), 16777216);
  assert.equal(traceHexBytes("0x20"), 32); assert.equal(traceHexBytes("0X20"), 32); assert.equal(traceHexBytes("0"), 0);
  for (const value of [null, undefined, "unavailable", "", 0, "20000000000000"]) assert.equal(traceHexBytes(value), null);
});

test("Explicit global GUID joins dump-time intervals, never serialized ordinal IDs or allocator sums", () => {
  const trace = { traceEvents: [
    { name: "GlobalMemoryDump", ph: "b", pid: 1, id2: { local: "0x9" }, args: { dump_guid: "0x9" }, ts: 100 },
    { name: "periodic_interval", ph: "v", pid: 2, id: "0x0", ts: 110, args: { dumps: {
      process_totals: { private_footprint_bytes: "1000000" }, allocators: {
        v8: { attrs: { size: { type: "scalar", units: "bytes", value: "200" } } },
        "v8/main/heap/code_space": { attrs: { size: { type: "scalar", units: "bytes", value: "100" } } },
        unavailable: { attrs: { size: { type: "scalar", units: "bytes", value: "unknown" } } } } } } },
    { name: "GlobalMemoryDump", ph: "e", pid: 1, id2: { local: "0x9" }, args: {}, ts: 120 },
    { name: "periodic_interval", ph: "v", pid: 9, id: "0x9", ts: 200, args: { dumps: {} } },
  ] };
  const result = summarizeMemoryInfraTrace(trace, [{ phase: "loaded", memoryDump: { success: true, dumpGuid: "0x9" } }])[0];
  assert.deepEqual(result.serializedDumpIds, ["0x0"]); assert.equal(result.processes.length, 1);
  assert.equal(result.processes[0].osPrivateBytesBeforeDump, null);
  assert.equal(result.processes[0].tracePrivateFootprintBytes, 16777216);
  assert.equal(result.processes[0].allocators.unavailable.size, null);
  assert.equal(result.summedAllocatorTotal, null); assert.equal(result.acceptanceMetric, false);
  assert.throws(() => summarizeMemoryInfraTrace({ traceEvents: [] }, [{ memoryDump: { success: true, dumpGuid: "0x9" } }]));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { summarizeMemoryInfraTrace } from "../scripts/lib/detailed-blink-type-summary.mjs";
import { makeDetailedBlinkAttribution, makeDetailedBlinkControl } from "../scripts/lib/detailed-blink-attribution-recipe.mjs";
const attr = (value, units) => ({ type: "scalar", units, value });
const type = (bytes, count) => ({ attrs: { allocated_objects_size: attr(bytes, "bytes"), object_count: attr(count, "objects") } });
const trace = allocators => ({ traceEvents: [
  { name: "GlobalMemoryDump", ph: "b", pid: 1, ts: 10, id2: { local: "a" }, args: { dump_guid: "g" } },
  { ph: "v", pid: 2, ts: 11, args: { dumps: { allocators } } },
  { name: "GlobalMemoryDump", ph: "e", pid: 1, ts: 12, id2: { local: "a" } },
] });
const rows = [{ phase: "control", memoryDump: { success: true, dumpGuid: "g" } }];
test("detailed types retain validated aggregate byte/count fields only, disclose zero omissions and never double-count pages", () => {
  const [summary] = summarizeMemoryInfraTrace(trace({
    "blink_objects/blink_gc/main/blink::Node (0x1)": type("100", "3"),
    "blink_objects/blink_gc/workers/worker_0xA123/InternalNode (0x2)": type("40", "1"),
    "blink_objects/blink_gc/main/Empty (0x3)": type("0", "0"),
    "blink_gc/main/heap/NormalPageSpace/pages/page_0/types/blink::Node (0x1)": type("100", "3"),
  }), rows);
  const process = summary.processes[0];
  assert.equal(process.blinkTypeStatistics.length, 2); assert.equal(process.zeroTypeRecordsOmitted, 1);
  const t = process.blinkTypeStatistics[0]; assert.equal(t.allocatedObjectsBytes, 256); assert.equal(t.objectCount, 3);
  assert.equal(t.allocationCallsite, null); assert.equal(t.nondeterministicDumpMayIncludeGarbage, true);
  assert.equal(t.acceptanceMetric, false); assert.equal(t.summedAllocatorTotal, null);
});
test("unavailable counts are not omitted as zeros; malformed units, record/name overflows and ambiguous GUIDs fail safely", () => {
  const invalid = type("20", "0"); invalid.attrs.object_count.units = "bytes";
  const [summary] = summarizeMemoryInfraTrace(trace({ "blink_objects/blink_gc/main/Unknown": invalid }), rows);
  assert.equal(summary.processes[0].blinkTypeStatistics[0].objectCount, null);
  const tooMany = Object.fromEntries(Array.from({ length: 513 }, (_, i) => [`blink_objects/blink_gc/main/T${i}`, type("1", "1")]));
  assert.throws(() => summarizeMemoryInfraTrace(trace(tooMany), rows), /record cap/);
  assert.throws(() => summarizeMemoryInfraTrace(trace({ [`blink_objects/blink_gc/main/${"x".repeat(1024)}`]: type("1", "1") }), rows), /name cap/);
  assert.throws(() => summarizeMemoryInfraTrace({ traceEvents: [] }, rows), /Unique/);
});
test("strict detailed derivative explicitly changes mode without relaxing caps, forcing GC or rewriting the original workflow", async () => {
  const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
  const helper = await read("scripts/lib/bounded-renderer-attribution.mjs"), generated = makeDetailedBlinkAttribution(helper, root);
  for (const token of ['allowed_dump_modes: ["detailed"]', 'levelOfDetail: "detailed"', 'deterministic: false',
    'chromiumBufferBytes: 4194304', 'maximumSerializedBytes: 16777216', 'maximumDumps: 8', 'maximumRealmRows: 1024'])
    assert.ok(generated.includes(token), token);
  assert.throws(() => makeDetailedBlinkAttribution(helper + "\n", root));
  const control = makeDetailedBlinkControl(await read("scripts/probe-native-burst-attribution.mjs"), root, "file:///approved/attribution.mjs");
  assert.ok(control.includes("new Uint8Array(40 * 1048576)")); assert.ok(control.includes("await observer.through(phaseAt)"));
  assert.ok(control.includes("-detailed-blink-type-control.json")); assert.ok(control.includes("sampledIdentitiesAbsent"));
});

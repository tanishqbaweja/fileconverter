import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { summarizeMemoryInfraTrace } from "../scripts/lib/largest-blink-type-summary.mjs";
import { makeDetailedBlinkAttribution, makeSingleDetailedBlinkControl, makeLargestTypeDriver } from "../scripts/lib/largest-blink-attribution-recipe.mjs";
const attr = (value, units) => ({ type: "scalar", units, value });
const allocator = (bytes, count) => ({ attrs: { allocated_objects_size: attr(bytes, "bytes"), object_count: attr(count, "objects") } });
const summarize = allocators => summarizeMemoryInfraTrace({ traceEvents: [
  { name: "GlobalMemoryDump", ph: "b", pid: 1, ts: 10, id2: { local: "a" }, args: { dump_guid: "g" } },
  { ph: "v", pid: 2, ts: 11, args: { dumps: { allocators } } },
  { name: "GlobalMemoryDump", ph: "e", pid: 1, ts: 12, id2: { local: "a" } },
] }, [{ phase: "blank", memoryDump: { success: true, dumpGuid: "g" } }])[0].processes[0];
test("largest64 selector scans over512 records with bounded retention, exact ranked values and explicit omissions", () => {
  const entries = Array.from({ length: 1020 }, (_, i) => [`blink_objects/blink_gc/main/T${i}`, allocator((i + 1).toString(16), "1")]);
  const p = summarize(Object.fromEntries(entries));
  assert.equal(p.blinkTypeStatistics.length, 64); assert.equal(p.blinkTypeStatistics[0].allocatedObjectsBytes, 1020);
  assert.equal(p.blinkTypeStatistics.at(-1).allocatedObjectsBytes, 957);
  assert.equal(p.blinkTypeSelection.inspectedRecords, 1020); assert.equal(p.blinkTypeSelection.knownRecordsNotRetained, 956);
  assert.equal(p.blinkTypeSelection.partialInventory, true); assert.equal(p.blinkTypeSelection.summedAllocatorTotal, null);
  assert.equal(p.blinkTypeSelection.missingTypeMeansUnavailableNotZero, true);
  const reversed = summarize(Object.fromEntries(entries.reverse()));
  assert.deepEqual(reversed.blinkTypeStatistics, p.blinkTypeStatistics);
});
test("unavailable values have a separate eight-row cap; zeros are disclosed, never used for unknown records", () => {
  const entries = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`blink_objects/blink_gc/main/U${i}`, allocator("nothex", "2")]));
  entries["blink_objects/blink_gc/main/Zero"] = allocator("0", "0");
  entries["blink_objects/blink_gc/main/CountUnavailable"] = allocator("10", "nothex");
  const p = summarize(entries);
  assert.equal(p.unavailableBlinkTypeStatistics.length, 8); assert.equal(p.blinkTypeSelection.unavailableRecords, 12);
  assert.equal(p.blinkTypeSelection.unavailableRecordsNotRetained, 4); assert.equal(p.blinkTypeSelection.zeroRecordsOmitted, 1);
  assert.equal(p.blinkTypeStatistics[0].objectCount, null); assert.equal(p.unavailableBlinkTypeStatistics[0].allocatedObjectsBytes, null);
});
test("largest64 derivative changes only parser/report bindings, preserving one actual dump/no allocation/all trace caps", async () => {
  const root = path.resolve(import.meta.dirname, ".."), read = f => readFile(path.join(root, f), "utf8");
  const helper = makeDetailedBlinkAttribution(await read("scripts/lib/bounded-renderer-attribution.mjs"), root);
  for (const token of ['chromiumBufferBytes: 4194304', 'maximumSerializedBytes: 16777216', 'deterministic: false', 'levelOfDetail: "detailed"'])
    assert.ok(helper.includes(token), token);
  const control = makeSingleDetailedBlinkControl(await read("scripts/probe-native-burst-attribution.mjs"), root, "file:///approved/attribution.mjs");
  assert.equal(control.match(/await attribution.dump\(/g)?.length, 1); assert.ok(control.includes('syntheticAllocationBytes: 0'));
  const source = await read("scripts/probe-single-detailed-blink-types.mjs");
  assert.ok(makeLargestTypeDriver(source, root).includes('evidence/largest-blink-type-control-2026-10-07.json'));
  assert.throws(() => makeLargestTypeDriver(source + "\n", root));
});

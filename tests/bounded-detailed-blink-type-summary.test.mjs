import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { boundedTypeIdentity, summarizeMemoryInfraTrace } from "../scripts/lib/bounded-detailed-blink-type-summary.mjs";
import { makeBoundedTypeDriver, makeDetailedBlinkAttribution, makeSingleDetailedBlinkControl } from "../scripts/lib/bounded-name-detailed-blink-recipe.mjs";
const sha = text => createHash("sha256").update(text).digest("hex");
test("long type names keep distinct full SHA identities without exceeding the unchanged 1024-character retention cap", () => {
  const type = "Cxx<" + "Template".repeat(700) + ">", name = `blink_objects/blink_gc/main/${type}`;
  const a = boundedTypeIdentity(name, type), b = boundedTypeIdentity(name + "x", type + "x");
  assert.ok(a.name.length <= 1024 && a.type.length <= 1024); assert.equal(a.originalNameSha256, sha(name));
  assert.equal(a.originalNameCharacters, name.length); assert.equal(a.typeNameTruncated, true);
  assert.notEqual(a.originalNameSha256, b.originalNameSha256); assert.notEqual(a.name, b.name);
});
test("zero-only long template names are counted but not retained, nonzero counts/bytes stay exact", () => {
  const attr = (value, units) => ({ type: "scalar", units, value });
  const allocator = (bytes, count) => ({ attrs: { allocated_objects_size: attr(bytes, "bytes"), object_count: attr(count, "objects") } });
  const long = "X".repeat(3000), trace = { traceEvents: [
    { name: "GlobalMemoryDump", ph: "b", pid: 1, ts: 10, id2: { local: "a" }, args: { dump_guid: "g" } },
    { ph: "v", pid: 2, ts: 11, args: { dumps: { allocators: {
      [`blink_objects/blink_gc/main/${long}`]: allocator("0", "0"),
      [`blink_objects/blink_gc/main/${long}active`]: allocator("20", "1"),
    } } } },
    { name: "GlobalMemoryDump", ph: "e", pid: 1, ts: 12, id2: { local: "a" } },
  ] };
  const [s] = summarizeMemoryInfraTrace(trace, [{ phase: "blank", memoryDump: { success: true, dumpGuid: "g" } }]);
  const p = s.processes[0]; assert.equal(p.zeroTypeRecordsOmitted, 1); assert.equal(p.blinkTypeStatistics.length, 1);
  assert.equal(p.blinkTypeStatistics[0].allocatedObjectsBytes, 32); assert.equal(p.blinkTypeStatistics[0].objectCount, 1);
  assert.equal(p.blinkTypeStatistics[0].allocationCallsite, null);
});
test("bounded-name derivative keeps one dump, fixed trace caps/no GC and immutable failed sources", async () => {
  const root = path.resolve(import.meta.dirname, ".."), read = f => readFile(path.join(root, f), "utf8");
  const helper = makeDetailedBlinkAttribution(await read("scripts/lib/bounded-renderer-attribution.mjs"), root);
  assert.ok(helper.includes('chromiumBufferBytes: 4194304')); assert.ok(helper.includes('maximumSerializedBytes: 16777216'));
  assert.ok(helper.includes('deterministic: false')); assert.ok(helper.includes('bounded-detailed-blink-type-summary.mjs'));
  const control = makeSingleDetailedBlinkControl(await read("scripts/probe-native-burst-attribution.mjs"), root, "file:///approved/attribution.mjs");
  assert.equal(control.match(/await attribution.dump\(/g)?.length, 1); assert.ok(control.includes('syntheticAllocationBytes: 0'));
  const driver = await read("scripts/probe-single-detailed-blink-types.mjs");
  assert.ok(makeBoundedTypeDriver(driver, root).includes('evidence/bounded-detailed-blink-type-control-2026-10-07.json'));
  assert.throws(() => makeBoundedTypeDriver(driver + "\n", root));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { summarizeMemoryInfraTrace } from "../scripts/lib/complete-blink-heap-summary.mjs";
import { makeCompleteBlinkAttribution, makeCompleteBlinkControl } from "../scripts/lib/complete-blink-attribution-recipe.mjs";
const attr = (value, units = "bytes") => ({ type: "scalar", units, value });
const trace = allocators => ({ traceEvents: [
  { name: "GlobalMemoryDump", ph: "b", pid: 1, ts: 10, id2: { local: "a" }, args: { dump_guid: "g" } },
  { ph: "v", pid: 2, ts: 11, args: { dumps: { allocators } } },
  { name: "GlobalMemoryDump", ph: "e", pid: 1, ts: 12, id2: { local: "a" } },
] });
const rows = [{ phase: "control", memoryDump: { success: true, dumpGuid: "g" } }];
test("brief Blink child rows retain distinct committed, resident, allocated and pooled metrics without sums", () => {
  const [summary] = summarizeMemoryInfraTrace(trace({ "blink_gc/main/heap": { attrs: {
    size: attr("100"), committed_size: attr("180"), allocated_objects_size: attr("40"), pooled_size: attr("20") } },
    "blink_gc/workers/worker_0xA123/heap": { attrs: { size: attr("80"), allocated_objects_size: attr("10") } },
    "blink_gc/main/heap/NormalPageSpace": { attrs: { size: attr("100") } },
  }), rows);
  const heaps = summary.processes[0].blinkHeapStatistics;
  assert.equal(heaps.length, 2); assert.equal(heaps[0].residentBytes, 256); assert.equal(heaps[0].committedBytes, 384);
  assert.equal(heaps[0].allocatedObjectsBytes, 64); assert.equal(heaps[0].pooledBytes, 32);
  assert.equal(heaps[0].unallocatedResidentBytes, 192); assert.equal(heaps[0].nondeterministicDumpMayIncludeGarbage, true);
  assert.equal(heaps[0].acceptanceMetric, false); assert.equal(heaps[0].summedAllocatorTotal, null);
  assert.equal(heaps[1].committedBytes, null);
});
test("missing, wrong-unit, unsafe or inconsistent heap values stay unavailable, never synthetic zero/live bytes", () => {
  const [summary] = summarizeMemoryInfraTrace(trace({ "blink_gc/main/heap": { attrs: {
    size: attr("10"), committed_size: attr("20000000000000"), allocated_objects_size: attr("20"), pooled_size: attr("3", "objects") } } }), rows);
  const heap = summary.processes[0].blinkHeapStatistics[0];
  assert.equal(heap.unallocatedResidentBytes, null); assert.equal(heap.committedBytes, null); assert.equal(heap.pooledBytes, null);
});
test("heap retention and GUID admission remain bounded and reject invalid traces", () => {
  const many = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`blink_gc/workers/worker_0x${i.toString(16)}/heap`, { attrs: {} }]));
  assert.throws(() => summarizeMemoryInfraTrace(trace(many), rows), /record cap/);
  assert.throws(() => summarizeMemoryInfraTrace({ traceEvents: [] }, rows), /Unique/);
});
test("summary-only helper derivative and real control bindings are byte-reversible and refuse baseline mutations", async () => {
  const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
  const helper = await read("scripts/lib/bounded-renderer-attribution.mjs");
  const generated = makeCompleteBlinkAttribution(helper, root);
  assert.ok(generated.includes("complete-blink-heap-summary.mjs"));
  for (const token of ['recordMode: "recordUntilFull"', 'levelOfDetail: "light"', 'deterministic: false', 'chromiumBufferBytes: 4194304'])
    assert.ok(generated.includes(token), token);
  assert.throws(() => makeCompleteBlinkAttribution(helper + "\n", root));
  const control = await read("scripts/probe-native-burst-attribution.mjs");
  const bound = makeCompleteBlinkControl(control, root, "file:///approved-control/attribution.mjs");
  assert.ok(bound.includes("await observer.through(phaseAt)"));
  assert.ok(bound.includes("new Uint8Array(40 * 1048576)"));
  assert.ok(bound.includes("completedReport = report"));
  assert.throws(() => makeCompleteBlinkControl(control + "\n", root, "file:///approved-control/attribution.mjs"));
});

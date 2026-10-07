import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeUiLargestBlinkControl } from "../scripts/lib/ui-largest-blink-recipe.mjs";
import { joinUiLargestBlinkTypes } from "../scripts/lib/ui-largest-blink-join.mjs";
test("real UI derivative keeps original selections/source/privacy/finally but closes each one-dump trace independently", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8");
  const generated = makeUiLargestBlinkControl(source, root, "file:///approved/attribution.mjs");
  for (const token of ['for (let i = 0; i < 60; i++)', 'await verifySource()', 'jobState, "idle"',
    'traceReports.length < 2', 'attribution.stop(); traceReports.push(trace); attribution = null', 'realms?.close()', 'assert.deepEqual(forbidden, [])'])
    assert.ok(generated.includes(token), token);
  assert.equal(generated.match(/attribution = await startBoundedRendererAttribution/g)?.length, 1);
  assert.equal(generated.includes('Memory.startSampling'), false);
  assert.throws(() => makeUiLargestBlinkControl(source + "\n", root, "file:///approved/attribution.mjs"));
});
test("partial-inventory join requires actual native birth/parent, intersects full hashes and never creates absent-type zeros", () => {
  const type = (hash, bytes, count) => ({ name: hash, type: hash, originalNameSha256: hash, heap: "blink_gc/main", allocatedObjectsBytes: bytes, objectCount: count });
  const process = (pid, types) => ({ pid, blinkTypeStatistics: types });
  const trace = (phase, processes) => ({ status: "completed-diagnostic", allocatorSummary: [{ phase, processes }] });
  const traces = [trace("before", [process(2, [type("a", 10, 2), type("missing-after", 40, 3)]), process(3, [type("reuse", 1, 1)])]),
    trace("after", [process(2, [type("a", 30, null), type("missing-before", 100, 9)]), process(3, [type("reuse", 9, 2)])])];
  const rows = [{ phase: "before", processes: [{ pid: 2, parentPid: 1, createdAt: "same" }, { pid: 3, parentPid: 1, createdAt: "old" }] },
    { phase: "after", processes: [{ pid: 2, parentPid: 1, createdAt: "same" }, { pid: 3, parentPid: 1, createdAt: "new" }] }];
  const joined = joinUiLargestBlinkTypes(traces, rows);
  assert.equal(joined.length, 1); assert.equal(joined[0].types.length, 1); assert.equal(joined[0].types[0].deltaAllocatedObjectsBytes, 20);
  assert.equal(joined[0].types[0].deltaObjectCount, null); assert.equal(joined[0].traceBirthAvailable, false);
  assert.equal(joined[0].summedAllocatorDelta, null); assert.equal(joined[0].absentTypesAreUnavailableNotZero, true);
});
